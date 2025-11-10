#!/usr/bin/env node

/**
 * CLI Entry point for Codex MCP Server
 */

import { config } from 'dotenv';
import { CodexMCPServer } from './server.js';
import type { ServerConfig } from './types/index.js';

// Load environment variables
config();

// Build configuration from environment
function buildConfig(): ServerConfig {
  return {
    logLevel: (process.env.LOG_LEVEL as ServerConfig['logLevel']) || 'info',
    timeout: Number.parseInt(process.env.CODEX_TIMEOUT || '30000', 10),
  };
}

// Main execution
async function main() {
  try {
    const config = buildConfig();
    const server = new CodexMCPServer(config);
    await server.start();
  } catch (error) {
    console.error('Failed to start Codex MCP Server:', error);
    process.exit(1);
  }
}

main();
