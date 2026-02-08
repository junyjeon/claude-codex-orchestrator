/**
 * Codex CLI wrapper with spawn + stdin pipe for security.
 * Evolved from v0.2.0: adds --json, --full-auto, --cd support.
 */

import { spawn } from 'node:child_process';
import { ProcessSemaphore, sanitizeErrorOutput } from '../security.js';
import {
  type CodexError,
  CodexErrorCode,
  type CodexExecOptions,
  type CodexResult,
} from '../types/index.js';
import { buildCodexResult, parseJsonlStream } from './parser.js';

const MAX_OUTPUT_SIZE = 1024 * 1024; // 1MB

// Global semaphore, initialized lazily with configurable max
let semaphore: ProcessSemaphore | null = null;

export function initSemaphore(maxConcurrent: number): void {
  semaphore = new ProcessSemaphore(maxConcurrent);
}

export function getSemaphore(): ProcessSemaphore | null {
  return semaphore;
}

/**
 * Build CLI arguments from options.
 * If both fullAuto and approvalMode are set, approvalMode takes precedence.
 */
export function buildArgs(options: CodexExecOptions): string[] {
  const args: string[] = ['exec'];

  if (options.json) args.push('--json');

  // approvalMode takes precedence over fullAuto to prevent conflict
  if (options.approvalMode) {
    args.push('--ask-for-approval', options.approvalMode as string);
  } else if (options.fullAuto) {
    args.push('--full-auto');
  }

  if (options.sandbox) args.push('--sandbox', options.sandbox as string);
  if (options.workingDir) args.push('--cd', options.workingDir);
  if (options.skipGitRepoCheck) args.push('--skip-git-repo-check');

  args.push('-'); // read prompt from stdin
  return args;
}

/**
 * Calls Codex CLI using spawn + stdin pipe (secure).
 * Acquires semaphore before spawning, releases on completion.
 */
export async function callCodex(
  prompt: string,
  options: CodexExecOptions = {},
): Promise<CodexResult> {
  const timeout = options.timeout ?? 30000;

  // Acquire semaphore if initialized
  if (semaphore) {
    await semaphore.acquire();
  }

  return new Promise((resolve) => {
    let resolved = false;
    let timeoutId: NodeJS.Timeout | null = null;

    const args = buildArgs(options);
    const child = spawn('codex', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Safe resolve - ensures single resolution, cleanup, and semaphore release
    const safeResolve = (result: CodexResult) => {
      if (resolved) return;
      resolved = true;

      if (timeoutId) clearTimeout(timeoutId);
      child.removeAllListeners();
      if (!child.killed) {
        child.kill('SIGTERM');
      }

      // Sanitize error details before returning
      const sanitized = result.error?.details
        ? {
            ...result,
            error: { ...result.error, details: sanitizeErrorOutput(result.error.details) },
          }
        : result;

      // Release semaphore
      if (semaphore) {
        semaphore.release();
      }

      resolve(sanitized);
    };

    // Output collection with size limit
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutSize = 0;
    let stderrSize = 0;

    child.stdout.on('data', (data: Buffer) => {
      stdoutSize += data.length;
      if (stdoutSize > MAX_OUTPUT_SIZE) {
        safeResolve({
          success: false,
          events: [],
          finalMessage: '',
          filesChanged: [],
          commandsRun: [],
          error: {
            code: CodexErrorCode.OUTPUT_TOO_LARGE,
            message: 'Output exceeds 1MB limit',
            details: `Output size: ${(stdoutSize / 1024 / 1024).toFixed(2)}MB`,
          },
        });
        return;
      }
      stdoutChunks.push(data);
    });

    child.stderr.on('data', (data: Buffer) => {
      stderrSize += data.length;
      if (stderrSize <= MAX_OUTPUT_SIZE) {
        stderrChunks.push(data);
      }
    });

    // Handle process errors (ENOENT, EACCES, etc.)
    child.on('error', (error: NodeJS.ErrnoException) => {
      const codexError: CodexError = {
        code: CodexErrorCode.UNKNOWN,
        message: 'Failed to start Codex CLI',
        details: error.message,
      };

      if (error.code === 'ENOENT') {
        codexError.code = CodexErrorCode.NOT_FOUND;
        codexError.message = 'Codex CLI not found';
        codexError.details = 'Install: npm install -g @openai/codex';
      } else if (error.code === 'EACCES') {
        codexError.code = CodexErrorCode.PERMISSION_DENIED;
        codexError.message = 'Permission denied';
        codexError.details = 'Check: chmod +x $(which codex)';
      }

      safeResolve({
        success: false,
        events: [],
        finalMessage: '',
        filesChanged: [],
        commandsRun: [],
        error: codexError,
      });
    });

    // Handle process exit
    child.on('close', (code, signal) => {
      if (resolved) return;

      const stdout = Buffer.concat(stdoutChunks).toString('utf-8').trim();
      const stderr = Buffer.concat(stderrChunks).toString('utf-8').trim();

      // Signal-killed (timeout)
      if (signal === 'SIGTERM' || signal === 'SIGKILL') {
        safeResolve({
          success: false,
          events: [],
          finalMessage: '',
          filesChanged: [],
          commandsRun: [],
          error: {
            code: CodexErrorCode.TIMEOUT,
            message: `Codex CLI timeout after ${timeout}ms`,
          },
        });
        return;
      }

      // Success
      if (code === 0) {
        if (options.json) {
          const events = parseJsonlStream(stdout);
          const parsed = buildCodexResult(events);
          safeResolve({
            success: true,
            ...parsed,
          });
        } else {
          safeResolve({
            success: true,
            events: [],
            finalMessage: stdout,
            filesChanged: [],
            commandsRun: [],
          });
        }
        return;
      }

      // Execution failed
      const errorMessage = stderr || stdout || 'Unknown error';
      const errorCode = detectErrorCode(errorMessage);

      safeResolve({
        success: false,
        events: [],
        finalMessage: '',
        filesChanged: [],
        commandsRun: [],
        error: {
          code: errorCode,
          message: `Codex CLI failed with exit code ${code}`,
          details: errorMessage,
        },
      });
    });

    // Handle stdin write errors
    child.stdin.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EPIPE') return;

      safeResolve({
        success: false,
        events: [],
        finalMessage: '',
        filesChanged: [],
        commandsRun: [],
        error: {
          code: CodexErrorCode.STDIN_WRITE_FAILED,
          message: 'Failed to write prompt to Codex CLI',
          details: error.message,
        },
      });
    });

    // Setup timeout with SIGTERM -> SIGKILL cascade
    timeoutId = setTimeout(() => {
      if (!resolved) {
        child.kill('SIGTERM');

        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        }, 5000);

        safeResolve({
          success: false,
          events: [],
          finalMessage: '',
          filesChanged: [],
          commandsRun: [],
          error: {
            code: CodexErrorCode.TIMEOUT,
            message: `Codex CLI timeout after ${timeout}ms`,
          },
        });
      }
    }, timeout);

    // Write prompt to stdin
    try {
      child.stdin.write(prompt, 'utf-8');
      child.stdin.end();
    } catch (error) {
      safeResolve({
        success: false,
        events: [],
        finalMessage: '',
        filesChanged: [],
        commandsRun: [],
        error: {
          code: CodexErrorCode.STDIN_WRITE_FAILED,
          message: 'Failed to send prompt to Codex CLI',
          details: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });
}

/**
 * Detect error code from error message.
 */
function detectErrorCode(message: string): CodexErrorCode {
  const lower = message.toLowerCase();

  if (
    lower.includes('authentication') ||
    lower.includes('unauthorized') ||
    lower.includes('login required')
  ) {
    return CodexErrorCode.AUTHENTICATION_FAILED;
  }
  if (lower.includes('permission denied')) {
    return CodexErrorCode.PERMISSION_DENIED;
  }
  if (lower.includes('not found')) {
    return CodexErrorCode.NOT_FOUND;
  }

  return CodexErrorCode.EXECUTION_FAILED;
}
