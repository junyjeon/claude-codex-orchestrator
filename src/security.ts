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
