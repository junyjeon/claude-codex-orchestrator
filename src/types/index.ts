/**
 * Type definitions for Codex MCP Orchestrator v1.0
 */

// ─── Error Types (preserved from v0.2.0) ───

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

export interface CodexError {
  code: CodexErrorCode;
  message: string;
  details?: string;
}

// ─── Codex CLI Enums ───

export enum ApprovalMode {
  UNTRUSTED = 'untrusted',
  ON_FAILURE = 'on-failure',
  ON_REQUEST = 'on-request',
  NEVER = 'never',
}

export enum SandboxMode {
  READ_ONLY = 'read-only',
  WORKSPACE_WRITE = 'workspace-write',
  DANGER_FULL_ACCESS = 'danger-full-access',
}

export enum ReviewFocus {
  SECURITY = 'security',
  PERFORMANCE = 'performance',
  QUALITY = 'quality',
  ALL = 'all',
}

export enum TaskType {
  ARCHITECTURE = 'architecture',
  IMPLEMENTATION = 'implementation',
  UI = 'ui',
  REVIEW = 'review',
  DEBUG = 'debug',
  REFACTOR = 'refactor',
}

export enum Complexity {
  SIMPLE = 'simple',
  MODERATE = 'moderate',
  COMPLEX = 'complex',
}

// ─── JSONL Event Types (from codex exec --json) ───

export interface CodexEvent {
  type: string;
}

export interface ThreadStartedEvent extends CodexEvent {
  type: 'thread.started';
  thread_id: string;
}

export interface TurnStartedEvent extends CodexEvent {
  type: 'turn.started';
}

export interface TurnCompletedEvent extends CodexEvent {
  type: 'turn.completed';
  usage?: {
    input_tokens: number;
    cached_input_tokens: number;
    output_tokens: number;
  };
}

export interface ItemEvent extends CodexEvent {
  type: 'item.started' | 'item.completed';
  item: CodexItem;
}

export interface ErrorEvent extends CodexEvent {
  type: 'error';
  message?: string;
}

export type CodexItem = AgentMessageItem | CommandExecutionItem | FileChangeItem;

export interface AgentMessageItem {
  id: string;
  type: 'agent_message';
  text: string;
  status?: string;
}

export interface CommandExecutionItem {
  id: string;
  type: 'command_execution';
  command: string;
  status: string;
  output?: string;
  exit_code?: number;
}

export interface FileChangeItem {
  id: string;
  type: 'file_change';
  path: string;
  action: string;
}

// ─── Tool Input Types ───

export interface GenerateInput {
  task_description: string;
  language: string;
  context?: string;
  working_dir?: string;
}

export interface ExecuteInput {
  task_description: string;
  working_dir: string;
  approval_mode?: `${ApprovalMode}`;
  sandbox?: `${SandboxMode}`;
}

export interface ReviewInput {
  code: string;
  file_path?: string;
  review_focus?: `${ReviewFocus}`;
  language?: string;
}

export interface SuggestModelInput {
  task_description: string;
  task_type?: `${TaskType}`;
  context_size?: number;
  complexity?: `${Complexity}`;
}

// ─── Tool Output Types ───

export interface GenerateOutput {
  [key: string]: unknown;
  code: string;
  explanation: string;
  language: string;
}

export interface ExecuteOutput {
  [key: string]: unknown;
  result: string;
  files_changed: string[];
  commands_run: string[];
  success: boolean;
}

export interface ReviewIssue {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  line?: number;
  message: string;
  suggestion?: string;
}

export interface ReviewOutput {
  [key: string]: unknown;
  issues: ReviewIssue[];
  summary: string;
  score: number;
}

export interface SuggestModelOutput {
  [key: string]: unknown;
  recommended: 'claude' | 'codex';
  reasoning: string;
  confidence: number;
  alternative_scenarios: string[];
}

// ─── Codex Client Types ───

export interface CodexExecOptions {
  timeout?: number;
  workingDir?: string;
  json?: boolean;
  fullAuto?: boolean;
  approvalMode?: `${ApprovalMode}`;
  sandbox?: `${SandboxMode}`;
  skipGitRepoCheck?: boolean;
}

export interface CodexResult {
  success: boolean;
  events: CodexEvent[];
  finalMessage: string;
  filesChanged: string[];
  commandsRun: string[];
  error?: CodexError;
}

// ─── Server Configuration ───

export interface SecurityConfig {
  allowedWorkingDirs: string[];
  allowDangerSandbox: boolean;
  allowFullAuto: boolean;
  maxConcurrentProcesses: number;
}

export interface ServerConfig {
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  timeout: number;
  executeTimeout: number;
  security: SecurityConfig;
}
