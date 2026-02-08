import { existsSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProcessSemaphore, sanitizeErrorOutput, validateWorkingDir } from '../security.js';

// Mock fs functions
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  realpathSync: vi.fn(),
}));

const mockedExistsSync = vi.mocked(existsSync);
const mockedRealpathSync = vi.mocked(realpathSync);

describe('validateWorkingDir', () => {
  beforeEach(() => {
    mockedExistsSync.mockReturnValue(true);
    // By default, realpathSync returns the same path (no symlink)
    mockedRealpathSync.mockImplementation((p) => p as string);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts path within allowed root', () => {
    const result = validateWorkingDir('/home/user/projects/myapp', ['/home/user/projects']);
    expect(result.valid).toBe(true);
    expect(result.resolved).toBe('/home/user/projects/myapp');
  });

  it('accepts exact root path', () => {
    const result = validateWorkingDir('/home/user/projects', ['/home/user/projects']);
    expect(result.valid).toBe(true);
  });

  it('rejects path outside all allowed roots', () => {
    const result = validateWorkingDir('/etc/passwd', ['/home/user/projects']);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('outside allowed directories');
  });

  it('rejects path traversal with ../', () => {
    // resolve('/home/user/projects/../../etc') = '/home/etc'
    const result = validateWorkingDir('/home/user/projects/../../etc', ['/home/user/projects']);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('outside allowed directories');
  });

  it('prevents prefix false positive: /home/user vs /home/username', () => {
    const result = validateWorkingDir('/home/username/secrets', ['/home/user']);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('outside allowed directories');
  });

  it('rejects empty path', () => {
    const result = validateWorkingDir('', ['/home/user']);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('empty');
  });

  it('rejects whitespace-only path', () => {
    const result = validateWorkingDir('   ', ['/home/user']);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('empty');
  });

  it('rejects nonexistent path', () => {
    mockedExistsSync.mockReturnValue(false);
    const result = validateWorkingDir('/home/user/projects/missing', ['/home/user/projects']);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('does not exist');
  });

  it('accepts when any of multiple roots match', () => {
    const result = validateWorkingDir('/tmp/build', ['/home/user/projects', '/tmp']);
    expect(result.valid).toBe(true);
  });

  it('resolves relative paths against cwd', () => {
    const expectedPath = resolve('./subdir');
    mockedRealpathSync.mockReturnValue(expectedPath);
    const result = validateWorkingDir('./subdir', [process.cwd()]);
    expect(result.valid).toBe(true);
    expect(result.resolved).toBe(expectedPath);
  });

  it('blocks symlink that resolves outside allowed directory', () => {
    // Path looks allowed but symlink points elsewhere
    mockedRealpathSync.mockReturnValue('/etc/shadow');
    const result = validateWorkingDir('/home/user/projects/evil-link', ['/home/user/projects']);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('outside allowed directories');
  });

  it('accepts symlink that resolves within allowed directory', () => {
    mockedRealpathSync.mockReturnValue('/home/user/projects/actual-dir');
    const result = validateWorkingDir('/home/user/projects/link', ['/home/user/projects']);
    expect(result.valid).toBe(true);
    expect(result.resolved).toBe('/home/user/projects/actual-dir');
  });

  it('handles realpathSync failure gracefully', () => {
    mockedRealpathSync.mockImplementation(() => {
      throw new Error('Permission denied');
    });
    const result = validateWorkingDir('/home/user/projects/broken', ['/home/user/projects']);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Cannot resolve real path');
  });
});

describe('sanitizeErrorOutput', () => {
  it('redacts home directory paths', () => {
    const result = sanitizeErrorOutput('Error at /home/secretuser/project/file.ts');
    expect(result).not.toContain('secretuser');
    expect(result).toContain('[REDACTED]');
  });

  it('redacts macOS home paths', () => {
    const result = sanitizeErrorOutput('Path: /Users/johndoe/Documents');
    expect(result).not.toContain('johndoe');
  });

  it('redacts OpenAI API keys', () => {
    const result = sanitizeErrorOutput('API key: sk-proj-abcdefghijklmnopqrstuvwxyz');
    expect(result).not.toContain('sk-proj-');
  });

  it('redacts GitHub tokens', () => {
    const result = sanitizeErrorOutput('token=ghp_abcdefghijklmnopqrstuvwxyz1234567890');
    expect(result).not.toContain('ghp_');
  });

  it('redacts credential assignments', () => {
    const result = sanitizeErrorOutput('password=mysecretpass123');
    expect(result).not.toContain('mysecretpass');
  });

  it('leaves non-sensitive text intact', () => {
    const result = sanitizeErrorOutput('Codex CLI failed with exit code 1');
    expect(result).toBe('Codex CLI failed with exit code 1');
  });

  it('handles multiple sensitive patterns in one string', () => {
    const input = 'Error at /home/user/project, key=sk-proj-aaaabbbbccccddddeeee123456';
    const result = sanitizeErrorOutput(input);
    expect(result).not.toContain('/home/user');
    expect(result).not.toContain('sk-proj-');
  });
});

describe('ProcessSemaphore', () => {
  it('allows up to max concurrent acquisitions', async () => {
    const sem = new ProcessSemaphore(2);

    await sem.acquire();
    await sem.acquire();

    expect(sem.activeCount).toBe(2);

    sem.release();
    expect(sem.activeCount).toBe(1);

    sem.release();
    expect(sem.activeCount).toBe(0);
  });

  it('queues when at max capacity', async () => {
    const sem = new ProcessSemaphore(1);
    await sem.acquire();

    let secondAcquired = false;
    const secondPromise = sem.acquire().then(() => {
      secondAcquired = true;
    });

    // Should still be queued
    expect(secondAcquired).toBe(false);
    expect(sem.waitingCount).toBe(1);

    sem.release();

    // Wait for microtask to resolve
    await secondPromise;
    expect(secondAcquired).toBe(true);
    expect(sem.activeCount).toBe(1);

    sem.release();
  });

  it('processes queue in FIFO order', async () => {
    const sem = new ProcessSemaphore(1);
    await sem.acquire();

    const order: number[] = [];

    const p1 = sem.acquire().then(() => order.push(1));
    const p2 = sem.acquire().then(() => order.push(2));

    sem.release(); // releases to first waiter
    await p1;

    sem.release(); // releases to second waiter
    await p2;

    expect(order).toEqual([1, 2]);

    sem.release();
  });
});
