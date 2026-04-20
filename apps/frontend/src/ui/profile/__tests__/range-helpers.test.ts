import { describe, expect, it } from 'vitest';

import { clamp, snapToStep } from '../RangeSlider';

describe('clamp', () => {
  it('returns value when within range', () => {
    expect(clamp(50, 0, 100)).toBe(50);
  });

  it('clamps to min when below', () => {
    expect(clamp(-5, 0, 100)).toBe(0);
  });

  it('clamps to max when above', () => {
    expect(clamp(150, 0, 100)).toBe(100);
  });

  it('handles min equals max', () => {
    expect(clamp(5, 10, 10)).toBe(10);
  });
});

describe('snapToStep', () => {
  it('snaps to nearest step', () => {
    expect(snapToStep(7, 5)).toBe(5);
    expect(snapToStep(8, 5)).toBe(10);
  });

  it('returns exact value when already on step', () => {
    expect(snapToStep(10, 5)).toBe(10);
  });

  it('works with decimal steps', () => {
    expect(snapToStep(0.7, 0.5)).toBe(0.5);
    expect(snapToStep(0.8, 0.5)).toBe(1.0);
  });
});
