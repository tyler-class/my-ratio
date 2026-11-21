import { grindLabel } from '@shared/grind';
import { timeLabel } from '@shared/logic/dates';
import type { BrewView } from '@shared/logic/model';
import { fmtInt, fmtN, tempOut } from '@shared/logic/units';
import type { Settings } from '@shared/types';
import { useSheets } from '../sheets/context';
import { RB } from './ui';

export function recipeLine(b: BrewView, s: Settings, withMethod = true): string {
  const bits: string[] = [];
  if (withMethod && b.method) bits.push(b.method);
  if (b.dose_g != null && b.water_ml != null)
    bits.push(`${fmtN(b.dose_g)} g → ${fmtInt(b.water_ml)} mL`);
  if (b.ratio) bits.push(`1:${b.ratio.toFixed(1)}`);
  const g = grindLabel(b, s.grind_scales);
  if (g != null) bits.push(`${b.grinder ? b.grinder.replace(/^Fellow /, '') + ' ' : ''}${g}`);
  const t = tempOut(b.water_temp_c, s.temp_unit);
  if (t != null) bits.push(`${fmtN(t)}°`);
  return bits.join(' · ');
}

/** A brew in a list: tap it to open the brew (its recipe, rating and notes, Delete). */
export function BrewRow({ b, s, showDate }: { b: BrewView; s: Settings; showDate?: string }) {
  const sheets = useSheets();
  return (
    <div className="ri">
      <button
        type="button"
        className="rm"
        onClick={() => sheets.editBrew(b.id)}
        aria-label={`Brew #${b.num}, ${b.beanName}`}
      >
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
    </div>
  );
}
