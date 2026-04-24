import { describe, expect, it } from 'vitest';
import { buildMonthlyCalcCmd } from '../sources/prism';

const MONTHS_12 = Array.from({ length: 12 }, (_, i) =>
  `/data/tmin_month${String(i + 1).padStart(2, '0')}_f.tif`,
);

describe('buildMonthlyCalcCmd', () => {
  it('uses the specified threshold in every monthly comparison', () => {
    // Bug this catches: using 0 (°C freezing) instead of 32 (°F freezing),
    // or hardcoding a threshold instead of using the parameter.
    const cmd = buildMonthlyCalcCmd({
      monthlyPaths: MONTHS_12,
      outFile: '/out/frost.tif',
      threshold: 32,
    });

    // Every month A-L should compare against 32
    for (const letter of 'ABCDEFGHIJKL') {
      expect(cmd).toContain(`(${letter}>32)`);
    }
    // Should NOT contain a different threshold
    expect(cmd).not.toContain('>40)');
    expect(cmd).not.toContain('>0)');
  });

  it('uses a different threshold for growing season', () => {
    // Bug this catches: copy-pasting the frost formula without changing the threshold.
    const cmd = buildMonthlyCalcCmd({
      monthlyPaths: MONTHS_12,
      outFile: '/out/gs.tif',
      threshold: 40,
    });

    for (const letter of 'ABCDEFGHIJKL') {
      expect(cmd).toContain(`(${letter}>40)`);
    }
    expect(cmd).not.toContain('>32)');
  });

  it('maps 12 input files to letters A through L in order', () => {
    // Bug this catches: off-by-one in String.fromCharCode mapping,
    // or swapping month order so January maps to B instead of A.
    const cmd = buildMonthlyCalcCmd({
      monthlyPaths: MONTHS_12,
      outFile: '/out/frost.tif',
      threshold: 32,
    });

    for (let i = 0; i < 12; i++) {
      const letter = String.fromCharCode(65 + i);
      expect(cmd).toContain(`-${letter} "${MONTHS_12[i]}"`);
    }
  });

  it('clamps output to [0, 365]', () => {
    // Bug this catches: missing bounds clamp producing values > 365 or < 0.
    const cmd = buildMonthlyCalcCmd({
      monthlyPaths: MONTHS_12,
      outFile: '/out/frost.tif',
      threshold: 32,
    });

    expect(cmd).toContain('numpy.minimum(365,');
    expect(cmd).toContain('numpy.maximum(0,');
  });

  it('scales month count by 30.4 days per month', () => {
    // Bug this catches: using 30, 31, or raw 365/12 instead of 30.4.
    const cmd = buildMonthlyCalcCmd({
      monthlyPaths: MONTHS_12,
      outFile: '/out/frost.tif',
      threshold: 32,
    });

    expect(cmd).toContain('*30.4');
  });

  it('sets NoData value to -9999', () => {
    // Bug this catches: missing --NoDataValue causes ocean/border pixels
    // to get 0 instead of NoData, which downstream treats as "zero frost-free days".
    const cmd = buildMonthlyCalcCmd({
      monthlyPaths: MONTHS_12,
      outFile: '/out/frost.tif',
      threshold: 32,
    });

    expect(cmd).toContain('--NoDataValue=-9999');
  });

  it('handles fewer than 12 months using only the needed letters', () => {
    // Bug this catches: hardcoded A-L assumption when only partial months are available.
    const sixMonths = MONTHS_12.slice(0, 6);
    const cmd = buildMonthlyCalcCmd({
      monthlyPaths: sixMonths,
      outFile: '/out/partial.tif',
      threshold: 32,
    });

    // Should have A through F
    for (let i = 0; i < 6; i++) {
      const letter = String.fromCharCode(65 + i);
      expect(cmd).toContain(`(${letter}>32)`);
    }
    // Should NOT have G through L
    for (const letter of 'GHIJKL') {
      expect(cmd).not.toContain(`-${letter} `);
      expect(cmd).not.toContain(`(${letter}>32)`);
    }
  });

  it('throws on empty input', () => {
    // Bug this catches: silent no-op producing an empty or corrupt raster.
    expect(() =>
      buildMonthlyCalcCmd({
        monthlyPaths: [],
        outFile: '/out/frost.tif',
        threshold: 32,
      }),
    ).toThrow();
  });

  it('sets the correct output file path', () => {
    // Bug this catches: wrong file overwritten due to missing or wrong --outfile.
    const cmd = buildMonthlyCalcCmd({
      monthlyPaths: MONTHS_12,
      outFile: '/data/frost_free_days.tif',
      threshold: 32,
    });

    expect(cmd).toContain('--outfile="/data/frost_free_days.tif"');
  });

  it('accepts a custom daysPerMonth override', () => {
    // Bug this catches: ignoring the parameter and always using the default.
    const cmd = buildMonthlyCalcCmd({
      monthlyPaths: MONTHS_12,
      outFile: '/out/frost.tif',
      threshold: 32,
      daysPerMonth: 28,
    });

    expect(cmd).toContain('*28');
    expect(cmd).not.toContain('*30.4');
  });
});
