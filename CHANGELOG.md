# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.2.0]: https://github.com/junyjeon/claude-codex-orchestrator/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/junyjeon/claude-codex-orchestrator/releases/tag/v0.1.0
