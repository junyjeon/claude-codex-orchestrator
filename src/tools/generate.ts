/**
 * codex_generate tool handler
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { callCodex } from '../codex/client.js';
import { buildGeneratePrompt } from '../codex/prompts.js';
import { sanitizeErrorOutput, validateWorkingDir } from '../security.js';
import type { GenerateInput, ServerConfig } from '../types/index.js';

export async function handleGenerate(
  input: GenerateInput,
  config: ServerConfig,
  server: McpServer,
): Promise<CallToolResult> {
  const startTime = Date.now();
  const progressToken = `codex-gen-${Date.now()}`;

  try {
    // Validate working_dir if provided
    let resolvedWorkingDir: string | undefined;
    if (input.working_dir) {
      const pathCheck = validateWorkingDir(input.working_dir, config.security.allowedWorkingDirs);
      if (!pathCheck.valid) {
        return {
          content: [{ type: 'text', text: `Security: ${pathCheck.error}` }],
          isError: true,
        };
      }
      resolvedWorkingDir = pathCheck.resolved;
    }

    const prompt = buildGeneratePrompt(input);

    if (config.logLevel === 'debug') {
      console.error(`[codex_generate] Prompt: ${prompt.slice(0, 200)}...`);
    }

    // Send initial progress notification
    try {
      await server.server.notification({
        method: 'notifications/progress',
        params: {
          progressToken,
          progress: 0,
          total: 100,
        },
      });
    } catch (err) {
      // Ignore notification errors (client may not support it)
      if (config.logLevel === 'debug') {
        console.error('[codex_generate] Progress notification not supported');
      }
    }

    const result = await callCodex(
      prompt,
      {
        timeout: config.timeout,
        json: true,
        workingDir: resolvedWorkingDir,
        skipGitRepoCheck: true,
      },
      // Progress callback
      async (bytesReceived: number, estimatedTotal: number) => {
        try {
          const progress = Math.min(95, Math.floor((bytesReceived / estimatedTotal) * 100));
          await server.server.notification({
            method: 'notifications/progress',
            params: {
              progressToken,
              progress,
              total: 100,
            },
          });
        } catch {
          // Ignore
        }
      },
    );

    const elapsed = Date.now() - startTime;

    if (config.logLevel === 'debug' || config.logLevel === 'info') {
      console.error(`[codex_generate] ${result.success ? 'OK' : 'FAIL'} (${elapsed}ms)`);
    }

    // Send completion notification
    try {
      await server.server.notification({
        method: 'notifications/progress',
        params: {
          progressToken,
          progress: 100,
          total: 100,
        },
      });
    } catch {
      // Ignore
    }

    if (result.success) {
      const { code, explanation } = extractCodeAndExplanation(result.finalMessage);
      return {
        content: [{ type: 'text', text: result.finalMessage }],
        structuredContent: { code, explanation, language: input.language },
      };
    }

    return formatError(result.error);
  } catch (error) {
    const elapsed = Date.now() - startTime;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[codex_generate] Error (${elapsed}ms): ${message}`);
    return {
      content: [{ type: 'text', text: `Error: ${sanitizeErrorOutput(message)}` }],
      isError: true,
    };
  }
}

/**
 * Extract code blocks and explanation from agent message.
 */
function extractCodeAndExplanation(text: string): { code: string; explanation: string } {
  const codeBlockRegex = /```[\w]*\n([\s\S]*?)```/g;
  const codeBlocks: string[] = [];

  for (const match of text.matchAll(codeBlockRegex)) {
    if (match[1]) codeBlocks.push(match[1].trim());
  }

  if (codeBlocks.length > 0) {
    const code = codeBlocks.join('\n\n');
    const explanation = text.replace(codeBlockRegex, '').trim();
    return { code, explanation };
  }

  return { code: text, explanation: '' };
}

function formatError(
  error: { code: string; message: string; details?: string } | undefined,
): CallToolResult {
  const errorText = error
    ? `${error.message}${error.details ? `\nDetails: ${sanitizeErrorOutput(error.details)}` : ''}\nCode: ${error.code}`
    : 'Unknown error';
  return {
    content: [{ type: 'text', text: `Codex generation failed: ${errorText}` }],
    isError: true,
  };
}
