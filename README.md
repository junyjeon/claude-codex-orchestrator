# claude-codex-orchestrator

MCP server for Claude Code + Codex CLI (GPT-5.3) orchestration. 4 specialized tools with task routing intelligence and security hardening.

## Overview

Claude Opus 4.6 and Codex GPT-5.3 have different strengths. This MCP server lets Claude Code delegate **self-contained tasks** to Codex while maintaining architectural control. Delegation scope is intentionally narrow: only tasks that don't need project conventions benefit from Codex generation. See [docs/모델비교.md](docs/모델비교.md) for detailed benchmarks and rationale.

- `codex_generate` - Code generation for self-contained tasks (bash scripts, utility functions, scaffolds)
- `codex_execute` - Autonomous task execution (do-run-inspect loop)
- `codex_review` - Code review from a different AI perspective (highest-value tool — no context loss)
- `suggest_model` - Rule-based model recommendation (no API call)

## Prerequisites

- Node.js >= 20.0.0
- Codex CLI installed and authenticated
- ChatGPT Plus, Pro, Business, Edu, or Enterprise plan

### Install Codex CLI

```bash
# Authenticate (opens browser)
codex login

# Or with API key
printenv OPENAI_API_KEY | codex login --with-api-key
```

Verify: `echo "Write hello world" | codex exec -` should generate code.

## Installation

### npm (Recommended)

```bash
npm install -g @junyjeon/claude-codex-orchestrator
```

### Local Development

```bash
git clone https://github.com/junyjeon/claude-codex-orchestrator.git
cd claude-codex-orchestrator
npm install
npm run build
npm link
```

## Claude Code Integration

### 1. Register MCP Server

Global configuration (`~/.claude.json`):

```json
{
  "mcpServers": {
    "codex": {
      "command": "claude-codex-orchestrator"
    }
  }
}
```

Project-specific (recommended):

```json
{
  "projects": {
    "/path/to/your/project": {
      "mcpServers": {
        "codex": {
          "command": "claude-codex-orchestrator"
        }
      }
    }
  }
}
```

With npx (no global install):

```json
{
  "mcpServers": {
    "codex": {
      "command": "npx",
      "args": ["-y", "@junyjeon/claude-codex-orchestrator"]
    }
  }
}
```

### 2. Environment Variables

Create `.env` file in the server directory:

```bash
# Logging
LOG_LEVEL=info

# Codex CLI Timeout (ms) - for generate/review tools
CODEX_TIMEOUT=30000

# Execute Timeout (ms) - for autonomous execution
CODEX_EXECUTE_TIMEOUT=120000

# Security: Allowed working directories (colon-separated)
CODEX_ALLOWED_DIRS=/home/user/projects:/tmp

# Security: Allow danger-full-access sandbox (default: false)
CODEX_ALLOW_DANGER_SANDBOX=false

# Security: Allow --full-auto mode (default: false)
CODEX_ALLOW_FULL_AUTO=false

# Security: Max concurrent Codex processes (default: 3, max: 10)
CODEX_MAX_CONCURRENT=3
```

### 3. Activate (If Needed)

Some environments require activation in `~/.claude/settings.json`:

```json
{
  "enabledMcpjsonServers": ["codex"]
}
```

## Tools

### codex_generate

Fast code generation using Codex CLI.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| task_description | string | yes | What to generate |
| language | string | yes | Programming language |
| context | string | no | Additional constraints |
| working_dir | string | no | Project directory for context |

### codex_execute

Autonomous task execution with do-run-inspect loop.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| task_description | string | yes | Task to execute |
| working_dir | string | yes | Working directory |
| approval_mode | enum | no | `untrusted`, `on-failure` (default), `on-request`, `never` |
| sandbox | enum | no | `read-only`, `workspace-write` (default) |

`danger-full-access` sandbox is only available when `CODEX_ALLOW_DANGER_SANDBOX=true`.
`--full-auto` mode is only used when `CODEX_ALLOW_FULL_AUTO=true` and no `approval_mode` is set.

### codex_review

Code review from Codex (GPT-5.3) perspective.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| code | string | yes | Code to review |
| file_path | string | no | File path for context |
| review_focus | enum | no | `security`, `performance`, `quality`, `all` (default) |
| language | string | no | Programming language |

Returns structured output: `{ issues: [{severity, line, message, suggestion}], summary, score }`.

### suggest_model

Rule-based model recommendation. No API call, instant response.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| task_description | string | yes | Description of the task |
| task_type | enum | no | `architecture`, `implementation`, `ui`, `review`, `debug`, `refactor`, `scripting`, `security` |
| context_size | number | no | Estimated context size in tokens |
| complexity | enum | no | `simple`, `moderate`, `complex` |

Returns: `{ recommended: 'claude'|'codex', reasoning, confidence, alternative_scenarios }`.

## Security

### Defense in Depth

4 layers of security protection:

1. **Schema Level** - `danger-full-access` is conditionally excluded from Zod schema. AI clients cannot select it unless explicitly enabled via env var.
2. **Path Validation** - `validateWorkingDir()` canonicalizes paths with `realpathSync` (follows symlinks), then checks against allowed directory roots with boundary-aware comparison.
3. **Process Level** - Semaphore limits concurrent Codex processes (default: 3) to prevent DoS.
4. **Output Level** - `sanitizeErrorOutput()` redacts home paths, API keys, tokens, and credentials from error responses.

### Spawn Safety (from v0.2.0)

- stdin pipe eliminates command injection (no shell interpretation)
- SIGTERM -> SIGKILL cascade timeout
- 1MB output size limit
- 8 structured error codes

### Secure Defaults

| Setting | Default | Reason |
|---------|---------|--------|
| sandbox | `workspace-write` | Prevents full filesystem access |
| approval_mode | `on-failure` | Requires approval on failures |
| --full-auto | disabled | Requires `CODEX_ALLOW_FULL_AUTO=true` |
| danger-full-access | hidden | Requires `CODEX_ALLOW_DANGER_SANDBOX=true` |
| max concurrent | 3 | Prevents resource exhaustion |

## Architecture

```
src/
├── index.ts          # Entry, env var validation
├── server.ts         # McpServer + registerTool() (SDK 1.26.0)
├── security.ts       # Path validation, sanitization, semaphore
├── codex/
│   ├── client.ts     # spawn wrapper + --json + semaphore
│   ├── parser.ts     # JSONL output parser
│   └── prompts.ts    # Tool-specific prompt templates
├── router/
│   └── suggest.ts    # Rule-based task routing
├── tools/
│   ├── generate.ts   # codex_generate handler
│   ├── execute.ts    # codex_execute handler
│   └── review.ts     # codex_review handler
└── types/
    └── index.ts      # Type definitions + enums
```

## Troubleshooting

### Codex CLI not found

```
Codex CLI not found. Install: npm install -g @openai/codex
```

Verify: `which codex`, then restart Claude Code.

### Authentication failed

Run `codex login`, authenticate in browser, restart Claude Code.

### Timeout

Increase `CODEX_TIMEOUT` or `CODEX_EXECUTE_TIMEOUT` in `.env`. Check network connection.

### Security: Path outside allowed directories

Set `CODEX_ALLOWED_DIRS` in `.env` to include your project directory:

```bash
CODEX_ALLOWED_DIRS=/home/user/projects:/home/user/work
```

### MCP server not detected

1. Check `~/.claude.json` configuration
2. Restart Claude Code completely
3. Manual test: `npx @junyjeon/claude-codex-orchestrator`

## Development

```bash
npm test          # Run tests (118 tests)
npm run typecheck # TypeScript strict check
npm run lint      # Biome lint
npm run build     # Vite production build
```

## License

MIT

## Author

junyjeon

## Repository

https://github.com/junyjeon/claude-codex-orchestrator
