# claude-codex-orchestrator

MCP tool providing Claude Code access to Codex CLI (GPT-5) for code generation.

## Overview

Simple MCP server that enables Claude Code to use Codex CLI for code generation tasks. Claude Code handles orchestration, analysis, and validation - this tool just calls Codex and returns results.

**Architecture:**
- Claude Code: Orchestration, analysis, validation
- This MCP server: Execute Codex CLI
- Codex CLI: Code generation

## Prerequisites

- Node.js ≥20.0.0
- Codex CLI installed and authenticated
- ChatGPT Plus, Pro, Business, Edu, or Enterprise plan

### Install Codex CLI

```bash
# Install (follow official guide)
npm install -g @openai/codex

# Authenticate
codex
# or
printenv OPENAI_API_KEY | codex login --with-api-key
```

Verify: `codex exec "test prompt"` should work.

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

Add to `~/.claude.json`:

```json
{
  "mcpServers": {
    "codex": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@junyjeon/claude-codex-orchestrator"]
    }
  }
}
```

For local development:

```json
{
  "mcpServers": {
    "codex": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/claude-codex-orchestrator/dist/index.js"]
    }
  }
}
```

### 2. Environment Variables (Optional)

Create `.env` file:

```bash
# Log level (default: info)
LOG_LEVEL=debug

# Codex CLI timeout (default: 30000ms)
CODEX_TIMEOUT=60000
```

### 3. Activate (If Needed)

Some environments require activation in `~/.claude/settings.json`:

```json
{
  "enabledMcpjsonServers": [
    "codex"
  ]
}
```

## Usage

Ask Claude Code to generate code:

```
"Create a binary search function in TypeScript"
```

Claude Code will:
1. Decide to use Codex
2. Call generate_code tool
3. Validate generated code
4. Present results

## Troubleshooting

### Codex CLI not found

```
Codex CLI not found. Please install...
```

Fix:
1. Install Codex CLI
2. Verify: `which codex`
3. Restart Claude Code

### Authentication failed

```
Codex authentication failed. Please run: codex login
```

Fix:
1. Run `codex` or `codex login`
2. Authenticate in browser
3. Restart Claude Code

### Timeout

```
Codex CLI timeout after 30000ms
```

Fix:
1. Increase CODEX_TIMEOUT in `.env`
2. Check network connection
3. Try simpler prompt

### MCP server not detected

generate_code tool not in Claude Code.

Fix:
1. Check `~/.claude.json` configuration
2. Restart Claude Code completely
3. Manual test:
```bash
npx @junyjeon/claude-codex-orchestrator
# or
node /path/to/dist/index.js
```

## Documentation

- [개요.md](docs/개요.md) - Project overview
- [구조.md](docs/구조.md) - Folder structure
- [흐름.md](docs/흐름.md) - Process flow
- [배포.md](docs/배포.md) - Installation & deployment

## Update

```bash
# npm package
npm update -g @junyjeon/claude-codex-orchestrator

# Local development
cd claude-codex-orchestrator
git pull
npm install
npm run build
```

## Uninstall

```bash
# npm package
npm uninstall -g @junyjeon/claude-codex-orchestrator

# Remove from ~/.claude.json
# Delete codex section
```

## License

MIT

## Author

junyjeon

## Repository

https://github.com/junyjeon/claude-codex-orchestrator
