// Where a new brew starts: which bag, and which earlier brew its recipe is copied from.
import type { BeanView, BrewView, Model } from './model';

/** A rating at or above this is "that one worked": a recipe worth going back to. */
export const GOOD_RATING = 7;

/**
 * The bag a new brew is for when none was picked: the one bag you're drinking. With none, or
 * several, none: you choose.
 */
export function defaultBean(m: Pick<Model, 'beans'>): BeanView | null {
  const drinking = m.beans.filter((b) => b.status === 'drinking');
  return drinking.length === 1 ? drinking[0]! : null;
}

export type StartWhy = 'best' | 'last' | 'fresh';

export interface BrewStart {
  /** The brew to copy (none for a bag never brewed). */
  brew: BrewView | null;
  why: StartWhy;
}

/**
 * The recipe a new brew of a bag starts from:
 * - its best brew, when one was rated GOOD_RATING or higher (a recipe that worked);
 * - else its most recent brew (still dialing in: the latest attempt is closest);
 * - a bag never brewed: nothing (every field blank, to fill in).
 */
export function startFor(bean: BeanView): BrewStart {
  if (bean.best && (bean.best.rating ?? 0) >= GOOD_RATING) return { brew: bean.best, why: 'best' };
  if (bean.last) return { brew: bean.last, why: 'last' };
  return { brew: null, why: 'fresh' };
}
