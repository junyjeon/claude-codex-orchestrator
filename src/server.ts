/**
 * MCP Server for Codex CLI integration
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { callCodex } from './codex.js';
import type { GenerateCodeParams, ServerConfig } from './types/index.js';

// Zod schema for input validation
const GenerateCodeParamsSchema = z.object({
  task_description: z.string().min(1, 'Task description is required'),
  language: z.string().min(1, 'Language is required'),
  context: z.string().optional(),
});

export class CodexMCPServer {
  private server: Server;
  private config: ServerConfig;

  constructor(config: ServerConfig) {
    this.config = config;
    this.server = new Server(
      {
        name: 'claude-codex-orchestrator',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'generate_code',
          description:
            'Generate code using Codex CLI (GPT-5). Provide a clear task description and programming language.',
          inputSchema: {
            type: 'object',
            properties: {
              task_description: {
                type: 'string',
                description: 'Clear description of the code to generate (e.g., "binary search function")',
              },
              language: {
                type: 'string',
                description: 'Programming language (e.g., "typescript", "python", "javascript")',
              },
              context: {
                type: 'string',
                description: 'Optional additional context or constraints',
              },
            },
            required: ['task_description', 'language'],
          },
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name === 'generate_code') {
        return await this.handleGenerateCode(request.params.arguments);
      }

      throw new Error(`Unknown tool: ${request.params.name}`);
    });
  }

  private async handleGenerateCode(args: unknown): Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }> {
    const startTime = Date.now();

    try {
      // Validate parameters
      const params = GenerateCodeParamsSchema.parse(args) as GenerateCodeParams;

      // Build prompt for Codex
      let prompt = `Generate ${params.language} code: ${params.task_description}`;
      if (params.context) {
        prompt += `\n\nContext: ${params.context}`;
      }

      // Log if debug mode
      if (this.config.logLevel === 'debug') {
        console.error(`[Codex] Calling with prompt: ${prompt}`);
      }

      // Call Codex CLI
      const codexResult = await callCodex(prompt, {
        timeout: this.config.timeout,
      });

      const executionTime = Date.now() - startTime;

      // Log result
      if (this.config.logLevel === 'debug' || this.config.logLevel === 'info') {
        console.error(`[Codex] ${codexResult.success ? 'Success' : 'Failed'} (${executionTime}ms)`);
      }

      // Return result
      if (codexResult.success) {
        return {
          content: [
            {
              type: 'text',
              text: codexResult.code,
            },
          ],
        };
      } else {
        const error = codexResult.error;
        const errorText = error
          ? `${error.message}${error.details ? `\n\nDetails: ${error.details}` : ''}\n\nError Code: ${error.code}`
          : 'Unknown error';

        return {
          content: [
            {
              type: 'text',
              text: `Codex generation failed: ${errorText}`,
            },
          ],
          isError: true,
        };
      }
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (this.config.logLevel === 'debug' || this.config.logLevel === 'error') {
        console.error(`[Codex] Error (${executionTime}ms): ${errorMessage}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: `Error: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    if (this.config.logLevel === 'info' || this.config.logLevel === 'debug') {
      console.error('[Codex MCP Server] Started');
    }
  }
}
