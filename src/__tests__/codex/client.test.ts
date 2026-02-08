import { describe, expect, it } from 'vitest';
import { buildArgs } from '../../codex/client.js';

describe('buildArgs', () => {
  it('builds minimal args with stdin pipe', () => {
    const args = buildArgs({});
    expect(args).toEqual(['exec', '-']);
  });

  it('adds --json flag', () => {
    const args = buildArgs({ json: true });
    expect(args).toContain('--json');
    expect(args.at(-1)).toBe('-');
  });

  it('adds --full-auto flag', () => {
    const args = buildArgs({ fullAuto: true });
    expect(args).toContain('--full-auto');
  });

  it('adds --ask-for-approval with mode', () => {
    const args = buildArgs({ approvalMode: 'on-failure' });
    expect(args).toContain('--ask-for-approval');
    expect(args).toContain('on-failure');
  });

  it('adds --sandbox with mode', () => {
    const args = buildArgs({ sandbox: 'workspace-write' });
    expect(args).toContain('--sandbox');
    expect(args).toContain('workspace-write');
  });

  it('adds --cd with working directory', () => {
    const args = buildArgs({ workingDir: '/home/user/project' });
    expect(args).toContain('--cd');
    expect(args).toContain('/home/user/project');
  });

  it('adds --skip-git-repo-check', () => {
    const args = buildArgs({ skipGitRepoCheck: true });
    expect(args).toContain('--skip-git-repo-check');
  });

  it('combines all flags correctly', () => {
    const args = buildArgs({
      json: true,
      fullAuto: true,
      sandbox: 'workspace-write',
      workingDir: '/tmp/test',
      skipGitRepoCheck: true,
    });

    expect(args[0]).toBe('exec');
    expect(args).toContain('--json');
    expect(args).toContain('--full-auto');
    expect(args).toContain('--sandbox');
    expect(args).toContain('workspace-write');
    expect(args).toContain('--cd');
    expect(args).toContain('/tmp/test');
    expect(args).toContain('--skip-git-repo-check');
    expect(args.at(-1)).toBe('-');
  });

  it('stdin marker is always last', () => {
    const args = buildArgs({ json: true, fullAuto: true, workingDir: '/test' });
    expect(args.at(-1)).toBe('-');
  });

  it('approvalMode takes precedence over fullAuto', () => {
    const args = buildArgs({ fullAuto: true, approvalMode: 'on-failure' });
    expect(args).toContain('--ask-for-approval');
    expect(args).toContain('on-failure');
    expect(args).not.toContain('--full-auto');
  });

  it('uses fullAuto only when approvalMode is absent', () => {
    const args = buildArgs({ fullAuto: true });
    expect(args).toContain('--full-auto');
    expect(args).not.toContain('--ask-for-approval');
  });

  it('omits both flags when neither is set', () => {
    const args = buildArgs({ json: true });
    expect(args).not.toContain('--full-auto');
    expect(args).not.toContain('--ask-for-approval');
  });
});
