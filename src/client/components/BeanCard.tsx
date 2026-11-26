import { statusOf } from '@shared/lookups';
import { agoLabel, dayKey, daysBetween, inDays, parseDay } from '@shared/logic/dates';
import { restInfo } from '@shared/logic/timeline';
import { fmtInt, plural, r1 } from '@shared/logic/units';
import type { BeanView, Model } from '@shared/logic/model';
import { useSheets } from '../sheets/context';
import { Thumb } from './Photos';
import { RB } from './ui';
import { Icon } from './Icon';
import { STATUS_ICON } from '../lib/statusIcons';

export function stockLine(b: BeanView, m: Model, now = new Date()): string {
  const left = b.remaining != null ? Math.floor(b.remaining / m.dose7d) : null;
  switch (b.status) {
    case 'drinking':
      return b.remaining != null
        ? `${fmtInt(b.remaining)} g left${left != null ? ` · ~${left} ${left === 1 ? 'brew' : 'brews'}` : ''}`
        : 'Open';
    case 'resting': {
      if (!b.rest_until) return 'Resting';
      const x = daysBetween(now, parseDay(b.rest_until));
      return x > 0 ? `Ready in ${inDays(x)}` : 'Ready to open';
    }
    case 'freezing':
      return `In the freezer · ${b.bag_g != null ? fmtInt(b.bag_g) : '?'} g`;
    case 'ordered':
      return 'On the way';
    default:
      // (The average is in the rating badge already.)
      return `${fmtInt(b.brews.length)} brews`;
  }
}

/**
 * For a bag in the freezer: the rest still to come once it's out ("Then rest 6 days"), so you
 * know how far ahead to take it out. Freezer days don't count as rest. None without a
 * recommended rest.
 */
export function thenRest(b: BeanView, now = new Date()): string | null {
  if (b.status !== 'freezing') return null;
  const first = b.brews.length ? dayKey(b.brews.at(-1)!.date) : null;
  const r = restInfo(b, b.events, dayKey(now), first);
  if (!r || r.mode !== 'countdown') return null;
  return r.left > 0 ? `Then rest ${plural(r.left, 'day')}` : 'Rested enough: ready once thawed';
}

export const flags = (b: { origins: string[] }, m: Pick<Model, 'mark'>) =>
  b.origins.map(m.mark).join('');

/**
 * A bag on the Beans page: its status as a small pill under the roaster (in that status's own
 * icon and colour), then its origin, process and tasting notes.
 */
export function BeanCard({ b, m }: { b: BeanView; m: Model; showStatus?: boolean }) {
  const sheets = useSheets();
  const now = new Date();
  const age = b.roasted_on ? daysBetween(parseDay(b.roasted_on), now) : null;
  const live = b.status === 'drinking';
  return (
    <div
      className="card bean"
      role="button"
      tabIndex={0}
      onClick={() => sheets.bean(b.id)}
      onKeyDown={(e) => e.key === 'Enter' && sheets.bean(b.id)}
    >
      <div className="hd">
        {b.images[0] ? (
          <Thumb img={b.images[0]} />
        ) : (
          <div className="flag">{flags(b, m) || '☕️'}</div>
        )}
        <div style={{ minWidth: 0 }}>
          <div className="bn">{b.name}</div>
          <div className="rn">
            {b.images[0] && flags(b, m) ? flags(b, m) + ' ' : ''}
            {b.roasterName || 'No roaster'}
          </div>
          {/* Its status as a small pill, and (in the freezer) the rest still to come. */}
          <div className="bean-st">
            <span className={`tag st-pill s-${b.status}`}>
              <Icon name={STATUS_ICON[b.status]} size={13} />
              {statusOf(b.status)?.label ?? b.status}
            </span>
          </div>
        </div>
        <div className="ml">{b.avg != null ? <RB v={r1(b.avg)} /> : null}</div>
      </div>
      {live && b.pct != null && (
        <div className="bar">
          <i style={{ width: `${Math.round(b.pct * 100)}%` }} />
        </div>
      )}
      <div className="meta">
        <span>{stockLine(b, m, now)}</span>
        {thenRest(b, now) && <span className="then-rest">{thenRest(b, now)}</span>}
        {age != null && b.status !== 'finished' && b.status !== 'freezing' && (
          <span>roasted {agoLabel(age)}</span>
        )}
      </div>
      {/* Where it's from, how it was processed, then what it tastes of: each its own soft tone. */}
      {(b.origins.length > 0 || b.process || b.tags.length > 0) && (
        <div className="bean-cloud">
          {b.origins.map((o) => (
            <span key={`o-${o}`} className="tag t-origin">
              {o}
            </span>
          ))}
          {b.process && <span className="tag t-process">{b.process}</span>}
          {b.tags.map((t) => (
            <span key={`t-${t}`} className="tag t-note">
              {t}
            </span>
          ))}
        </div>
      )}
      <div className="flexrow">
        {live && (
          <button
            type="button"
            className="btn primary sm"
            style={{ marginLeft: 'auto' }}
            onClick={(e) => {
              e.stopPropagation();
              sheets.log({ beanId: b.id });
            }}
          >
            Brew this
          </button>
        )}
      </div>
    </div>
  );
}
