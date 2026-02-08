import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerConfig } from '../../types/index.js';

// Mock callCodex
vi.mock('../../codex/client.js', () => ({
  callCodex: vi.fn(),
}));

// Mock security (validateWorkingDir + sanitizeErrorOutput)
vi.mock('../../security.js', () => ({
  validateWorkingDir: vi.fn(),
  sanitizeErrorOutput: vi.fn((text: string) => text),
}));

import { callCodex } from '../../codex/client.js';
import { validateWorkingDir } from '../../security.js';
import { handleGenerate } from '../../tools/generate.js';

const mockedCallCodex = vi.mocked(callCodex);
const mockedValidateWorkingDir = vi.mocked(validateWorkingDir);

const baseConfig: ServerConfig = {
  logLevel: 'warn',
  timeout: 30000,
  executeTimeout: 120000,
  security: {
    allowedWorkingDirs: ['/home/user/projects'],
    allowDangerSandbox: false,
    allowFullAuto: false,
    maxConcurrentProcesses: 3,
  },
};

describe('handleGenerate', () => {
  beforeEach(() => {
    mockedValidateWorkingDir.mockReturnValue({ valid: true, resolved: '/home/user/projects/app' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns generated code on success', async () => {
    mockedCallCodex.mockResolvedValue({
      success: true,
      events: [],
      finalMessage: '```typescript\nconst x = 1;\n```\nThis creates a variable.',
      filesChanged: [],
      commandsRun: [],
    });

    const result = await handleGenerate(
      { task_description: 'Create a variable', language: 'typescript' },
      baseConfig,
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0]).toEqual({
      type: 'text',
      text: expect.stringContaining('const x = 1'),
    });
  });

  it('extracts code and explanation from response', async () => {
    mockedCallCodex.mockResolvedValue({
      success: true,
      events: [],
      finalMessage: 'Here is the code:\n```python\ndef hello():\n    print("hi")\n```\nDone.',
      filesChanged: [],
      commandsRun: [],
    });

    const result = await handleGenerate(
      { task_description: 'Say hello', language: 'python' },
      baseConfig,
    );

    const structured = result.structuredContent as Record<string, unknown>;
    expect(structured.code).toContain('def hello()');
    expect(structured.language).toBe('python');
  });

  it('returns error when callCodex fails', async () => {
    mockedCallCodex.mockResolvedValue({
      success: false,
      events: [],
      finalMessage: '',
      filesChanged: [],
      commandsRun: [],
      error: { code: 'CODEX_TIMEOUT', message: 'Timeout', details: 'after 30s' },
    });

    const result = await handleGenerate(
      { task_description: 'Generate', language: 'js' },
      baseConfig,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Codex generation failed');
  });

  it('validates working_dir when provided', async () => {
    mockedValidateWorkingDir.mockReturnValue({
      valid: false,
      resolved: '',
      error: 'Path "/etc" is outside allowed directories',
    });

    const result = await handleGenerate(
      { task_description: 'Generate', language: 'ts', working_dir: '/etc' },
      baseConfig,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Security');
    expect(mockedCallCodex).not.toHaveBeenCalled();
  });

  it('skips working_dir validation when not provided', async () => {
    mockedCallCodex.mockResolvedValue({
      success: true,
      events: [],
      finalMessage: 'code',
      filesChanged: [],
      commandsRun: [],
    });

    await handleGenerate({ task_description: 'Generate', language: 'ts' }, baseConfig);

    expect(mockedValidateWorkingDir).not.toHaveBeenCalled();
  });

  it('handles thrown exceptions', async () => {
    mockedCallCodex.mockRejectedValue(new Error('Network error'));

    const result = await handleGenerate(
      { task_description: 'Generate', language: 'ts' },
      baseConfig,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Network error');
  });

  it('passes resolved working_dir to callCodex', async () => {
    mockedValidateWorkingDir.mockReturnValue({
      valid: true,
      resolved: '/home/user/projects/resolved',
    });
    mockedCallCodex.mockResolvedValue({
      success: true,
      events: [],
      finalMessage: 'ok',
      filesChanged: [],
      commandsRun: [],
    });

    await handleGenerate(
      { task_description: 'Generate', language: 'ts', working_dir: '/home/user/projects/app' },
      baseConfig,
    );

    expect(mockedCallCodex).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ workingDir: '/home/user/projects/resolved' }),
    );
  });
});
