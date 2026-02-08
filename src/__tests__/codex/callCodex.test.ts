import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock child_process.spawn
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

// Mock security module
vi.mock('../../security.js', () => ({
  ProcessSemaphore: vi.fn(),
  sanitizeErrorOutput: vi.fn((text: string) => text),
}));

import { spawn } from 'node:child_process';
import { callCodex } from '../../codex/client.js';

const mockedSpawn = vi.mocked(spawn);

function createMockChild() {
  const stdin = new EventEmitter() as EventEmitter & {
    write: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
  };
  stdin.write = vi.fn();
  stdin.end = vi.fn();

  const stdout = new EventEmitter();
  const stderr = new EventEmitter();

  const child = new EventEmitter() as EventEmitter & {
    stdin: typeof stdin;
    stdout: typeof stdout;
    stderr: typeof stderr;
    killed: boolean;
    kill: ReturnType<typeof vi.fn>;
    removeAllListeners: ReturnType<typeof vi.fn>;
  };
  child.stdin = stdin;
  child.stdout = stdout;
  child.stderr = stderr;
  child.killed = false;
  child.kill = vi.fn(() => {
    child.killed = true;
  });
  child.removeAllListeners = vi.fn(() => child);

  return child;
}

describe('callCodex', () => {
  let mockChild: ReturnType<typeof createMockChild>;

  beforeEach(() => {
    mockChild = createMockChild();
    mockedSpawn.mockReturnValue(mockChild as ReturnType<typeof spawn>);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns success with stdout on exit code 0 (non-json mode)', async () => {
    const promise = callCodex('test prompt', { timeout: 5000 });

    // Simulate stdout data
    mockChild.stdout.emit('data', Buffer.from('Generated code here'));
    // Simulate successful exit
    mockChild.emit('close', 0, null);

    const result = await promise;
    expect(result.success).toBe(true);
    expect(result.finalMessage).toBe('Generated code here');
  });

  it('writes prompt to stdin', async () => {
    const promise = callCodex('hello world', { timeout: 5000 });

    mockChild.stdout.emit('data', Buffer.from('ok'));
    mockChild.emit('close', 0, null);

    await promise;
    expect(mockChild.stdin.write).toHaveBeenCalledWith('hello world', 'utf-8');
    expect(mockChild.stdin.end).toHaveBeenCalled();
  });

  it('returns error on non-zero exit code', async () => {
    const promise = callCodex('test', { timeout: 5000 });

    mockChild.stderr.emit('data', Buffer.from('Command not found'));
    mockChild.emit('close', 127, null);

    const result = await promise;
    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('exit code 127');
  });

  it('returns error on ENOENT (codex not installed)', async () => {
    const promise = callCodex('test', { timeout: 5000 });

    const error = new Error('spawn codex ENOENT') as NodeJS.ErrnoException;
    error.code = 'ENOENT';
    mockChild.emit('error', error);

    const result = await promise;
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('CODEX_NOT_FOUND');
  });

  it('returns error on EACCES (permission denied)', async () => {
    const promise = callCodex('test', { timeout: 5000 });

    const error = new Error('spawn codex EACCES') as NodeJS.ErrnoException;
    error.code = 'EACCES';
    mockChild.emit('error', error);

    const result = await promise;
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('CODEX_PERMISSION_DENIED');
  });

  it('returns error when output exceeds 1MB', async () => {
    const promise = callCodex('test', { timeout: 5000 });

    // Emit > 1MB of data
    const bigChunk = Buffer.alloc(1024 * 1024 + 1, 'x');
    mockChild.stdout.emit('data', bigChunk);

    const result = await promise;
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('CODEX_OUTPUT_TOO_LARGE');
  });

  it('parses JSONL output in json mode', async () => {
    const promise = callCodex('test', { json: true, timeout: 5000 });

    const events = [
      '{"type":"thread.started","thread_id":"t1"}',
      '{"type":"item.completed","item":{"id":"1","type":"agent_message","text":"Hello world"}}',
    ].join('\n');

    mockChild.stdout.emit('data', Buffer.from(events));
    mockChild.emit('close', 0, null);

    const result = await promise;
    expect(result.success).toBe(true);
    expect(result.finalMessage).toBe('Hello world');
  });

  it('handles SIGTERM signal as timeout', async () => {
    const promise = callCodex('test', { timeout: 5000 });

    mockChild.emit('close', null, 'SIGTERM');

    const result = await promise;
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('CODEX_TIMEOUT');
  });

  it('detects authentication errors', async () => {
    const promise = callCodex('test', { timeout: 5000 });

    mockChild.stderr.emit('data', Buffer.from('Authentication failed: unauthorized'));
    mockChild.emit('close', 1, null);

    const result = await promise;
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('CODEX_AUTH_FAILED');
  });

  it('resolves only once (safeResolve guard)', async () => {
    const promise = callCodex('test', { timeout: 5000 });

    // Emit close twice
    mockChild.stdout.emit('data', Buffer.from('ok'));
    mockChild.emit('close', 0, null);
    mockChild.emit('close', 1, null); // Should be ignored

    const result = await promise;
    expect(result.success).toBe(true);
  });
});
