/**
 * Rule-based task routing between Claude and Codex.
 * Pure function, no API calls.
 */

import {
  Complexity,
  type SuggestModelInput,
  type SuggestModelOutput,
  TaskType,
} from '../types/index.js';

interface Signal {
  model: 'claude' | 'codex';
  weight: number;
  reason: string;
}

const KEYWORD_SIGNALS: Array<{
  pattern: RegExp;
  model: 'claude' | 'codex';
  weight: number;
  reason: string;
}> = [
  // Claude strengths
  {
    pattern: /architect/i,
    model: 'claude',
    weight: 0.3,
    reason: 'Architecture design benefits from deep reasoning',
  },
  {
    pattern: /design\s*(system|pattern)/i,
    model: 'claude',
    weight: 0.3,
    reason: 'System design requires broad context',
  },
  {
    pattern: /refactor.*large|large.*refactor/i,
    model: 'claude',
    weight: 0.2,
    reason: 'Large refactors need holistic understanding',
  },
  {
    pattern: /explain|why|reason/i,
    model: 'claude',
    weight: 0.2,
    reason: 'Explanatory tasks suit Claude reasoning',
  },
  {
    pattern: /plan|strategy/i,
    model: 'claude',
    weight: 0.2,
    reason: 'Planning leverages Claude deliberation',
  },

  // Codex strengths
  {
    pattern: /fix\s*(bug|error|issue)|bug\s*fix/i,
    model: 'codex',
    weight: 0.3,
    reason: 'Quick fixes benefit from Codex speed',
  },
  {
    pattern: /implement|create|build|add/i,
    model: 'codex',
    weight: 0.2,
    reason: 'Direct implementation suits Codex first-attempt reliability',
  },
  {
    pattern: /ui|frontend|component|css|style/i,
    model: 'codex',
    weight: 0.3,
    reason: 'UI work is a known Codex strength',
  },
  {
    pattern: /test|spec/i,
    model: 'codex',
    weight: 0.2,
    reason: 'Test generation suits Codex autonomous execution',
  },
  {
    pattern: /script|automation|cli/i,
    model: 'codex',
    weight: 0.2,
    reason: 'Script writing benefits from Codex execution loop',
  },
];

export function suggestModel(input: SuggestModelInput): SuggestModelOutput {
  const signals: Signal[] = [];

  // Signal from explicit task type
  if (input.task_type) {
    const typeSignal = getTypeSignal(input.task_type);
    signals.push(typeSignal);
  }

  // Signal from complexity
  if (input.complexity) {
    const complexitySignal = getComplexitySignal(input.complexity);
    signals.push(complexitySignal);
  }

  // Signal from context size
  if (input.context_size !== undefined) {
    const contextSignal = getContextSizeSignal(input.context_size);
    signals.push(contextSignal);
  }

  // Signals from description keywords
  for (const kw of KEYWORD_SIGNALS) {
    if (kw.pattern.test(input.task_description)) {
      signals.push({ model: kw.model, weight: kw.weight, reason: kw.reason });
    }
  }

  // Default signal if no others matched
  if (signals.length === 0) {
    signals.push({
      model: 'codex',
      weight: 0.1,
      reason: 'Default: Codex for general implementation',
    });
  }

  return aggregateSignals(signals);
}

function getTypeSignal(taskType: `${TaskType}`): Signal {
  switch (taskType) {
    case TaskType.ARCHITECTURE:
      return {
        model: 'claude',
        weight: 0.5,
        reason: 'Architecture requires deep reasoning and broad context',
      };
    case TaskType.UI:
      return { model: 'codex', weight: 0.5, reason: 'UI implementation is a known Codex strength' };
    case TaskType.IMPLEMENTATION:
      return {
        model: 'codex',
        weight: 0.3,
        reason: 'Direct implementation benefits from Codex speed',
      };
    case TaskType.DEBUG:
      return {
        model: 'claude',
        weight: 0.3,
        reason: 'Debugging benefits from Claude reasoning depth',
      };
    case TaskType.REVIEW:
      return { model: 'claude', weight: 0.2, reason: 'Review benefits from Claude thoroughness' };
    case TaskType.REFACTOR:
      return { model: 'claude', weight: 0.2, reason: 'Refactoring needs holistic understanding' };
    default:
      return { model: 'codex', weight: 0.1, reason: 'Default: Codex for general tasks' };
  }
}

function getComplexitySignal(complexity: `${Complexity}`): Signal {
  switch (complexity) {
    case Complexity.SIMPLE:
      return { model: 'codex', weight: 0.3, reason: 'Simple tasks benefit from Codex speed' };
    case Complexity.MODERATE:
      return {
        model: 'codex',
        weight: 0.1,
        reason: 'Moderate tasks slightly favor Codex efficiency',
      };
    case Complexity.COMPLEX:
      return { model: 'claude', weight: 0.4, reason: 'Complex tasks need Claude deep reasoning' };
    default:
      return { model: 'codex', weight: 0.1, reason: 'Default complexity signal' };
  }
}

function getContextSizeSignal(contextSize: number): Signal {
  if (contextSize > 100_000) {
    return {
      model: 'claude',
      weight: 0.5,
      reason: 'Large context (>100K tokens) requires Claude 1M window',
    };
  }
  if (contextSize > 50_000) {
    return {
      model: 'claude',
      weight: 0.2,
      reason: 'Medium-large context favors Claude larger window',
    };
  }
  return { model: 'codex', weight: 0.1, reason: 'Small context works well with Codex' };
}

function aggregateSignals(signals: Signal[]): SuggestModelOutput {
  let claudeScore = 0;
  let codexScore = 0;
  const claudeReasons: string[] = [];
  const codexReasons: string[] = [];

  for (const signal of signals) {
    if (signal.model === 'claude') {
      claudeScore += signal.weight;
      claudeReasons.push(signal.reason);
    } else {
      codexScore += signal.weight;
      codexReasons.push(signal.reason);
    }
  }

  const totalScore = claudeScore + codexScore;
  const recommended = claudeScore >= codexScore ? 'claude' : 'codex';
  const winnerScore = Math.max(claudeScore, codexScore);
  const confidence = totalScore > 0 ? Math.min(winnerScore / totalScore, 1) : 0.5;

  const reasoning = recommended === 'claude' ? claudeReasons.join('. ') : codexReasons.join('. ');

  const alternative_scenarios =
    recommended === 'claude'
      ? codexReasons.map((r) => `Codex may be better if: ${r}`)
      : claudeReasons.map((r) => `Claude may be better if: ${r}`);

  return {
    recommended,
    reasoning,
    confidence: Math.round(confidence * 100) / 100,
    alternative_scenarios,
  };
}
