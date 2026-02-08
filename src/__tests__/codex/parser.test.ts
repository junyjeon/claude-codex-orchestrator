import { describe, expect, it } from 'vitest';
import {
  buildCodexResult,
  extractCommandsRun,
  extractFilesChanged,
  extractFinalMessage,
  parseJsonlLine,
  parseJsonlStream,
} from '../../codex/parser.js';

describe('parseJsonlLine', () => {
  it('parses a valid JSONL line', () => {
    const result = parseJsonlLine('{"type":"thread.started","thread_id":"abc123"}');
    expect(result).toEqual({ type: 'thread.started', thread_id: 'abc123' });
  });

  it('returns null for empty string', () => {
    expect(parseJsonlLine('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(parseJsonlLine('   ')).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    expect(parseJsonlLine('not json')).toBeNull();
  });

  it('returns null for JSON without type field', () => {
    expect(parseJsonlLine('{"foo":"bar"}')).toBeNull();
  });

  it('returns null for JSON where type is not a string', () => {
    expect(parseJsonlLine('{"type":42}')).toBeNull();
  });

  it('trims whitespace before parsing', () => {
    const result = parseJsonlLine('  {"type":"turn.started"}  ');
    expect(result).toEqual({ type: 'turn.started' });
  });
});

describe('parseJsonlStream', () => {
  it('parses multi-line JSONL output', () => {
    const raw = [
      '{"type":"thread.started","thread_id":"t1"}',
      '{"type":"turn.started"}',
      '{"type":"turn.completed"}',
    ].join('\n');

    const events = parseJsonlStream(raw);
    expect(events).toHaveLength(3);
    expect(events[0]?.type).toBe('thread.started');
    expect(events[2]?.type).toBe('turn.completed');
  });

  it('skips empty lines and invalid lines', () => {
    const raw = ['{"type":"turn.started"}', '', 'garbage', '{"type":"turn.completed"}'].join('\n');

    const events = parseJsonlStream(raw);
    expect(events).toHaveLength(2);
  });

  it('handles empty string', () => {
    expect(parseJsonlStream('')).toEqual([]);
  });
});

describe('extractFinalMessage', () => {
  it('extracts the last agent_message text', () => {
    const events = [
      { type: 'item.completed', item: { id: '1', type: 'agent_message', text: 'first' } },
      { type: 'item.completed', item: { id: '2', type: 'agent_message', text: 'second' } },
    ];
    expect(extractFinalMessage(events)).toBe('second');
  });

  it('ignores item.started events', () => {
    const events = [
      { type: 'item.started', item: { id: '1', type: 'agent_message', text: 'started' } },
      { type: 'item.completed', item: { id: '1', type: 'agent_message', text: 'completed' } },
    ];
    expect(extractFinalMessage(events)).toBe('completed');
  });

  it('returns empty string when no agent messages', () => {
    const events = [{ type: 'turn.started' }, { type: 'turn.completed' }];
    expect(extractFinalMessage(events)).toBe('');
  });

  it('ignores non-agent_message items', () => {
    const events = [
      { type: 'item.completed', item: { id: '1', type: 'command_execution', command: 'ls' } },
    ];
    expect(extractFinalMessage(events)).toBe('');
  });
});

describe('extractFilesChanged', () => {
  it('collects file paths from file_change events', () => {
    const events = [
      {
        type: 'item.completed',
        item: { id: '1', type: 'file_change', path: 'src/a.ts', action: 'create' },
      },
      {
        type: 'item.completed',
        item: { id: '2', type: 'file_change', path: 'src/b.ts', action: 'modify' },
      },
    ];
    expect(extractFilesChanged(events)).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('deduplicates file paths', () => {
    const events = [
      {
        type: 'item.completed',
        item: { id: '1', type: 'file_change', path: 'src/a.ts', action: 'create' },
      },
      {
        type: 'item.completed',
        item: { id: '2', type: 'file_change', path: 'src/a.ts', action: 'modify' },
      },
    ];
    expect(extractFilesChanged(events)).toEqual(['src/a.ts']);
  });

  it('returns empty array when no file changes', () => {
    expect(extractFilesChanged([{ type: 'turn.started' }])).toEqual([]);
  });
});

describe('extractCommandsRun', () => {
  it('collects commands from command_execution events', () => {
    const events = [
      {
        type: 'item.completed',
        item: { id: '1', type: 'command_execution', command: 'npm test', status: 'done' },
      },
      {
        type: 'item.completed',
        item: { id: '2', type: 'command_execution', command: 'npm build', status: 'done' },
      },
    ];
    expect(extractCommandsRun(events)).toEqual(['npm test', 'npm build']);
  });

  it('returns empty array when no commands', () => {
    expect(extractCommandsRun([])).toEqual([]);
  });
});

describe('buildCodexResult', () => {
  it('combines all extractors into a result', () => {
    const events = [
      { type: 'item.completed', item: { id: '1', type: 'agent_message', text: 'Done' } },
      {
        type: 'item.completed',
        item: { id: '2', type: 'file_change', path: 'a.ts', action: 'create' },
      },
      {
        type: 'item.completed',
        item: { id: '3', type: 'command_execution', command: 'tsc', status: 'done' },
      },
    ];

    const result = buildCodexResult(events);
    expect(result.finalMessage).toBe('Done');
    expect(result.filesChanged).toEqual(['a.ts']);
    expect(result.commandsRun).toEqual(['tsc']);
    expect(result.events).toBe(events);
  });
});
