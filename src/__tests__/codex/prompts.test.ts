import { describe, expect, it } from 'vitest';
import { buildExecutePrompt, buildGeneratePrompt, buildReviewPrompt } from '../../codex/prompts.js';

describe('buildGeneratePrompt', () => {
  it('builds basic generate prompt', () => {
    const prompt = buildGeneratePrompt({
      task_description: 'binary search function',
      language: 'typescript',
    });

    expect(prompt).toContain('typescript');
    expect(prompt).toContain('binary search function');
    expect(prompt).toContain('best practices');
  });

  it('includes context when provided', () => {
    const prompt = buildGeneratePrompt({
      task_description: 'sort function',
      language: 'python',
      context: 'Use generics for type safety',
    });

    expect(prompt).toContain('Use generics for type safety');
    expect(prompt).toContain('Additional context');
  });

  it('omits context section when not provided', () => {
    const prompt = buildGeneratePrompt({
      task_description: 'hello world',
      language: 'go',
    });

    expect(prompt).not.toContain('Additional context');
  });
});

describe('buildExecutePrompt', () => {
  it('builds execution prompt', () => {
    const prompt = buildExecutePrompt({
      task_description: 'Add error handling to API endpoints',
      working_dir: '/home/user/project',
    });

    expect(prompt).toContain('Add error handling to API endpoints');
    expect(prompt).toContain('autonomously');
    expect(prompt).toContain('file changes');
  });
});

describe('buildReviewPrompt', () => {
  it('builds review prompt with default focus', () => {
    const prompt = buildReviewPrompt({
      code: 'const x = 1;',
    });

    expect(prompt).toContain('all issues');
    expect(prompt).toContain('const x = 1;');
    expect(prompt).toContain('JSON');
    expect(prompt).toContain('score');
  });

  it('includes file path when provided', () => {
    const prompt = buildReviewPrompt({
      code: 'fn main() {}',
      file_path: 'src/main.rs',
      language: 'rust',
    });

    expect(prompt).toContain('src/main.rs');
    expect(prompt).toContain('rust');
  });

  it('uses specified review focus', () => {
    const prompt = buildReviewPrompt({
      code: 'select * from users',
      review_focus: 'security',
    });

    expect(prompt).toContain('security issues');
  });
});
