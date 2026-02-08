import { describe, expect, it } from 'vitest';
import { suggestModel } from '../../router/suggest.js';

describe('suggestModel', () => {
  it('recommends claude for architecture tasks', () => {
    const result = suggestModel({
      task_description: 'Design the database architecture',
      task_type: 'architecture',
    });

    expect(result.recommended).toBe('claude');
    expect(result.confidence).toBeGreaterThan(0.5);
    expect(result.reasoning).toBeTruthy();
    expect(Array.isArray(result.alternative_scenarios)).toBe(true);
  });

  it('recommends codex for UI tasks', () => {
    const result = suggestModel({
      task_description: 'Create a login form component',
      task_type: 'ui',
    });

    expect(result.recommended).toBe('codex');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('recommends codex for simple implementation', () => {
    const result = suggestModel({
      task_description: 'Implement a function to validate email',
      task_type: 'implementation',
      complexity: 'simple',
    });

    expect(result.recommended).toBe('codex');
  });

  it('recommends claude for complex tasks', () => {
    const result = suggestModel({
      task_description: 'Redesign the authentication system',
      complexity: 'complex',
    });

    expect(result.recommended).toBe('claude');
  });

  it('recommends claude for large context', () => {
    const result = suggestModel({
      task_description: 'Refactor the codebase',
      context_size: 200_000,
    });

    expect(result.recommended).toBe('claude');
    expect(result.reasoning).toContain('context');
  });

  it('recommends codex for small context implementation', () => {
    const result = suggestModel({
      task_description: 'Add a CSS style to the button',
      context_size: 5_000,
    });

    expect(result.recommended).toBe('codex');
  });

  it('recommends codex for bug fixes', () => {
    const result = suggestModel({
      task_description: 'Fix bug in the form validation',
    });

    expect(result.recommended).toBe('codex');
  });

  it('recommends claude for debugging tasks', () => {
    const result = suggestModel({
      task_description: 'Debug the intermittent failure',
      task_type: 'debug',
    });

    expect(result.recommended).toBe('claude');
  });

  it('returns confidence between 0 and 1', () => {
    const result = suggestModel({
      task_description: 'Do something generic',
    });

    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('always populates alternative_scenarios', () => {
    const result = suggestModel({
      task_description: 'Create new API endpoint',
      task_type: 'implementation',
    });

    expect(Array.isArray(result.alternative_scenarios)).toBe(true);
  });

  it('handles keyword-based detection for UI', () => {
    const result = suggestModel({
      task_description: 'Build a new frontend dashboard component with CSS animations',
    });

    expect(result.recommended).toBe('codex');
  });

  it('handles keyword-based detection for architecture', () => {
    const result = suggestModel({
      task_description: 'Plan the strategy for the microservices architecture',
    });

    expect(result.recommended).toBe('claude');
  });
});
