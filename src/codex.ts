/**
 * Codex CLI wrapper with spawn + stdin pipe for security
 */

import { spawn } from 'node:child_process';
import { CodexErrorCode, type CodexError, type CodexResult } from './types/index.js';

export interface CodexOptions {
  timeout?: number; // milliseconds, default 30000
}

const MAX_OUTPUT_SIZE = 1024 * 1024; // 1MB

/**
 * Calls Codex CLI to generate code using stdin pipe (secure)
 */
export async function callCodex(
  prompt: string,
  options: CodexOptions = {},
): Promise<CodexResult> {
  const timeout = options.timeout || 30000;

  return new Promise((resolve) => {
    let resolved = false;
    let timeoutId: NodeJS.Timeout | null = null;

    // Safe resolve - ensures single resolution and cleanup
    const safeResolve = (result: CodexResult) => {
      if (resolved) return;
      resolved = true;

      if (timeoutId) clearTimeout(timeoutId);
      child.removeAllListeners();
      if (!child.killed) {
        child.kill('SIGTERM');
      }

      resolve(result);
    };

    // Spawn Codex CLI with stdin pipe
    const child = spawn('codex', ['exec', '-'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Output collection with size limit
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutSize = 0;
    let stderrSize = 0;

    // Handle stdout
    child.stdout.on('data', (data: Buffer) => {
      stdoutSize += data.length;
      if (stdoutSize > MAX_OUTPUT_SIZE) {
        safeResolve({
          code: '',
          success: false,
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

    // Handle stderr
    child.stderr.on('data', (data: Buffer) => {
      stderrSize += data.length;
      if (stderrSize <= MAX_OUTPUT_SIZE) {
        stderrChunks.push(data);
      }
    });

    // Handle process errors (ENOENT, EACCES, etc.)
    child.on('error', (error: NodeJS.ErrnoException) => {
      const codeError: CodexError = {
        code: CodexErrorCode.UNKNOWN,
        message: 'Failed to start Codex CLI',
        details: error.message,
      };

      if (error.code === 'ENOENT') {
        codeError.code = CodexErrorCode.NOT_FOUND;
        codeError.message = 'Codex CLI not found';
        codeError.details = 'Install: npm install -g @openai/codex';
      } else if (error.code === 'EACCES') {
        codeError.code = CodexErrorCode.PERMISSION_DENIED;
        codeError.message = 'Permission denied';
        codeError.details = 'Check: chmod +x $(which codex)';
      }

      safeResolve({
        code: '',
        success: false,
        error: codeError,
      });
    });

    // Handle process exit
    child.on('close', (code, signal) => {
      // Skip if already resolved (timeout or error)
      if (resolved) return;

      const stdout = Buffer.concat(stdoutChunks).toString('utf-8').trim();
      const stderr = Buffer.concat(stderrChunks).toString('utf-8').trim();

      // Timeout killed
      if (signal === 'SIGTERM' || signal === 'SIGKILL') {
        safeResolve({
          code: '',
          success: false,
          error: {
            code: CodexErrorCode.TIMEOUT,
            message: `Codex CLI timeout after ${timeout}ms`,
          },
        });
        return;
      }

      // Success
      if (code === 0) {
        safeResolve({
          code: stdout,
          success: true,
        });
        return;
      }

      // Execution failed
      const errorMessage = stderr || stdout || 'Unknown error';
      const errorCode = detectErrorCode(errorMessage);

      safeResolve({
        code: '',
        success: false,
        error: {
          code: errorCode,
          message: `Codex CLI failed with exit code ${code}`,
          details: errorMessage,
        },
      });
    });

    // Handle stdin write errors
    child.stdin.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EPIPE') {
        // Process already closed, let close handler deal with it
        return;
      }

      safeResolve({
        code: '',
        success: false,
        error: {
          code: CodexErrorCode.STDIN_WRITE_FAILED,
          message: 'Failed to write prompt to Codex CLI',
          details: error.message,
        },
      });
    });

    // Setup timeout
    timeoutId = setTimeout(() => {
      if (!resolved) {
        child.kill('SIGTERM');

        // Force kill after 5 seconds
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        }, 5000);

        safeResolve({
          code: '',
          success: false,
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
        code: '',
        success: false,
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
 * Detect error code from error message
 */
function detectErrorCode(message: string): CodexErrorCode {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('authentication') ||
      lowerMessage.includes('unauthorized') ||
      lowerMessage.includes('login required')) {
    return CodexErrorCode.AUTHENTICATION_FAILED;
  }

  if (lowerMessage.includes('permission denied')) {
    return CodexErrorCode.PERMISSION_DENIED;
  }

  if (lowerMessage.includes('not found')) {
    return CodexErrorCode.NOT_FOUND;
  }

  return CodexErrorCode.EXECUTION_FAILED;
}
