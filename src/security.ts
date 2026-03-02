/**
 * Security module for Codex MCP Server.
 * Path validation, error sanitization, and concurrency control.
 */

import { existsSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';

// ─── Path Validation ───

export interface PathValidationResult {
  valid: boolean;
  resolved: string;
  error?: string;
}

/**
 * Validate a working directory path for safety.
 * Prevents path traversal attacks and restricts access to allowed directories.
 */
export function validateWorkingDir(
  inputPath: string,
  allowedRoots: string[],
): PathValidationResult {
  if (!inputPath || !inputPath.trim()) {
    return { valid: false, resolved: '', error: 'Path is empty' };
  }

  // resolve() canonicalizes: collapses ../, ./, converts relative to absolute
  const resolved = resolve(inputPath);

  // Must exist before we can check symlinks
  if (!existsSync(resolved)) {
    return {
      valid: false,
      resolved: '',
      error: `Path "${resolved}" does not exist`,
    };
  }

  // realpathSync follows symlinks to get the actual target.
  // Without this, a symlink like /home/user/projects/evil -> /etc/ would bypass the check.
  let realPath: string;
  try {
    realPath = realpathSync(resolved);
  } catch {
    return {
      valid: false,
      resolved: '',
      error: `Cannot resolve real path for "${resolved}"`,
    };
  }

  // Check against each allowed root with boundary-aware comparison.
  // "realPath === root" handles exact match (e.g. /home/user).
  // "realPath.startsWith(root + '/')" prevents /home/user matching /home/username.
  const isAllowed = allowedRoots.some((root) => {
    const normalizedRoot = resolve(root);
    return realPath === normalizedRoot || realPath.startsWith(`${normalizedRoot}/`);
  });

  if (!isAllowed) {
    return {
      valid: false,
      resolved: '',
      error: `Path "${realPath}" is outside allowed directories`,
    };
  }

  return { valid: true, resolved: realPath };
}

// ─── Error Sanitization ───

const SENSITIVE_PATTERNS = [
  /\/home\/[^/\s]+/g, // home directory paths
  /\/Users\/[^/\s]+/g, // macOS home paths
  /\/root\b/g, // root home
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/g, // email addresses
  /(?:key|token|secret|password|api_key)=\S+/gi, // credential assignments
  /sk-[A-Za-z0-9_-]{20,}/g, // OpenAI API keys (sk-proj-..., sk-ant-...)
  /ghp_[A-Za-z0-9]{36}/g, // GitHub personal tokens
];

/**
 * Strip sensitive information from error output before returning to MCP client.
 */
export function sanitizeErrorOutput(text: string): string {
  let sanitized = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }
  return sanitized;
}

// ─── Concurrency Control ───

/**
 * Simple counting semaphore for limiting concurrent Codex processes.
 */
export class ProcessSemaphore {
  private current = 0;
  private readonly max: number;
  private readonly waitQueue: Array<() => void> = [];

  constructor(maxConcurrent: number) {
    this.max = maxConcurrent;
  }

  async acquire(): Promise<void> {
    if (this.current < this.max) {
      this.current++;
      return;
    }

    return new Promise<void>((resolve) => {
      this.waitQueue.push(() => {
        this.current++;
        resolve();
      });
    });
  }

  release(): void {
    this.current--;
    const next = this.waitQueue.shift();
    if (next) next();
  }

  get activeCount(): number {
    return this.current;
  }

  get waitingCount(): number {
    return this.waitQueue.length;
  }
}

// ─── Prompt Input Limits ───

export const INPUT_LIMITS = {
  TASK_DESCRIPTION: 10_000,
  CONTEXT: 50_000,
  CODE_REVIEW: 100_000,
  FILE_PATH: 500,
  LANGUAGE: 50,
} as const;

// ─── Prompt Injection Defense ───

interface InjectionPattern {
  pattern: RegExp;
  label: string;
  action: 'log' | 'strip';
}

/**
 * Prompt injection detection patterns.
 *
 * 'strip' patterns: instruction override 계열. 정당한 코드 생성에서 거의 안 쓰이므로 제거해도 안전하다.
 * 'log' patterns: jailbreak/role-play/exfiltration 계열. 보안 관련 코드에서 정당하게 등장할 수 있으므로 경고만 한다.
 *
 * RegExp에 g 플래그를 쓰지 않는다. test()의 lastIndex 상태 문제를 피하기 위함이다.
 */
const INJECTION_PATTERNS: InjectionPattern[] = [
  // ─── Strip: instruction override (오탐 위험 낮음) ───
  {
    pattern: /ignore\s+(all\s+)?previous\s+instructions/i,
    label: 'instruction-override',
    action: 'strip',
  },
  {
    pattern: /disregard\s+(all\s+)?(previous|above|prior)\s+(instructions|rules|guidelines)/i,
    label: 'instruction-disregard',
    action: 'strip',
  },
  {
    pattern: /forget\s+(all\s+)?(your|previous|prior)\s+(instructions|rules|constraints)/i,
    label: 'instruction-forget',
    action: 'strip',
  },
  {
    pattern: /new\s+instructions?\s*:/i,
    label: 'new-instructions',
    action: 'strip',
  },
  // ─── Log: role/jailbreak/exfiltration (오탐 가능성 있어 로그만) ───
  {
    pattern: /you\s+are\s+now\s+(a|an|my)\b/i,
    label: 'role-reassignment',
    action: 'log',
  },
  {
    pattern: /\bDo\s+Anything\s+Now\b/i,
    label: 'jailbreak-DAN',
    action: 'log',
  },
  {
    pattern: /\bdeveloper\s+mode\s+(enabled|activated)\b/i,
    label: 'jailbreak-devmode',
    action: 'log',
  },
  {
    pattern: /(output|show|reveal|repeat|print)\s+(your|the)\s+system\s+prompt/i,
    label: 'data-exfiltration',
    action: 'log',
  },
];

/**
 * Sanitize user input before embedding in LLM prompts.
 *
 * Defense layers:
 * 1. Length truncation (prevents abuse)
 * 2. Delimiter escaping (prevents structural breakout)
 * 3. Injection pattern detection (detects known attack patterns)
 * 4. Structural prompt delimiters (in prompts.ts - primary defense)
 */
export function sanitizePromptInput(input: string, maxLength: number): string {
  // Layer 1: Enforce length limit
  let result = input.length > maxLength ? input.slice(0, maxLength) : input;

  // Layer 2: Escape structural delimiters to prevent tag breakout
  result = escapePromptDelimiters(result);

  // Layer 3: Detect and handle injection patterns
  for (const { pattern, label, action } of INJECTION_PATTERNS) {
    if (pattern.test(result)) {
      console.error(`[security] Prompt injection detected: ${label}`);
      if (action === 'strip') {
        result = result.replace(pattern, '[FILTERED]');
      }
    }
  }

  return result;
}

/**
 * Escape XML-like delimiters used in prompt structural boundaries.
 * Prevents user input from closing/opening prompt template tags.
 */
function escapePromptDelimiters(text: string): string {
  return text.replace(
    /<\/?(task|context|review_code)\b[^>]*>/gi,
    (match) => match.replace('<', '\\<').replace('>', '\\>'),
  );
}
