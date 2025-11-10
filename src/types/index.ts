/**
 * Type definitions for Codex MCP server
 */

// MCP Tool Parameters
export interface GenerateCodeParams {
  task_description: string;
  language: string;
  context?: string; // Optional additional context
}

// Codex Error Codes
export enum CodexErrorCode {
  NOT_FOUND = 'CODEX_NOT_FOUND',
  PERMISSION_DENIED = 'CODEX_PERMISSION_DENIED',
  TIMEOUT = 'CODEX_TIMEOUT',
  OUTPUT_TOO_LARGE = 'CODEX_OUTPUT_TOO_LARGE',
  AUTHENTICATION_FAILED = 'CODEX_AUTH_FAILED',
  EXECUTION_FAILED = 'CODEX_EXEC_FAILED',
  STDIN_WRITE_FAILED = 'CODEX_STDIN_WRITE_FAILED',
  UNKNOWN = 'CODEX_UNKNOWN',
}

// Codex Error
export interface CodexError {
  code: CodexErrorCode;
  message: string;
  details?: string;
}

// Codex CLI Result
export interface CodexResult {
  code: string;
  success: boolean;
  error?: CodexError;
}

// Server Configuration
export interface ServerConfig {
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  timeout: number; // Codex CLI timeout in milliseconds
}
