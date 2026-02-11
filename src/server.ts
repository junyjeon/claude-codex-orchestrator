/**
 * MCP Server for Codex CLI orchestration.
 * Uses McpServer + registerTool() pattern (SDK 1.26.0).
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { initSemaphore } from './codex/client.js';
import { suggestModel } from './router/suggest.js';
import { handleExecute } from './tools/execute.js';
import { handleGenerate } from './tools/generate.js';
import { handleReview } from './tools/review.js';
import type { ServerConfig } from './types/index.js';

export class CodexMCPServer {
  private server: McpServer;
  private config: ServerConfig;

  constructor(config: ServerConfig) {
    this.config = config;
    this.server = new McpServer(
      { name: 'claude-codex-orchestrator', version: '1.0.0' },
      { capabilities: { tools: {} } },
    );
    initSemaphore(config.security.maxConcurrentProcesses);
    this.registerTools();
  }

  private registerTools(): void {
    this.registerGenerateTool();
    this.registerExecuteTool();
    this.registerReviewTool();
    this.registerSuggestModelTool();
  }

  private registerGenerateTool(): void {
    this.server.registerTool(
      'codex_generate',
      {
        title: 'Codex Generate',
        description: 'Generate code using Codex CLI (GPT-5.3). Fast first-attempt code generation.',
        inputSchema: z.object({
          task_description: z.string().min(1).describe('Clear description of the code to generate'),
          language: z
            .string()
            .min(1)
            .describe('Programming language (e.g., "typescript", "python")'),
          context: z.string().optional().describe('Additional context or constraints'),
          working_dir: z.string().optional().describe('Working directory for project context'),
        }),
      },
      async (args) => handleGenerate(args, this.config),
    );
  }

  private registerExecuteTool(): void {
    const sandboxOptions = this.config.security.allowDangerSandbox
      ? (['read-only', 'workspace-write', 'danger-full-access'] as const)
      : (['read-only', 'workspace-write'] as const);

    this.server.registerTool(
      'codex_execute',
      {
        title: 'Codex Execute',
        description:
          'Autonomous task execution using Codex CLI. Runs do-run-inspect loops to complete tasks.',
        inputSchema: z.object({
          task_description: z.string().min(1).describe('Task to execute autonomously'),
          working_dir: z.string().min(1).describe('Working directory (required for execution)'),
          approval_mode: z
            .enum(['untrusted', 'on-failure', 'on-request', 'never'])
            .optional()
            .describe('Approval mode. Default: on-failure'),
          sandbox: z
            .enum(sandboxOptions)
            .optional()
            .describe('Sandbox mode. Default: workspace-write'),
        }),
      },
      async (args) => handleExecute(args, this.config),
    );
  }

  private registerReviewTool(): void {
    this.server.registerTool(
      'codex_review',
      {
        title: 'Codex Review',
        description:
          'Code review from Codex (GPT-5.3) perspective. Provides a different AI viewpoint.',
        inputSchema: z.object({
          code: z.string().min(1).describe('Code to review'),
          file_path: z.string().optional().describe('File path for context'),
          review_focus: z
            .enum(['security', 'performance', 'quality', 'all'])
            .optional()
            .describe('Review focus area. Default: all'),
          language: z.string().optional().describe('Programming language'),
        }),
      },
      async (args) => handleReview(args, this.config),
    );
  }

  private registerSuggestModelTool(): void {
    this.server.registerTool(
      'suggest_model',
      {
        title: 'Suggest Model',
        description:
          'Recommend Claude or Codex for a task. Pure rule-based, no API call. Provide task_type for meaningful results (confidence >= 0.6). Description-only calls return low confidence.',
        inputSchema: z.object({
          task_description: z.string().min(1).describe('Description of the task'),
          task_type: z
            .enum(['architecture', 'implementation', 'ui', 'review', 'debug', 'refactor'])
            .optional()
            .describe('Type of task'),
          context_size: z.number().optional().describe('Estimated context size in tokens'),
          complexity: z
            .enum(['simple', 'moderate', 'complex'])
            .optional()
            .describe('Task complexity'),
        }),
      },
      async (args) => {
        const result = suggestModel(args);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        };
      },
    );
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    if (this.config.logLevel === 'info' || this.config.logLevel === 'debug') {
      console.error('[Codex MCP Server] v1.0.0 started (4 tools registered)');
    }
  }
}
