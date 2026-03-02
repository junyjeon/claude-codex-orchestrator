# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-02-08

### Added
- 3 new MCP tools: `codex_execute` (autonomous task execution), `codex_review` (code review), `suggest_model` (rule-based model recommendation)
- Security module (`security.ts`): path validation with symlink following, error output sanitization, ProcessSemaphore for concurrency control
- JSONL event stream parser (`codex/parser.ts`) for structured Codex CLI output
- Prompt template system (`codex/prompts.ts`) for each tool
- Rule-based model router (`router/suggest.ts`) with signal aggregation
- New env vars: `CODEX_EXECUTE_TIMEOUT`, `CODEX_ALLOWED_DIRS`, `CODEX_ALLOW_DANGER_SANDBOX`, `CODEX_ALLOW_FULL_AUTO`, `CODEX_MAX_CONCURRENT`
- Comprehensive test suite (10 test files covering all modules)
- `docs/모델비교.md`: Opus 4.6 vs Codex 5.3 benchmark comparison
- TypeScript enums: ApprovalMode, SandboxMode, ReviewFocus, TaskType, Complexity
- JSONL event types: ThreadStartedEvent, TurnCompletedEvent, ItemEvent, ErrorEvent
- Structured tool output types: GenerateOutput, ExecuteOutput, ReviewOutput, SuggestModelOutput

### Changed
- **Breaking**: Renamed `generate_code` tool to `codex_generate`
- **Breaking**: Reorganized source from flat structure to modular architecture (`codex/`, `router/`, `tools/`, `types/`)
- Upgraded @modelcontextprotocol/sdk from 1.11.4 to 1.26.0
- Upgraded zod from 3.24.4 to 3.25.0
- Server now registers 4 tools instead of 1
- Codex CLI wrapper supports `--json` mode for JSONL event parsing
- Tool handlers moved to separate files (`tools/generate.ts`, `tools/execute.ts`, `tools/review.ts`)
- `codex_review` uses 3-stage parsing fallback (JSON → regex → raw text)

### Improved
- Defense-in-depth security: 4-layer protection (schema, path, process, output)
- Dynamic sandbox options based on env var configuration
- Structured responses with both `text` and `structuredContent`

## [0.2.0] - 2025-11-11

### Security
- **Fixed command injection vulnerability** by replacing shell command execution with spawn + stdin pipe
- Removed insecure shell interpolation of user prompts
- Implemented proper process spawning with argument arrays

### Added
- Structured error types with `CodexErrorCode` enum for better error handling
- `CodexError` interface with code, message, and details fields
- Environment variable validation using Zod schema
- Output size limit (1MB) to prevent memory exhaustion
- Comprehensive error detection for:
  - ENOENT (Codex CLI not found)
  - EACCES (Permission denied)
  - Timeout with graceful SIGTERM/SIGKILL handling
  - Authentication failures
  - Output size exceeded
  - stdin write failures

### Changed
- **Breaking (Internal)**: `CodexResult.error` changed from `string` to `CodexError` object
- Replaced `exec` with `spawn` for safer process execution
- Removed `--quiet` flag (not supported by Codex CLI)
- Changed from command-line arguments to stdin pipe for prompt input
- Improved timeout handling with proper cleanup
- Enhanced error messages with structured information
- Updated documentation to reflect security improvements

### Improved
- Memory management with buffer size limits
- Process lifecycle management with proper cleanup
- Error message formatting in MCP responses

### Fixed
- Command injection vulnerability (CRITICAL)
- Command-line length limits by using stdin
- Incomplete error handling for various edge cases
- Missing validation for environment variables

## [0.1.0] - 2025-11-11

### Added
- Initial implementation of MCP server for Codex CLI integration
- Simple wrapper around Codex CLI for code generation
- Basic error handling
- Documentation (Korean and English)
- Build configuration with Vite
- TypeScript strict mode support

[1.0.0]: https://github.com/junyjeon/claude-codex-orchestrator/compare/v0.2.0...v1.0.0
[0.2.0]: https://github.com/junyjeon/claude-codex-orchestrator/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/junyjeon/claude-codex-orchestrator/releases/tag/v0.1.0
