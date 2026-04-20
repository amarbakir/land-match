import { describe, expect, it } from 'vitest';

import { toggleValue } from '../ToggleButtonRow';

describe('toggleValue', () => {
  it('adds a value not in the array', () => {
    expect(toggleValue(['a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
  });

  it('removes a value already in the array', () => {
    expect(toggleValue(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
  });

  it('returns new array reference on add', () => {
    const original = ['a'];
    const result = toggleValue(original, 'b');
    expect(result).not.toBe(original);
  });

  it('returns new array reference on remove', () => {
    const original = ['a', 'b'];
    const result = toggleValue(original, 'a');
    expect(result).not.toBe(original);
  });

  it('handles empty array', () => {
    expect(toggleValue([], 'x')).toEqual(['x']);
  });
});
