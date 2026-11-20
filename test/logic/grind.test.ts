import { describe, expect, it } from 'vitest';
import {
  describeScale,
  formatGrind,
  grindLabel,
  GRINDER_PRESETS,
  isScale,
  middleOf,
  positionOf,
  presetFor,
  scaleFor,
  settingsOf,
  snapGrind,
  stepGrind,
  type StepScale,
} from '../../src/shared/grind';

const steps = (min: number, max: number, between: number): StepScale => ({
  kind: 'steps',
  min,
  max,
  between,
});
const ODE = steps(1, 11, 2);

describe('grind scales', () => {
  it('steps the Ode through 4, 4.1, 4.2 and on to 5', () => {
    expect(stepGrind(4, 1, ODE)).toBe(4.1);
    expect(stepGrind(4.1, 1, ODE)).toBe(4.2);
    expect(stepGrind(4.2, 1, ODE)).toBe(5);
    expect(stepGrind(5, -1, ODE)).toBe(4.2);
    expect(stepGrind(11, 1, ODE)).toBe(11);
    expect(stepGrind(1, -1, ODE)).toBe(1);
    expect(settingsOf(ODE)).toHaveLength(31);
    expect(settingsOf(steps(1, 11, 3))).toHaveLength(41);
  });

  it('handles whole numbers, stepless and 10+ steps between', () => {
    const encore = steps(1, 40, 0);
    expect(stepGrind(14, 1, encore)).toBe(15);
    expect(snapGrind(14.6, encore)).toBe(15);
    const stepless = steps(0, 50, 9);
    expect(stepGrind(14.9, 1, stepless)).toBe(15);
    // 12 between: two digits, so 4.1 (step 10) and 4.01 (step 1) never clash.
    const fine = steps(0, 9, 12);
    expect(stepGrind(4.09, 1, fine)).toBe(4.1);
    expect(formatGrind(4.1, fine)).toBe('4.10');
    expect(formatGrind(4.01, fine)).toBe('4.01');
    expect(stepGrind(4.12, 1, fine)).toBe(5);
    expect(stepGrind(5, -1, fine)).toBe(4.12);
  });

  it('snaps typed values onto the dial', () => {
    expect(snapGrind(4.3, ODE)).toBe(4.2);
    expect(snapGrind(4.8, ODE)).toBe(5);
    expect(snapGrind(0, ODE)).toBe(1);
  });

  it('spaces settings evenly for charts', () => {
    expect(positionOf(4.1, ODE)).toBeCloseTo(4 + 1 / 3);
    expect(positionOf(4.2, ODE)).toBeCloseTo(4 + 2 / 3);
    expect(positionOf(14.5, steps(0, 50, 9))).toBeCloseTo(14.5);
  });

  it('finds presets by name and prefers the owner’s own scale', () => {
    expect(presetFor('Fellow Ode Gen 2')!.name).toBe('Fellow Ode (Gen 2)');
    expect(presetFor('Fellow Ode (Gen 1)')!.scale).toEqual(ODE);
    expect(presetFor('ode')!.name).toBe('Fellow Ode (Gen 1)');
    expect(presetFor('Fellow Ode')!.name).toBe('Fellow Ode (Gen 1)');
    expect(presetFor('My Comandante')!.name).toBe('Comandante C40');
    expect(presetFor('Grandpa’s mill')).toBeUndefined();
    expect(scaleFor('1Zpresso K-Ultra')).toEqual({ kind: 'text' });
    const own = steps(1, 3, 0);
    expect(scaleFor('Fellow Ode', { 'Fellow Ode': own })).toEqual(own);
    expect(scaleFor('Fellow Ode')).toEqual(ODE);
    for (const p of GRINDER_PRESETS) expect(isScale(p.scale)).toBe(true);
  });

  it('writes settings and describes scales', () => {
    expect(grindLabel({ grinder: 'Fellow Ode', grind: 4.2 })).toBe('4.2');
    expect(grindLabel({ grinder: 'K-Ultra', grind: null, grind_text: '1.3.2' })).toBe('1.3.2');
    expect(describeScale(ODE)).toBe('1 to 11, 2 steps between');
    expect(describeScale(steps(0, 40, 0))).toBe('0 to 40, whole numbers');
    expect(describeScale(steps(0, 50, 9))).toBe('0 to 50, one decimal');
    expect(describeScale({ kind: 'text' })).toBe('Write-in');
    expect(middleOf(ODE)).toBe(6);
    expect(isScale(steps(5, 1, 0))).toBe(false);
    expect(isScale(steps(0, 9, 100))).toBe(false);
  });
});
