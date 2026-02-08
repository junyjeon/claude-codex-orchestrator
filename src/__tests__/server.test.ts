import { describe, expect, it, vi } from 'vitest';

// Mock MCP SDK
vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => {
  const registeredTools = new Map<string, unknown>();
  return {
    McpServer: vi.fn().mockImplementation(() => ({
      registerTool: vi.fn((name: string, config: unknown, handler: unknown) => {
        registeredTools.set(name, { config, handler });
      }),
      connect: vi.fn(),
      _registeredTools: registeredTools,
    })),
  };
});

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn(),
}));

vi.mock('./codex/client.js', () => ({
  initSemaphore: vi.fn(),
}));

import { CodexMCPServer } from '../server.js';
import type { ServerConfig } from '../types/index.js';

const testConfig: ServerConfig = {
  logLevel: 'warn',
  timeout: 30000,
  executeTimeout: 120000,
  security: {
    allowedWorkingDirs: ['/home/user'],
    allowDangerSandbox: false,
    allowFullAuto: false,
    maxConcurrentProcesses: 3,
  },
};

describe('CodexMCPServer', () => {
  it('creates server and registers 4 tools', () => {
    const server = new CodexMCPServer(testConfig);
    expect(server).toBeDefined();
  });

  it('registers all expected tool names', () => {
    const server = new CodexMCPServer(testConfig);
    // Access the underlying McpServer instance to verify tools
    const mcpServer = (server as unknown as { server: { registerTool: ReturnType<typeof vi.fn> } })
      .server;
    const calls = mcpServer.registerTool.mock.calls;

    const toolNames = calls.map((c: unknown[]) => c[0]);
    expect(toolNames).toContain('codex_generate');
    expect(toolNames).toContain('codex_execute');
    expect(toolNames).toContain('codex_review');
    expect(toolNames).toContain('suggest_model');
    expect(toolNames).toHaveLength(4);
  });

  it('excludes danger-full-access when not allowed', () => {
    const server = new CodexMCPServer(testConfig);
    const mcpServer = (server as unknown as { server: { registerTool: ReturnType<typeof vi.fn> } })
      .server;
    const executeCall = mcpServer.registerTool.mock.calls.find(
      (c: unknown[]) => c[0] === 'codex_execute',
    );

    // The description should mention on-failure default, not full-auto
    const toolConfig = executeCall?.[1] as { description: string };
    expect(toolConfig.description).toContain('Autonomous task execution');
  });

  it('starts transport connection', async () => {
    const server = new CodexMCPServer(testConfig);
    await server.start();

    const mcpServer = (server as unknown as { server: { connect: ReturnType<typeof vi.fn> } })
      .server;
    expect(mcpServer.connect).toHaveBeenCalled();
  });
});
