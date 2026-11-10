import { EXTRACTION, STRENGTH } from '@shared/lookups';
import { timeLabel } from '@shared/logic/dates';
import type { BrewView } from '@shared/logic/model';
import { fmtN, tempOut } from '@shared/logic/units';
import type { Settings } from '@shared/types';
import { useSheets } from '../sheets/context';
import { RB } from './ui';

export function recipeLine(b: BrewView, s: Settings, withMethod = true): string {
  const bits: string[] = [];
  if (withMethod && b.method) bits.push(b.method);
  if (b.dose_g != null && b.water_ml != null)
    bits.push(`${fmtN(b.dose_g)} g → ${Math.round(b.water_ml)} mL`);
  if (b.ratio) bits.push(`1:${b.ratio.toFixed(1)}`);
  if (b.grind != null)
    bits.push(`${b.grinder ? b.grinder.replace(/^Fellow /, '') + ' ' : ''}${fmtN(b.grind)}`);
  const t = tempOut(b.water_temp_c, s.temp_unit);
  if (t != null) bits.push(`${fmtN(t)}°`);
  return bits.join(' · ');
}

export function BrewRow({
  b,
  s,
  open,
  onToggle,
  showDate,
}: {
  b: BrewView;
  s: Settings;
  open: boolean;
  onToggle: () => void;
  showDate?: string;
}) {
  const sheets = useSheets();
  const ex = EXTRACTION.find((e) => e.key === b.extraction);
  const st = STRENGTH.find((e) => e.key === b.strength);
  return (
    <div className="ri">
      <button type="button" className="rm" onClick={onToggle} aria-expanded={open}>
        <RB v={b.rating} />
        <div className="mid">
          <div className="t1">
            {b.beanName}
            {b.roasterName ? <span> · {b.roasterName}</span> : null}
          </div>
          <div className="t2">{recipeLine(b, s)}</div>
        </div>
        <div className="rt">
          {showDate ?? timeLabel(b.date)}
          <div>#{b.num}</div>
        </div>
      </button>
      {open && (
        <div className="rd">
          {(ex || st) && (
            <div className="tags">
              {ex && <span className={'tag ' + ex.tone}>{ex.long}</span>}
              {st && <span className="tag">{st.label}</span>}
            </div>
          )}
          {b.tasting_notes && <div>{b.tasting_notes}</div>}
          {b.next_time && (
            <div className="callout">
              <b>Next time</b>
              {b.next_time}
            </div>
          )}
          {b.recipe_notes && <div className="sub">Recipe: {b.recipe_notes}</div>}
          <div className="flexrow">
            <button type="button" className="btn sm" onClick={() => sheets.rate(b.id)}>
              {b.rating == null ? 'Rate this brew' : 'Edit rating'}
            </button>
            <button
              type="button"
              className="btn sm"
              onClick={() => sheets.log({ fromBrewId: b.id })}
            >
              Brew again
            </button>
            <button type="button" className="btn sm ghost" onClick={() => sheets.editBrew(b.id)}>
              Edit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
