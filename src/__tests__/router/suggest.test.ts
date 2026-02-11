import { describe, expect, it } from 'vitest';
import { suggestModel } from '../../router/suggest.js';

describe('suggestModel', () => {
  // ─── Tier 1: task_type routing table ───

  it('routes architecture to claude with high confidence', () => {
    const result = suggestModel({
      task_description: 'Design the database architecture',
      task_type: 'architecture',
    });

    expect(result.recommended).toBe('claude');
    expect(result.confidence).toBeGreaterThanOrEqual(0.80);
    expect(result.reasoning).toBeTruthy();
    expect(Array.isArray(result.alternative_scenarios)).toBe(true);
  });

  it('routes debug to claude', () => {
    const result = suggestModel({
      task_description: 'Debug the intermittent failure',
      task_type: 'debug',
    });

    expect(result.recommended).toBe('claude');
    expect(result.confidence).toBeGreaterThanOrEqual(0.75);
  });

  it('routes refactor to claude', () => {
    const result = suggestModel({
      task_description: 'Refactor the auth module',
      task_type: 'refactor',
    });

    expect(result.recommended).toBe('claude');
    expect(result.confidence).toBeGreaterThanOrEqual(0.70);
  });

  it('routes review to claude', () => {
    const result = suggestModel({
      task_description: 'Review the pull request',
      task_type: 'review',
    });

    expect(result.recommended).toBe('claude');
    expect(result.confidence).toBeGreaterThanOrEqual(0.65);
  });

  it('routes ui to claude', () => {
    const result = suggestModel({
      task_description: 'Create login form',
      task_type: 'ui',
    });

    expect(result.recommended).toBe('claude');
    expect(result.confidence).toBeGreaterThanOrEqual(0.60);
  });

  it('routes implementation to codex', () => {
    const result = suggestModel({
      task_description: 'Implement email validation',
      task_type: 'implementation',
    });

    expect(result.recommended).toBe('codex');
    expect(result.confidence).toBeGreaterThanOrEqual(0.60);
  });

  // ─── Complexity modifier ───

  it('increases confidence when complexity aligns with recommendation', () => {
    const base = suggestModel({
      task_description: 'Architecture task',
      task_type: 'architecture',
    });
    const aligned = suggestModel({
      task_description: 'Architecture task',
      task_type: 'architecture',
      complexity: 'complex',
    });

    expect(aligned.confidence).toBeGreaterThan(base.confidence);
  });

  it('decreases confidence when complexity conflicts with recommendation', () => {
    const base = suggestModel({
      task_description: 'Implementation task',
      task_type: 'implementation',
    });
    const conflicting = suggestModel({
      task_description: 'Implementation task',
      task_type: 'implementation',
      complexity: 'complex',
    });

    expect(conflicting.confidence).toBeLessThan(base.confidence);
  });

  // ─── Context size hard override ───

  it('forces claude for large context (>100K) regardless of task_type', () => {
    const result = suggestModel({
      task_description: 'Implement something',
      task_type: 'implementation',
      context_size: 200_000,
    });

    // implementation normally → codex, but large context forces claude
    expect(result.recommended).toBe('claude');
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    expect(result.reasoning).toContain('context');
  });

  // ─── Tier 2: partial structured input (no task_type) ───

  it('returns sub-0.6 confidence with only complexity=complex', () => {
    const result = suggestModel({
      task_description: 'Do something complex',
      complexity: 'complex',
    });

    expect(result.recommended).toBe('claude');
    expect(result.confidence).toBeLessThan(0.60);
  });

  it('returns sub-0.6 confidence with only medium context_size', () => {
    const result = suggestModel({
      task_description: 'Process data',
      context_size: 80_000,
    });

    expect(result.recommended).toBe('claude');
    expect(result.confidence).toBeLessThan(0.60);
  });

  it('returns codex for simple complexity without task_type', () => {
    const result = suggestModel({
      task_description: 'Quick task',
      complexity: 'simple',
    });

    expect(result.recommended).toBe('codex');
    expect(result.confidence).toBeLessThan(0.60);
  });

  // ─── Tier 3: description only ───

  it('returns low confidence for description-only input', () => {
    const result = suggestModel({
      task_description: 'Fix bug in the form validation',
    });

    expect(result.confidence).toBeLessThanOrEqual(0.50);
  });

  it('ignores description content entirely', () => {
    // "architecture" in description but no task_type → still low confidence
    const withKeyword = suggestModel({
      task_description: 'Design the database architecture',
    });
    const withoutKeyword = suggestModel({
      task_description: 'Do something generic',
    });

    expect(withKeyword.confidence).toBe(withoutKeyword.confidence);
    expect(withKeyword.recommended).toBe(withoutKeyword.recommended);
  });

  // ─── Confidence bounds ───

  it('confidence is always between 0.30 and 0.95', () => {
    const scenarios = [
      { task_description: 'Generic' },
      {
        task_description: 'Arch',
        task_type: 'architecture' as const,
        complexity: 'complex' as const,
      },
      {
        task_description: 'Impl',
        task_type: 'implementation' as const,
        complexity: 'simple' as const,
      },
      { task_description: 'Big', context_size: 500_000 },
    ];

    for (const input of scenarios) {
      const result = suggestModel(input);
      expect(result.confidence).toBeGreaterThanOrEqual(0.30);
      expect(result.confidence).toBeLessThanOrEqual(0.95);
    }
  });

  // ─── Output structure ───

  it('always populates alternative_scenarios', () => {
    const result = suggestModel({
      task_description: 'Any task',
      task_type: 'implementation',
    });

    expect(Array.isArray(result.alternative_scenarios)).toBe(true);
    expect(result.alternative_scenarios.length).toBeGreaterThan(0);
  });

  it('always includes reasoning string', () => {
    const result = suggestModel({ task_description: 'Something' });

    expect(typeof result.reasoning).toBe('string');
    expect(result.reasoning.length).toBeGreaterThan(0);
  });
});
