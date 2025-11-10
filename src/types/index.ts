/**
 * Type definitions for Codex MCP server
 */

// MCP Tool Parameters
export interface GenerateCodeParams {
  task_description: string;
  language: string;
  context?: string; // Optional additional context
}

// MCP Tool Result
export interface GenerateCodeResult {
  code: string;
  success: boolean;
  error?: string;
  metadata?: {
    executionTime: number;
  };
}

// Server Configuration
export interface ServerConfig {
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  timeout: number; // Codex CLI timeout in milliseconds
}
