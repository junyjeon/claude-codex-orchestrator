/**
 * Codex CLI wrapper
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export interface CodexOptions {
  timeout?: number; // milliseconds, default 30000
}

export interface CodexResult {
  code: string;
  success: boolean;
  error?: string;
}

/**
 * Calls Codex CLI to generate code
 */
export async function callCodex(
  prompt: string,
  options: CodexOptions = {},
): Promise<CodexResult> {
  const timeout = options.timeout || 30000;

  try {
    // Execute Codex CLI in non-interactive mode
    // Uses 'codex exec' for automation with --quiet flag
    const command = `codex exec --quiet "${prompt.replace(/"/g, '\\"')}"`;

    const { stdout, stderr } = await execAsync(command, {
      timeout,
      maxBuffer: 1024 * 1024, // 1MB
    });

    // Check for errors in stderr
    if (stderr && stderr.trim().length > 0) {
      // Some CLIs output warnings to stderr, only fail on actual errors
      if (stderr.toLowerCase().includes('error') || stderr.toLowerCase().includes('failed')) {
        return {
          code: '',
          success: false,
          error: `Codex CLI error: ${stderr}`,
        };
      }
    }

    return {
      code: stdout.trim(),
      success: true,
    };
  } catch (error) {
    // Handle different error types
    if (error instanceof Error) {
      // Check if it's a timeout error
      if ('killed' in error && error.killed) {
        return {
          code: '',
          success: false,
          error: `Codex CLI timeout after ${timeout}ms`,
        };
      }

      // Check if codex command not found
      if (error.message.includes('not found') || error.message.includes('command not found')) {
        return {
          code: '',
          success: false,
          error: 'Codex CLI not found. Please install and authenticate: https://codex.dev',
        };
      }

      // Authentication errors
      if (error.message.includes('unauthorized') || error.message.includes('authentication')) {
        return {
          code: '',
          success: false,
          error: 'Codex authentication failed. Please run: codex login',
        };
      }

      // Generic error
      return {
        code: '',
        success: false,
        error: `Codex CLI error: ${error.message}`,
      };
    }

    // Unknown error
    return {
      code: '',
      success: false,
      error: `Unknown error: ${String(error)}`,
    };
  }
}
