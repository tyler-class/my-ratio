import { BUY_AGAIN, flagFor } from '@shared/lookups';
import { agoLabel, daysBetween, inDays, parseDay } from '@shared/logic/dates';
import { r1 } from '@shared/logic/units';
import type { BeanView, Model } from '@shared/logic/model';
import { useSheets } from '../sheets/context';
import { Thumb } from './Photos';
import { RB } from './ui';

export function stockLine(b: BeanView, m: Model, now = new Date()): string {
  const left = b.remaining != null ? Math.floor(b.remaining / m.dose7d) : null;
  switch (b.status) {
    case 'drinking':
      return b.remaining != null
        ? `${Math.round(b.remaining)} g left${left != null ? ` · ~${left} ${left === 1 ? 'brew' : 'brews'}` : ''}`
        : 'Open';
    case 'resting': {
      if (!b.rest_until) return 'Resting';
      const x = daysBetween(now, parseDay(b.rest_until));
      return x > 0 ? `Ready in ${inDays(x)}` : 'Ready to open';
    }
    case 'freezing':
      return `In the freezer · ${b.bag_g ?? '?'} g`;
    case 'ordered':
      return 'On the way';
    default:
      return `${b.brews.length} brews${b.avg != null ? ` · avg ${r1(b.avg)}` : ''}`;
  }
}

export const flags = (b: { origins: string[] }) => b.origins.map(flagFor).join('');

export function BeanCard({ b, m }: { b: BeanView; m: Model }) {
  const sheets = useSheets();
  const now = new Date();
  const age = b.roasted_on ? daysBetween(parseDay(b.roasted_on), now) : null;
  const live = b.status === 'drinking';
  const by = BUY_AGAIN.find((x) => x.key === b.buy_again);
  return (
    <div
      className="card bean"
      role="button"
      tabIndex={0}
      onClick={() => sheets.bean(b.id)}
      onKeyDown={(e) => e.key === 'Enter' && sheets.bean(b.id)}
    >
      <div className="hd">
        {b.images[0] ? <Thumb img={b.images[0]} /> : <div className="flag">{flags(b) || '☕️'}</div>}
        <div style={{ minWidth: 0 }}>
          <div className="bn">{b.name}</div>
          <div className="rn">
            {b.images[0] && flags(b) ? flags(b) + ' ' : ''}
            {b.roasterName || 'No roaster'}
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
        {age != null && b.status !== 'finished' && b.status !== 'freezing' && (
          <span>roasted {agoLabel(age)}</span>
        )}
      </div>
      {b.tags.length > 0 && (
        <div className="tags">
          {b.tags.slice(0, 3).map((t) => (
            <span className="tag acc" key={t}>
              {t}
            </span>
          ))}
        </div>
      )}
      <div className="flexrow">
        {b.process && <span className="tag">{b.process}</span>}
        {b.status === 'finished' && by && (
          <span className={'tag ' + by.tone}>Buy again: {by.label}</span>
        )}
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
