import { describe, expect, it } from 'vitest';
import { parseArg } from '../cli';

describe('parseArg', () => {
  it('parses space-separated flag and value', () => {
    // Bug this catches: only supporting --flag=value form, so
    // `pnpm load --region northeast` silently falls to default.
    expect(parseArg(['--region', 'northeast'], '--region')).toBe('northeast');
  });

  it('parses equals-separated flag and value', () => {
    // Bug this catches: only supporting space-separated form, so
    // `pnpm load --region=northeast` silently falls to default.
    expect(parseArg(['--region=northeast'], '--region')).toBe('northeast');
  });

  it('returns undefined for missing flag', () => {
    // Bug this catches: returning empty string or throwing instead of
    // undefined, which bypasses the ?? default in the caller.
    expect(parseArg(['--source', 'prism'], '--region')).toBeUndefined();
  });

  it('returns undefined for empty args', () => {
    expect(parseArg([], '--region')).toBeUndefined();
  });

  it('handles flag at end of args with no following value (space-separated)', () => {
    // Bug this catches: out-of-bounds array access when flag is the last
    // element and there's no value after it. Returns undefined from args[length].
    const result = parseArg(['--region'], '--region');
    expect(result).toBeUndefined();
  });

  it('returns correct value when multiple flags are present', () => {
    // Bug this catches: returning the first flag's value regardless of
    // which flag was requested (e.g., always returning the first arg value).
    const args = ['--region', 'northeast', '--source', 'prism'];
    expect(parseArg(args, '--region')).toBe('northeast');
    expect(parseArg(args, '--source')).toBe('prism');
  });

  it('equals form returns empty string for --flag= with no value', () => {
    // Bug this catches: --region= should return '' (truthy check fails in
    // caller), not undefined (which would use the default silently).
    // This surfaces a misconfiguration rather than hiding it.
    expect(parseArg(['--region='], '--region')).toBe('');
  });
});
