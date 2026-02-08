/**
 * Prompt templates for each Codex tool
 */

import type { ExecuteInput, GenerateInput, ReviewInput } from '../types/index.js';

export function buildGeneratePrompt(input: GenerateInput): string {
  let prompt = `Generate ${input.language} code for the following task:\n${input.task_description}`;

  prompt += '\n\nRequirements:';
  prompt += `\n- Provide clean, well-structured ${input.language} code`;
  prompt += `\n- Follow ${input.language} best practices and conventions`;
  prompt += '\n- Include brief inline comments for non-obvious logic';

  if (input.context) {
    prompt += `\n\nAdditional context:\n${input.context}`;
  }

  return prompt;
}

export function buildExecutePrompt(input: ExecuteInput): string {
  let prompt = `Complete the following task autonomously:\n${input.task_description}`;

  prompt += '\n\nInstructions:';
  prompt += '\n- Make the necessary file changes to accomplish the task';
  prompt += '\n- Run any commands needed to verify your work';
  prompt += '\n- Fix any errors that arise during execution';

  return prompt;
}

export function buildReviewPrompt(input: ReviewInput): string {
  const focus = input.review_focus ?? 'all';
  let prompt = `Review the following code for ${focus} issues.`;

  if (input.file_path) {
    prompt += `\nFile: ${input.file_path}`;
  }
  if (input.language) {
    prompt += `\nLanguage: ${input.language}`;
  }

  prompt += `\n\nCode:\n\`\`\`\n${input.code}\n\`\`\``;

  prompt += '\n\nRespond ONLY with valid JSON in this exact format:';
  prompt +=
    '\n{"issues": [{"severity": "critical|high|medium|low|info", "line": <number|null>, "message": "<description>", "suggestion": "<fix>"}], "summary": "<overall assessment>", "score": <0-100>}';
  prompt += '\n\nScore: 0-100 where 100 is perfect code with no issues.';

  return prompt;
}
