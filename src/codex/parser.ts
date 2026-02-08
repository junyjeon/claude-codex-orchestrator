/**
 * JSONL output parser for Codex CLI --json flag
 */

import type {
  AgentMessageItem,
  CodexEvent,
  CodexItem,
  CommandExecutionItem,
  FileChangeItem,
  ItemEvent,
} from '../types/index.js';

/**
 * Parse a single JSONL line into a CodexEvent.
 * Returns null for empty lines or parse errors.
 */
export function parseJsonlLine(line: string): CodexEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed) as CodexEvent;
    if (!parsed || typeof parsed.type !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Parse raw stdout (JSONL) into an array of CodexEvents.
 */
export function parseJsonlStream(raw: string): CodexEvent[] {
  return raw
    .split('\n')
    .map(parseJsonlLine)
    .filter((event): event is CodexEvent => event !== null);
}

/**
 * Extract the final agent message text from events.
 * Takes the last item.completed event with type=agent_message.
 */
export function extractFinalMessage(events: CodexEvent[]): string {
  const agentMessages: string[] = [];

  for (const event of events) {
    if (isItemEvent(event) && event.type === 'item.completed') {
      if (isAgentMessage(event.item)) {
        agentMessages.push(event.item.text);
      }
    }
  }

  return agentMessages.at(-1) ?? '';
}

/**
 * Extract all changed file paths from file_change events.
 */
export function extractFilesChanged(events: CodexEvent[]): string[] {
  const files: string[] = [];

  for (const event of events) {
    if (isItemEvent(event) && event.type === 'item.completed') {
      if (isFileChange(event.item)) {
        files.push(event.item.path);
      }
    }
  }

  return [...new Set(files)];
}

/**
 * Extract all executed commands from command_execution events.
 */
export function extractCommandsRun(events: CodexEvent[]): string[] {
  const commands: string[] = [];

  for (const event of events) {
    if (isItemEvent(event) && event.type === 'item.completed') {
      if (isCommandExecution(event.item)) {
        commands.push(event.item.command);
      }
    }
  }

  return commands;
}

/**
 * Build a complete result from parsed events.
 */
export function buildCodexResult(events: CodexEvent[]): {
  events: CodexEvent[];
  finalMessage: string;
  filesChanged: string[];
  commandsRun: string[];
} {
  return {
    events,
    finalMessage: extractFinalMessage(events),
    filesChanged: extractFilesChanged(events),
    commandsRun: extractCommandsRun(events),
  };
}

// ─── Type Guards ───

function isItemEvent(event: CodexEvent): event is ItemEvent {
  return (event.type === 'item.started' || event.type === 'item.completed') && 'item' in event;
}

function isAgentMessage(item: CodexItem): item is AgentMessageItem {
  return item.type === 'agent_message';
}

function isFileChange(item: CodexItem): item is FileChangeItem {
  return item.type === 'file_change';
}

function isCommandExecution(item: CodexItem): item is CommandExecutionItem {
  return item.type === 'command_execution';
}
