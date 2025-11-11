# claude-codex-orchestrator

MCP server enabling Claude Code to delegate code generation tasks to Codex CLI (GPT-5).

## Overview

Allows Claude Code to offload code generation to Codex while saving context. Claude Code manages workflow and validation - this server securely executes Codex CLI.

**Why use this?**
- Codex (GPT-5) excels at pure code generation
- Claude Code saves context by delegating complex code writing
- Secure architecture prevents command injection

**v0.2.0 Security Features:**
- spawn + stdin pipe (eliminates command injection)
- 8 structured error types for clear debugging
- Zod-based environment validation
- 1MB output limit + resource management

## Prerequisites

- Node.js ≥20.0.0
- Codex CLI installed and authenticated
- ChatGPT Plus, Pro, Business, Edu, or Enterprise plan

### Install Codex CLI

Download and install from OpenAI's official site.

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

**Global configuration** (`~/.claude.json`):

```json
{
  "mcpServers": {
    "codex": {
      "command": "claude-codex-orchestrator"
    }
  }
}
```

**Project-specific** (recommended):

```bash
# Open Claude Code in your project
# Edit project settings or ~/.claude.json
```

Add to projects section:

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

**Alternative installations:**

```json
// With npx (no global install needed)
{
  "mcpServers": {
    "codex": {
      "command": "npx",
      "args": ["-y", "@junyjeon/claude-codex-orchestrator"]
    }
  }
}

// Local development
{
  "mcpServers": {
    "codex": {
      "command": "node",
      "args": ["/path/to/dist/index.js"]
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

Restart Claude Code after configuration, then request code generation:

```
You: "Write a quicksort algorithm in Python"
```

**What happens:**
1. Claude Code decides whether to use Codex
2. Calls `generate_code` tool via MCP
3. MCP server executes: `spawn('codex', ['exec', '-'])`
4. Codex generates code via stdin pipe
5. Claude Code validates and presents result

**Example scenarios:**
- Algorithm implementations (quicksort, binary search, etc.)
- Boilerplate code (Express routes, React components)
- Utility functions (date formatters, validators)
- Data structure implementations

**You'll see:**
```
[Codex MCP Server] Started
[generate_code tool called]
[Generated code presented]
```

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

- [설계.md](docs/설계.md) - Complete design document: architecture, flow, stack, quality (Korean)
- [구조.md](docs/구조.md) - Folder structure and file organization (Korean)
- [흐름.md](docs/흐름.md) - Execution flow and data flow diagrams (Korean)
- [배포.md](docs/배포.md) - Installation and deployment guide (Korean)
- [CHANGELOG.md](CHANGELOG.md) - Version history and changes

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
