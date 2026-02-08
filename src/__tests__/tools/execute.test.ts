import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerConfig } from '../../types/index.js';

vi.mock('../../codex/client.js', () => ({
  callCodex: vi.fn(),
}));

vi.mock('../../security.js', () => ({
  validateWorkingDir: vi.fn(),
  sanitizeErrorOutput: vi.fn((text: string) => text),
}));

import { callCodex } from '../../codex/client.js';
import { validateWorkingDir } from '../../security.js';
import { handleExecute } from '../../tools/execute.js';

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

describe('handleExecute', () => {
  beforeEach(() => {
    mockedValidateWorkingDir.mockReturnValue({ valid: true, resolved: '/home/user/projects/app' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns execution result on success', async () => {
    mockedCallCodex.mockResolvedValue({
      success: true,
      events: [],
      finalMessage: 'Task completed successfully',
      filesChanged: ['src/app.ts'],
      commandsRun: ['npm test'],
    });

    const result = await handleExecute(
      { task_description: 'Fix bug', working_dir: '/home/user/projects/app' },
      baseConfig,
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('Task completed');
    expect(result.content[0].text).toContain('src/app.ts');
    expect(result.content[0].text).toContain('npm test');
  });

  it('rejects path outside allowed directories', async () => {
    mockedValidateWorkingDir.mockReturnValue({
      valid: false,
      resolved: '',
      error: 'Path "/etc" is outside allowed directories',
    });

    const result = await handleExecute(
      { task_description: 'Run', working_dir: '/etc' },
      baseConfig,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Security');
    expect(mockedCallCodex).not.toHaveBeenCalled();
  });

  it('defaults to on-failure approval when allowFullAuto is false', async () => {
    mockedCallCodex.mockResolvedValue({
      success: true,
      events: [],
      finalMessage: 'ok',
      filesChanged: [],
      commandsRun: [],
    });

    await handleExecute(
      { task_description: 'Run', working_dir: '/home/user/projects/app' },
      baseConfig,
    );

    expect(mockedCallCodex).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        fullAuto: false,
        approvalMode: 'on-failure',
      }),
    );
  });

  it('uses fullAuto when allowed and no approval_mode set', async () => {
    const autoConfig = {
      ...baseConfig,
      security: { ...baseConfig.security, allowFullAuto: true },
    };

    mockedCallCodex.mockResolvedValue({
      success: true,
      events: [],
      finalMessage: 'ok',
      filesChanged: [],
      commandsRun: [],
    });

    await handleExecute(
      { task_description: 'Run', working_dir: '/home/user/projects/app' },
      autoConfig,
    );

    expect(mockedCallCodex).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        fullAuto: true,
        approvalMode: undefined,
      }),
    );
  });

  it('uses explicit approval_mode over fullAuto', async () => {
    const autoConfig = {
      ...baseConfig,
      security: { ...baseConfig.security, allowFullAuto: true },
    };

    mockedCallCodex.mockResolvedValue({
      success: true,
      events: [],
      finalMessage: 'ok',
      filesChanged: [],
      commandsRun: [],
    });

    await handleExecute(
      {
        task_description: 'Run',
        working_dir: '/home/user/projects/app',
        approval_mode: 'on-request',
      },
      autoConfig,
    );

    expect(mockedCallCodex).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        fullAuto: false,
        approvalMode: 'on-request',
      }),
    );
  });

  it('returns error when callCodex fails', async () => {
    mockedCallCodex.mockResolvedValue({
      success: false,
      events: [],
      finalMessage: '',
      filesChanged: [],
      commandsRun: [],
      error: { code: 'CODEX_EXEC_FAILED', message: 'Exit code 1', details: 'npm test failed' },
    });

    const result = await handleExecute(
      { task_description: 'Run', working_dir: '/home/user/projects/app' },
      baseConfig,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Codex execution failed');
  });

  it('handles thrown exceptions', async () => {
    mockedCallCodex.mockRejectedValue(new Error('spawn failed'));

    const result = await handleExecute(
      { task_description: 'Run', working_dir: '/home/user/projects/app' },
      baseConfig,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('spawn failed');
  });

  it('uses resolved path from validateWorkingDir', async () => {
    mockedValidateWorkingDir.mockReturnValue({
      valid: true,
      resolved: '/home/user/projects/actual-resolved',
    });
    mockedCallCodex.mockResolvedValue({
      success: true,
      events: [],
      finalMessage: 'ok',
      filesChanged: [],
      commandsRun: [],
    });

    await handleExecute(
      { task_description: 'Run', working_dir: '/home/user/projects/symlink' },
      baseConfig,
    );

    expect(mockedCallCodex).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ workingDir: '/home/user/projects/actual-resolved' }),
    );
  });

  it('defaults sandbox to workspace-write', async () => {
    mockedCallCodex.mockResolvedValue({
      success: true,
      events: [],
      finalMessage: 'ok',
      filesChanged: [],
      commandsRun: [],
    });

    await handleExecute(
      { task_description: 'Run', working_dir: '/home/user/projects/app' },
      baseConfig,
    );

    expect(mockedCallCodex).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ sandbox: 'workspace-write' }),
    );
  });
});
