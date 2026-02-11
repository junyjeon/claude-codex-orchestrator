/**
 * Rule-based task routing between Claude and Codex.
 * Pure function, no API calls.
 *
 * Routes based on structured inputs only (task_type, complexity, context_size).
 * Does NOT analyze task_description — a pure function cannot understand
 * natural language context. Callers should provide task_type for meaningful results.
 *
 * Confidence tiers:
 *   >= 0.6  task_type provided (actionable)
 *   <  0.6  partial or no structured input (CLAUDE.md says: ignore and decide yourself)
 */

import {
  Complexity,
  type SuggestModelInput,
  type SuggestModelOutput,
  TaskType,
} from '../types/index.js';

interface RouteEntry {
  readonly recommended: 'claude' | 'codex';
  readonly confidence: number;
  readonly reasoning: string;
  readonly alternatives: readonly string[];
}

// satisfies enforces exhaustive TaskType coverage at compile time
const TYPE_ROUTES = {
  [TaskType.ARCHITECTURE]: {
    recommended: 'claude',
    confidence: 0.85,
    reasoning: 'Architecture requires deep reasoning and broad context',
    alternatives: ['Codex may be better for simple scaffold generation'],
  },
  [TaskType.DEBUG]: {
    recommended: 'claude',
    confidence: 0.80,
    reasoning: 'Debugging benefits from Claude reasoning depth',
    alternatives: ['Codex may be better for simple, isolated test failures'],
  },
  [TaskType.REFACTOR]: {
    recommended: 'claude',
    confidence: 0.75,
    reasoning: 'Refactoring needs holistic understanding of existing code',
    alternatives: ['Codex may be better for mechanical rename-only refactors'],
  },
  [TaskType.REVIEW]: {
    recommended: 'claude',
    confidence: 0.70,
    reasoning: 'Code review benefits from Claude thoroughness and security awareness',
    alternatives: ['Codex can provide a second-opinion review via codex_review'],
  },
  [TaskType.UI]: {
    recommended: 'claude',
    confidence: 0.65,
    reasoning: 'UI aesthetics and project integration favor Claude',
    alternatives: ['Codex may be better for standalone UI utility functions'],
  },
  [TaskType.IMPLEMENTATION]: {
    recommended: 'codex',
    confidence: 0.65,
    reasoning: 'Direct implementation slightly favors Codex speed',
    alternatives: ['Claude may be better if project conventions matter or task is complex'],
  },
} as const satisfies Record<TaskType, RouteEntry>;

function normalizeContextSize(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value < 0) return undefined;
  return value;
}

export function suggestModel(input: SuggestModelInput): SuggestModelOutput {
  const contextSize = normalizeContextSize(input.context_size);

  // Hard constraint: large context forces Claude regardless of task_type
  if (contextSize !== undefined && contextSize > 100_000) {
    return formatOutput({
      recommended: 'claude',
      confidence: 0.90,
      reasoning: `Large context (${Math.round(contextSize / 1000)}K tokens) requires Claude extended window`,
      alternatives: ['Codex is limited to smaller context windows'],
    });
  }

  // Tier 1: task_type provided → routing table lookup + modifiers
  if (input.task_type !== undefined) {
    const route = TYPE_ROUTES[input.task_type as TaskType];
    if (route) {
      return formatOutput(applyModifiers(route, input, contextSize));
    }
  }

  // Tier 2: only complexity or context_size (no task_type)
  if (input.complexity !== undefined || (contextSize !== undefined && contextSize > 0)) {
    return formatOutput(inferFromPartialInput(input, contextSize));
  }

  // Tier 3: description only → honest "I don't know"
  return formatOutput({
    recommended: 'codex',
    confidence: 0.50,
    reasoning: 'No structured input provided. Default recommendation only.',
    alternatives: [
      'Provide task_type for a more accurate recommendation',
      'Claude is better for architecture, debugging, refactoring, security',
      'Codex is better for bash scripts, utilities, CRUD, scaffolding',
    ],
  });
}

function applyModifiers(
  route: RouteEntry,
  input: SuggestModelInput,
  contextSize: number | undefined,
): RouteEntry {
  let { confidence } = route;

  if (input.complexity !== undefined) {
    const aligned =
      (input.complexity === Complexity.COMPLEX && route.recommended === 'claude') ||
      (input.complexity === Complexity.SIMPLE && route.recommended === 'codex');
    const conflicting =
      (input.complexity === Complexity.COMPLEX && route.recommended === 'codex') ||
      (input.complexity === Complexity.SIMPLE && route.recommended === 'claude');

    if (aligned) confidence += 0.05;
    if (conflicting) confidence -= 0.10;
  }

  // Medium-large context (50K-100K); >100K already handled as hard override
  if (contextSize !== undefined && contextSize > 50_000) {
    confidence += route.recommended === 'claude' ? 0.03 : -0.03;
  }

  // Tier 1 contract: task_type routes never drop below 0.6
  confidence = Math.max(0.60, confidence);

  return { ...route, confidence, alternatives: [...route.alternatives] };
}

function inferFromPartialInput(
  input: SuggestModelInput,
  contextSize: number | undefined,
): RouteEntry {
  if (input.complexity === Complexity.COMPLEX) {
    return {
      recommended: 'claude',
      confidence: 0.55,
      reasoning: 'Complex tasks generally need Claude deep reasoning',
      alternatives: ['Codex may be better for convention-free tasks'],
    };
  }

  if (contextSize !== undefined && contextSize > 50_000) {
    return {
      recommended: 'claude',
      confidence: 0.55,
      reasoning: 'Medium-large context favors Claude larger window',
      alternatives: ['Codex works well with smaller context'],
    };
  }

  return {
    recommended: 'codex',
    confidence: 0.55,
    reasoning: 'Simple/moderate tasks without type specification',
    alternatives: ['Claude may be better if task requires deep reasoning'],
  };
}

function formatOutput(route: RouteEntry): SuggestModelOutput {
  const clamped = Math.max(0.30, Math.min(route.confidence, 0.95));
  return {
    recommended: route.recommended,
    confidence: Math.round(clamped * 100) / 100,
    reasoning: route.reasoning,
    alternative_scenarios: [...route.alternatives],
  };
}
