/**
 * codex_execute tool handler
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { callCodex } from '../codex/client.js';
import { buildExecutePrompt } from '../codex/prompts.js';
import { sanitizeErrorOutput, validateWorkingDir } from '../security.js';
import { ApprovalMode, type ExecuteInput, SandboxMode, type ServerConfig } from '../types/index.js';

export async function handleExecute(
  input: ExecuteInput,
  config: ServerConfig,
): Promise<CallToolResult> {
  const startTime = Date.now();

  try {
    // Validate working directory before execution
    const pathCheck = validateWorkingDir(input.working_dir, config.security.allowedWorkingDirs);
    if (!pathCheck.valid) {
      return {
        content: [{ type: 'text', text: `Security: ${pathCheck.error}` }],
        isError: true,
      };
    }

    // fullAuto requires: env var enabled AND no explicit approval_mode from caller
    const useFullAuto = config.security.allowFullAuto && !input.approval_mode;

    // When fullAuto is active, don't set approvalMode (they conflict in CLI flags).
    // Otherwise default to on-failure for safe execution.
    const effectiveApprovalMode = useFullAuto
      ? undefined
      : (input.approval_mode ?? ApprovalMode.ON_FAILURE);

    const prompt = buildExecutePrompt(input);

    if (config.logLevel === 'debug') {
      console.error(`[codex_execute] Prompt: ${prompt.slice(0, 200)}...`);
    }

    const result = await callCodex(prompt, {
      timeout: config.executeTimeout,
      json: true,
      fullAuto: useFullAuto,
      approvalMode: effectiveApprovalMode,
      sandbox: input.sandbox ?? SandboxMode.WORKSPACE_WRITE,
      workingDir: pathCheck.resolved,
    });

    const elapsed = Date.now() - startTime;

    if (config.logLevel === 'debug' || config.logLevel === 'info') {
      console.error(
        `[codex_execute] ${result.success ? 'OK' : 'FAIL'} (${elapsed}ms) ` +
          `files=${result.filesChanged.length} cmds=${result.commandsRun.length}`,
      );
    }

    if (result.success) {
      const output = {
        result: result.finalMessage,
        files_changed: result.filesChanged,
        commands_run: result.commandsRun,
        success: true,
      };

      const summary = [
        result.finalMessage,
        result.filesChanged.length > 0 ? `\nFiles changed: ${result.filesChanged.join(', ')}` : '',
        result.commandsRun.length > 0 ? `\nCommands run: ${result.commandsRun.join(', ')}` : '',
      ].join('');

      return {
        content: [{ type: 'text', text: summary }],
        structuredContent: output,
      };
    }

    const error = result.error;
    const errorText = error
      ? `${error.message}${error.details ? `\nDetails: ${sanitizeErrorOutput(error.details)}` : ''}\nCode: ${error.code}`
      : 'Unknown error';
    return {
      content: [{ type: 'text', text: `Codex execution failed: ${errorText}` }],
      isError: true,
    };
  } catch (error) {
    const elapsed = Date.now() - startTime;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[codex_execute] Error (${elapsed}ms): ${message}`);
    return {
      content: [{ type: 'text', text: `Error: ${sanitizeErrorOutput(message)}` }],
      isError: true,
    };
  }
}
