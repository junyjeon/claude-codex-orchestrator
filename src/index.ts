#!/usr/bin/env node

/**
 * CLI Entry point for Codex MCP Server
 */

import { config } from 'dotenv';
import { z } from 'zod';
import { CodexMCPServer } from './server.js';
import type { ServerConfig } from './types/index.js';

// Load environment variables
config();

// Zod schema for configuration validation
const ServerConfigSchema = z.object({
  logLevel: z.enum(['debug', 'info', 'warn', 'error'])
    .default('info')
    .describe('Logging level'),
  timeout: z.number()
    .min(1000, 'Timeout must be at least 1000ms')
    .max(300000, 'Timeout must be at most 300000ms (5 minutes)')
    .default(30000)
    .describe('Codex CLI timeout in milliseconds'),
});

// Build configuration from environment with validation
function buildConfig(): ServerConfig {
  const rawConfig = {
    logLevel: process.env.LOG_LEVEL,
    timeout: process.env.CODEX_TIMEOUT
      ? Number.parseInt(process.env.CODEX_TIMEOUT, 10)
      : undefined,
  };

  try {
    const validated = ServerConfigSchema.parse(rawConfig);
    return validated;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('[Config] Invalid configuration:');
      for (const issue of error.issues) {
        console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
      }
      console.error('[Config] Using default configuration');
    }

    // Fallback to defaults
    return {
      logLevel: 'info',
      timeout: 30000,
    };
  }
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
