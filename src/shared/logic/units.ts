import type { TempUnit } from '../types';

export const r1 = (n: number) => Math.round(n * 10) / 10;

export const cToF = (c: number) => (c * 9) / 5 + 32;
export const fToC = (f: number) => ((f - 32) * 5) / 9;

/** Stored °C → the number shown in the user's unit, to one decimal. */
export function tempOut(c: number | null, unit: TempUnit): number | null {
  if (c == null) return null;
  return r1(unit === 'F' ? cToF(c) : c);
}

/** A number typed in the user's unit → °C for storage. Rounded so F→C→F round-trips. */
export function tempIn(v: number | null, unit: TempUnit): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return Math.round((unit === 'F' ? fToC(v) : v) * 1000) / 1000;
}

/** 1 : 16.7 — water per gram of coffee. */
export function ratioOf(dose: number | null, water: number | null): number | null {
  return dose && water && dose > 0 && water > 0 ? water / dose : null;
}

export function fmtN(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '–';
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
