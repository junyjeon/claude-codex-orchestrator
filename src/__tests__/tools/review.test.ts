import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseReviewOutput } from '../../tools/review.js';
import type { ServerConfig } from '../../types/index.js';

// Separate mock scope for handleReview tests
vi.mock('../../codex/client.js', () => ({
  callCodex: vi.fn(),
}));

vi.mock('../../security.js', () => ({
  sanitizeErrorOutput: vi.fn((text: string) => text),
}));

import { callCodex } from '../../codex/client.js';
import { handleReview } from '../../tools/review.js';

const mockedCallCodex = vi.mocked(callCodex);

const baseConfig: ServerConfig = {
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

describe('parseReviewOutput', () => {
  it('parses valid JSON directly', () => {
    const json = JSON.stringify({
      issues: [
        {
          severity: 'high',
          line: 10,
          message: 'SQL injection risk',
          suggestion: 'Use parameterized queries',
        },
      ],
      summary: 'Security issues found',
      score: 60,
    });

    const result = parseReviewOutput(json);
    expect(result.score).toBe(60);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.severity).toBe('high');
  });

  it('extracts JSON from mixed text', () => {
    const text = `Here is my review:\n${JSON.stringify({
      issues: [{ severity: 'low', message: 'Missing type annotation' }],
      summary: 'Minor issues',
      score: 85,
    })}\nThat's all.`;

    const result = parseReviewOutput(text);
    expect(result.score).toBe(85);
    expect(result.issues).toHaveLength(1);
  });

  it('falls back to raw text when JSON is invalid', () => {
    const text = 'This code looks good overall. No major issues found.';

    const result = parseReviewOutput(text);
    expect(result.score).toBe(50);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.severity).toBe('info');
    expect(result.issues[0]?.message).toContain('looks good');
  });

  it('handles empty string', () => {
    const result = parseReviewOutput('');
    expect(result.score).toBe(50);
    expect(result.summary).toContain('could not be parsed');
  });

  it('validates required fields in parsed JSON', () => {
    // Missing "score" field
    const json = JSON.stringify({ issues: [], summary: 'ok' });
    const result = parseReviewOutput(json);
    // Should fallback since score is missing
    expect(result.score).toBe(50);
  });
});

describe('handleReview', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns structured review on success', async () => {
    const reviewJson = JSON.stringify({
      issues: [{ severity: 'medium', message: 'No error handling', line: 5 }],
      summary: 'Needs improvement',
      score: 65,
    });

    mockedCallCodex.mockResolvedValue({
      success: true,
      events: [],
      finalMessage: reviewJson,
      filesChanged: [],
      commandsRun: [],
    });

    const result = await handleReview(
      { code: 'function foo() {}', review_focus: 'quality' },
      baseConfig,
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('Score: 65/100');
    expect(result.content[0].text).toContain('No error handling');
  });

  it('returns error when callCodex fails', async () => {
    mockedCallCodex.mockResolvedValue({
      success: false,
      events: [],
      finalMessage: '',
      filesChanged: [],
      commandsRun: [],
      error: { code: 'CODEX_TIMEOUT', message: 'Timeout' },
    });

    const result = await handleReview({ code: 'x' }, baseConfig);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Codex review failed');
  });

  it('handles thrown exceptions', async () => {
    mockedCallCodex.mockRejectedValue(new Error('Connection lost'));

    const result = await handleReview({ code: 'x' }, baseConfig);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Connection lost');
  });

  it('falls back gracefully when Codex returns non-JSON', async () => {
    mockedCallCodex.mockResolvedValue({
      success: true,
      events: [],
      finalMessage: 'The code is fine, no issues found.',
      filesChanged: [],
      commandsRun: [],
    });

    const result = await handleReview({ code: 'const x = 1;' }, baseConfig);

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('Score: 50/100');
  });
});
