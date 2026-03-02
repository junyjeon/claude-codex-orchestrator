import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseReviewOutput } from '../../tools/review.js';
import type { ServerConfig } from '../../types/index.js';

// Separate mock scope for handleReview tests
vi.mock('../../codex/client.js', () => ({
  callCodex: vi.fn(),
}));

vi.mock('../../security.js', () => ({
  sanitizeErrorOutput: vi.fn((text: string) => text),
  sanitizePromptInput: (text: string, _maxLength: number) => text,
  INPUT_LIMITS: {
    TASK_DESCRIPTION: 10_000,
    CONTEXT: 50_000,
    CODE_REVIEW: 100_000,
    FILE_PATH: 500,
    LANGUAGE: 50,
  },
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

describe('parseReviewOutput - Strategy 2', () => {
  it('extracts JSON via brace-matching when direct parse fails', () => {
    const text = 'Here is my analysis:\n{"issues":[{"severity":"medium","message":"No null check"}],"summary":"Needs fixes","score":70}\nEnd of review.';

    const result = parseReviewOutput(text);
    expect(result.score).toBe(70);
    expect(result.issues[0]?.message).toContain('No null check');
  });

  it('handles pathological input without catastrophic backtracking', () => {
    // Previously this would trigger O(n^4) backtracking with greedy [\s\S]* regex.
    // Now uses indexOf/lastIndexOf which is O(n).
    const pathological = '{ ' + '"issues" '.repeat(1000) + '"summary" '.repeat(1000) + '"score"';
    const start = performance.now();
    const result = parseReviewOutput(pathological);
    const elapsed = performance.now() - start;

    // Should complete in well under 100ms (linear scan, not exponential backtracking)
    expect(elapsed).toBeLessThan(100);
    // Falls back to raw text since the extracted substring isn't valid JSON
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

  it('logs info output when logLevel is info', async () => {
    const infoConfig: ServerConfig = { ...baseConfig, logLevel: 'info' };
    mockedCallCodex.mockResolvedValue({
      success: true,
      events: [],
      finalMessage: JSON.stringify({ issues: [], summary: 'ok', score: 90 }),
      filesChanged: [],
      commandsRun: [],
    });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await handleReview({ code: 'const x = 1;' }, infoConfig);

    expect(spy).toHaveBeenCalledWith(expect.stringContaining('[codex_review] OK'));
    spy.mockRestore();
  });

  it('formats error without details', async () => {
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
    expect(result.content[0].text).not.toContain('Details:');
  });

  it('formats review with suggestion field', async () => {
    const reviewJson = JSON.stringify({
      issues: [
        {
          severity: 'high',
          message: 'SQL injection risk',
          line: 10,
          suggestion: 'Use parameterized queries',
        },
      ],
      summary: 'Critical security issue',
      score: 40,
    });

    mockedCallCodex.mockResolvedValue({
      success: true,
      events: [],
      finalMessage: reviewJson,
      filesChanged: [],
      commandsRun: [],
    });

    const result = await handleReview({ code: 'select * from users' }, baseConfig);

    expect(result.content[0].text).toContain('Suggestion: Use parameterized queries');
    expect(result.content[0].text).toContain('(line 10)');
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
