/**
 * codex_review tool handler
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { callCodex } from '../codex/client.js';
import { buildReviewPrompt } from '../codex/prompts.js';
import { sanitizeErrorOutput } from '../security.js';
import type { ReviewInput, ReviewOutput, ServerConfig } from '../types/index.js';

export async function handleReview(
  input: ReviewInput,
  config: ServerConfig,
): Promise<CallToolResult> {
  const startTime = Date.now();

  try {
    const prompt = buildReviewPrompt(input);

    if (config.logLevel === 'debug') {
      console.error(`[codex_review] Reviewing ${input.file_path ?? 'inline code'}`);
    }

    const result = await callCodex(prompt, {
      timeout: config.timeout,
      json: true,
      skipGitRepoCheck: true,
    });

    const elapsed = Date.now() - startTime;

    if (config.logLevel === 'debug' || config.logLevel === 'info') {
      console.error(`[codex_review] ${result.success ? 'OK' : 'FAIL'} (${elapsed}ms)`);
    }

    if (result.success) {
      const review = parseReviewOutput(result.finalMessage);
      return {
        content: [{ type: 'text', text: formatReviewText(review) }],
        structuredContent: review,
      };
    }

    const error = result.error;
    const errorText = error
      ? `${error.message}${error.details ? `\nDetails: ${sanitizeErrorOutput(error.details)}` : ''}\nCode: ${error.code}`
      : 'Unknown error';
    return {
      content: [{ type: 'text', text: `Codex review failed: ${errorText}` }],
      isError: true,
    };
  } catch (error) {
    const elapsed = Date.now() - startTime;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[codex_review] Error (${elapsed}ms): ${message}`);
    return {
      content: [{ type: 'text', text: `Error: ${sanitizeErrorOutput(message)}` }],
      isError: true,
    };
  }
}

/**
 * Parse review output from Codex response.
 * Tries JSON parse first, then regex extraction, then raw text fallback.
 */
export function parseReviewOutput(text: string): ReviewOutput {
  // Strategy 1: Direct JSON parse
  try {
    const parsed = JSON.parse(text);
    if (isValidReviewOutput(parsed)) return parsed;
  } catch {
    /* continue to next strategy */
  }

  // Strategy 2: Extract JSON block from text
  const jsonMatch = text.match(/\{[\s\S]*"issues"[\s\S]*"summary"[\s\S]*"score"[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (isValidReviewOutput(parsed)) return parsed;
    } catch {
      /* continue to next strategy */
    }
  }

  // Strategy 3: Fallback to raw text
  return {
    issues: [{ severity: 'info', message: text }],
    summary: 'Review output could not be parsed as structured JSON.',
    score: 50,
  };
}

function isValidReviewOutput(obj: unknown): obj is ReviewOutput {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  return Array.isArray(o.issues) && typeof o.summary === 'string' && typeof o.score === 'number';
}

function formatReviewText(review: ReviewOutput): string {
  const lines = [`Score: ${review.score}/100`, `Summary: ${review.summary}`, ''];

  for (const issue of review.issues) {
    const lineInfo = issue.line ? ` (line ${issue.line})` : '';
    lines.push(`[${issue.severity.toUpperCase()}]${lineInfo} ${issue.message}`);
    if (issue.suggestion) {
      lines.push(`  Suggestion: ${issue.suggestion}`);
    }
  }

  return lines.join('\n');
}
