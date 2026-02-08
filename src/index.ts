#!/usr/bin/env node

/**
 * CLI Entry point for Codex MCP Server v1.0
 */

import { config } from 'dotenv';
import { z } from 'zod';
import { CodexMCPServer } from './server.js';
import type { ServerConfig } from './types/index.js';

// Load environment variables
config();

const ServerConfigSchema = z.object({
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  timeout: z
    .number()
    .min(1000, 'Timeout must be at least 1000ms')
    .max(300000, 'Timeout must be at most 300000ms')
    .default(30000),
  executeTimeout: z
    .number()
    .min(5000, 'Execute timeout must be at least 5000ms')
    .max(600000, 'Execute timeout must be at most 600000ms')
    .default(120000),
  security: z
    .object({
      allowedWorkingDirs: z.array(z.string()).min(1, 'At least one allowed directory required'),
      allowDangerSandbox: z.boolean().default(false),
      allowFullAuto: z.boolean().default(false),
      maxConcurrentProcesses: z.number().min(1).max(10).default(3),
    })
    .default({
      allowedWorkingDirs: [process.env.HOME ?? '/tmp'],
      allowDangerSandbox: false,
      allowFullAuto: false,
      maxConcurrentProcesses: 3,
    }),
});

function parseAllowedDirs(): string[] | undefined {
  const raw = process.env.CODEX_ALLOWED_DIRS;
  if (!raw) return undefined;
  return raw
    .split(':')
    .map((d) => d.trim())
    .filter(Boolean);
}

function buildConfig(): ServerConfig {
  const allowedDirs = parseAllowedDirs();

  const rawConfig = {
    logLevel: process.env.LOG_LEVEL,
    timeout: process.env.CODEX_TIMEOUT ? Number.parseInt(process.env.CODEX_TIMEOUT, 10) : undefined,
    executeTimeout: process.env.CODEX_EXECUTE_TIMEOUT
      ? Number.parseInt(process.env.CODEX_EXECUTE_TIMEOUT, 10)
      : undefined,
    security: {
      allowedWorkingDirs: allowedDirs ?? [process.env.HOME ?? '/tmp'],
      allowDangerSandbox: process.env.CODEX_ALLOW_DANGER_SANDBOX === 'true',
      allowFullAuto: process.env.CODEX_ALLOW_FULL_AUTO === 'true',
      maxConcurrentProcesses: process.env.CODEX_MAX_CONCURRENT
        ? Number.parseInt(process.env.CODEX_MAX_CONCURRENT, 10)
        : undefined,
    },
  };

  try {
    return ServerConfigSchema.parse(rawConfig);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('[Config] Invalid configuration:');
      for (const issue of error.issues) {
        console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
      }
      console.error('[Config] Using default configuration');
    }

    return {
      logLevel: 'info',
      timeout: 30000,
      executeTimeout: 120000,
      security: {
        allowedWorkingDirs: [process.env.HOME ?? '/tmp'],
        allowDangerSandbox: false,
        allowFullAuto: false,
        maxConcurrentProcesses: 3,
      },
    };
  }
}

async function main() {
  try {
    const serverConfig = buildConfig();
    const server = new CodexMCPServer(serverConfig);
    await server.start();
  } catch (error) {
    console.error('Failed to start Codex MCP Server:', error);
    process.exit(1);
  }
}

main();
