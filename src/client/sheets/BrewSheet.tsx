import { useState } from 'react';
import {
  EXTRACTION,
  RATIO_PRESETS,
  STATUSES,
  STRENGTH,
  TEMP_PRESETS,
  flagFor,
} from '@shared/lookups';
import { agoLabel, brewedAt, dayLabel, daysBetween, toLocalInput } from '@shared/logic/dates';
import { recentGrinds, type BrewView, type Model } from '@shared/logic/model';
import { fmtN, r1, tempIn, tempOut } from '@shared/logic/units';
import type { Extraction, Strength } from '@shared/lookups';
import type { Settings } from '@shared/types';
import { ellipsis, numStr, parseNum } from '../lib/format';
import { useActions } from '../lib/queries';
import { useToast } from '../components/Toast';
import {
  ChoiceInput,
  ConfirmButton,
  Field,
  RB,
  Select,
  Sheet,
  SlideToggle,
} from '../components/ui';
import { useSheets, type LogPrefill } from './context';

export interface RateValues {
  rating: number | null;
  extraction: Extraction | null;
  strength: Strength | null;
  tasting_notes: string;
  next_time: string;
}

export const rateFrom = (b?: BrewView | null): RateValues => ({
  rating: b?.rating ?? null,
  extraction: b?.extraction ?? null,
  strength: b?.strength ?? null,
  tasting_notes: b?.tasting_notes ?? '',
  next_time: b?.next_time ?? '',
});

export function RateFields({ v, set }: { v: RateValues; set: (p: Partial<RateValues>) => void }) {
  const nudge = (d: number) =>
    set({ rating: Math.max(0, Math.min(10, Math.round(((v.rating ?? 7) + d) * 2) / 2)) });
  const tip = EXTRACTION.find((e) => e.key === v.extraction)?.tip;
  return (
    <div>
      <Field label="Rating">
        <div className="flexrow" style={{ gap: 14 }}>
          <RB v={v.rating} big />
          <div className="step">
            <button type="button" aria-label="Lower" onClick={() => nudge(-0.5)}>
              −
            </button>
            <button type="button" aria-label="Higher" onClick={() => nudge(0.5)}>
              +
            </button>
          </div>
          <div className="seg">
            {[5, 6, 7, 8, 9, 10].map((n) => (
              <button
                key={n}
                type="button"
                className="chip sm"
                aria-pressed={v.rating === n}
                onClick={() => set({ rating: v.rating === n ? null : n })}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </Field>
      <Field label="Extraction">
        <SlideToggle
          label="Extraction"
          value={v.extraction}
          allowClear
          options={EXTRACTION.map((e) => [e.key, e.label, e.tone] as const)}
          onChange={(extraction) => set({ extraction })}
        />
      </Field>
      <Field label="Strength">
        <SlideToggle
          label="Strength"
          value={v.strength}
          allowClear
          options={STRENGTH.map((e) => [e.key, e.label] as const)}
          onChange={(strength) => set({ strength })}
        />
      </Field>
      <Field label="Tasting notes">
        <textarea
          className="in"
          value={v.tasting_notes}
          placeholder="Round, plummy, a little sharp at the end"
          onChange={(e) => set({ tasting_notes: e.target.value })}
        />
      </Field>
      <Field label="Next time">
        <input
          className="in"
          value={v.next_time}
          placeholder="One tick finer, slower pour"
          onChange={(e) => set({ next_time: e.target.value })}
        />
        {tip && !v.next_time.includes(tip) && (
          <div className="seg" style={{ marginTop: 8 }}>
            <button
              type="button"
              className="chip sm"
              onClick={() => set({ next_time: v.next_time ? `${v.next_time} ${tip}` : tip })}
            >
              + {tip}
            </button>
          </div>
        )}
      </Field>
    </div>
  );
}

export const ratePayload = (v: RateValues) => ({
  rating: v.rating,
  extraction: v.extraction,
  strength: v.strength,
  tasting_notes: v.tasting_notes,
  next_time: v.next_time,
});

export function RateSheet({ m, s, brewId }: { m: Model; s: Settings; brewId: string }) {
  const b = m.brewMap.get(brewId);
  const sheets = useSheets();
  const actions = useActions();
  const toast = useToast();
  const [v, setV] = useState(() => rateFrom(b));
  const [busy, setBusy] = useState(false);
  if (!b) return null;
  const save = async () => {
    setBusy(true);
    const ok = await actions.brews.update(b.id, ratePayload(v));
    setBusy(false);
    if (ok) {
      sheets.close();
      toast({ text: `Saved rating for #${b.num}` });
    }
  };
  const skip = async () => {
    setBusy(true);
    const ok = await actions.brews.update(b.id, { rating_skipped: true });
    setBusy(false);
    if (ok) {
      sheets.close();
      toast({
        text: `Skipped #${b.num}`,
        action: {
          label: 'Undo',
          run: () => void actions.brews.update(b.id, { rating_skipped: false }),
        },
      });
    }
  };
  return (
    <Sheet
      title="Rate this brew"
      sub={`${b.beanName} · #${b.num} · ${dayLabel(b.date, new Date()).toLowerCase()}`}
      onClose={sheets.close}
      footer={
        <>
          {b.rating == null && !b.rating_skipped && (
            <button type="button" className="btn ghost left" disabled={busy} onClick={skip}>
              Skip
            </button>
          )}
          <button type="button" className="btn ghost" onClick={sheets.close}>
            Cancel
          </button>
          <button type="button" className="btn primary" disabled={busy} onClick={save}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <div className="callout" style={{ marginBottom: 18 }}>
        <b>Recipe</b>
        {fmtN(b.dose_g)} g → {b.water_ml != null ? Math.round(b.water_ml) : '–'} mL ·{' '}
        {b.grinder ?? ''} {fmtN(b.grind)} · {fmtN(tempOut(b.water_temp_c, s.temp_unit))}°
        {b.recipe_notes && <div className="sub">{b.recipe_notes}</div>}
      </div>
      <RateFields v={v} set={(p) => setV((x) => ({ ...x, ...p }))} />
    </Sheet>
  );
}

interface Recipe {
  method: string;
  grinder: string;
  grind: string;
  dose: string;
  water: string;
  temp: string;
  notes: string;
  ratio: number;
}

function recipeFrom(br: BrewView | null, s: Settings): Recipe {
  return {
    method: br?.method ?? s.methods[0] ?? '',
    grinder: br?.grinder ?? s.grinders[0] ?? '',
    grind: numStr(br?.grind),
    dose: br?.dose_g != null ? String(br.dose_g) : '20',
    water: br?.water_ml != null ? String(r1(br.water_ml)) : '',
    temp:
      numStr(tempOut(br?.water_temp_c ?? null, s.temp_unit)) ||
      (s.temp_unit === 'F' ? '201' : '94'),
    notes: br?.recipe_notes ?? '',
    ratio: br?.ratio ?? 16,
  };
}

/** Log a new brew (mode log) or edit any field of an existing one (mode edit). */
export function BrewSheet({
  m,
  s,
  prefill,
  editId,
}: {
  m: Model;
  s: Settings;
  prefill?: LogPrefill;
  editId?: string;
}) {
  const sheets = useSheets();
  const actions = useActions();
  const toast = useToast();
  const editing = editId ? (m.brewMap.get(editId) ?? null) : null;

  const [f, setF] = useState(() => {
    if (editing) {
      return {
        beanId: editing.bean_id ?? '',
        ...recipeFrom(editing, s),
        when: toLocalInput(editing.date),
        lock: false,
      };
    }
    let br: BrewView | null = prefill?.fromBrewId
      ? (m.brewMap.get(prefill.fromBrewId) ?? null)
      : null;
    const beanId = prefill?.beanId ?? br?.bean_id ?? m.brews[0]?.bean_id ?? '';
    if (!br && beanId) br = m.beanMap.get(beanId)?.last ?? null;
    if (!br) br = m.brews[0] ?? null;
    const rec = recipeFrom(br, s);
    if (br && br.bean_id !== beanId) {
      rec.grind = '';
      rec.notes = '';
    }
    if (!rec.water) rec.water = String(r1((parseNum(rec.dose) ?? 20) * rec.ratio));
    // When it was brewed: now, as the sheet opens; change it for one brewed earlier.
    return { beanId, ...rec, when: toLocalInput(new Date()), lock: true };
  });
  const [rate, setRate] = useState(!!editing);
  const [rv, setRv] = useState<RateValues>(() => rateFrom(editing));
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));

  const bean = f.beanId ? (m.beanMap.get(f.beanId) ?? null) : null;
  const last = !editing && bean ? bean.last : null;
  const best = bean?.best ?? null;
  const doseN = parseNum(f.dose);
  const waterN = parseNum(f.water);
  const ratioNow = doseN && waterN && doseN > 0 ? waterN / doseN : null;
  const now = new Date();

  const pickBean = (id: string) => {
    const nb = m.beanMap.get(id);
    if (!editing && nb?.last) setF((x) => ({ ...x, beanId: id, ...recipeFrom(nb.last, s) }));
    else if (!editing) setF((x) => ({ ...x, beanId: id, grind: '', notes: '' }));
    else set({ beanId: id });
  };
  const onDose = (val: string) => {
    const d = parseNum(val);
    if (f.lock && d && d > 0 && f.ratio) set({ dose: val, water: String(r1(d * f.ratio)) });
    else set({ dose: val });
  };
  const onWater = (val: string) => {
    const w = parseNum(val);
    set({ water: val, ratio: doseN && w && doseN > 0 ? w / doseN : f.ratio });
  };
  const setRatio = (r: number) =>
    set({ ratio: r, water: doseN && doseN > 0 ? String(r1(doseN * r)) : f.water });
  const nudgeGrind = (d: number) => {
    const g = parseNum(f.grind);
    set({ grind: String(Math.round(((g ?? 6) + d) * 10) / 10) });
  };
  const grinds = recentGrinds(bean);
  const drinking = m.beans.filter((b) => b.status === 'drinking');
  const groups = STATUSES.map((st) => ({
    st,
    items: m.beans.filter((b) => b.status === st.key).sort((a, b) => a.name.localeCompare(b.name)),
  })).sort((a, b) => (a.st.key === 'drinking' ? -1 : b.st.key === 'drinking' ? 1 : 0));

  const save = async () => {
    if (!f.beanId) return toast({ text: 'Pick a bean first', tone: 'bad' });
    if (!doseN || !waterN) return toast({ text: 'Dose and water are needed', tone: 'bad' });
    const body = {
      bean_id: f.beanId,
      method: f.method,
      grinder: f.grinder,
      grind: parseNum(f.grind),
      dose_g: doseN,
      water_ml: waterN,
      water_temp_c: tempIn(parseNum(f.temp), s.temp_unit),
      recipe_notes: f.notes,
      ...(brewedAt(f.when) ? { brewed_at: brewedAt(f.when)! } : {}),
      ...(rate ? ratePayload(rv) : {}),
    };
    setBusy(true);
    const row = editing
      ? await actions.brews.update(editing.id, body)
      : await actions.brews.create(body);
    setBusy(false);
    if (!row) return;
    sheets.close();
    if (editing) toast({ text: `Saved #${editing.num}` });
    else
      toast({
        text: `Brew #${row.num} logged · ${bean?.name ?? ''}`,
        action: { label: 'Undo', run: () => void actions.brews.remove(row.id) },
      });
  };

  return (
    <Sheet
      title={editing ? `Edit brew #${editing.num}` : 'Log a brew'}
      sub={editing ? dayLabel(editing.date, now) : undefined}
      onClose={sheets.close}
      footer={
        <>
          {editing && (
            <ConfirmButton
              className="left"
              confirm="Tap again to delete"
              onConfirm={async () => {
                if (await actions.brews.remove(editing.id)) {
                  sheets.close();
                  toast({ text: `Deleted #${editing.num}` });
                }
              }}
            >
              Delete
            </ConfirmButton>
          )}
          <button type="button" className="btn ghost" onClick={sheets.close}>
            Cancel
          </button>
          <button type="button" className="btn primary" disabled={busy} onClick={save}>
            {busy ? 'Saving…' : editing ? 'Save' : 'Log brew'}
          </button>
        </>
      }
    >
      <Field label="When">
        <input
          className="in when"
          type="datetime-local"
          aria-label="When you brewed it"
          value={f.when}
          onChange={(e) => set({ when: e.target.value })}
        />
      </Field>
      <Field label="Bean">
        {drinking.length > 0 && (
          <div className="seg" style={{ marginBottom: 10 }}>
            {drinking.map((b) => (
              <button
                key={b.id}
                type="button"
                className="chip"
                aria-pressed={f.beanId === b.id}
                onClick={() => pickBean(b.id)}
              >
                {`${flagFor(b.origins[0] ?? '')} ${ellipsis(b.name, 22)}`.trim()}
              </button>
            ))}
          </div>
        )}
        <Select
          value={f.beanId}
          onChange={pickBean}
          placeholder="Choose a bean"
          groups={groups.map((g) => ({
            label: `${g.st.icon} ${g.st.label}`,
            options: g.items.map((b) => ({
              value: b.id,
              label: b.name + (b.roasterName ? ` · ${b.roasterName}` : ''),
            })),
          }))}
        />
        {m.beans.length === 0 && (
          <button
            type="button"
            className="btn sm"
            style={{ marginTop: 8 }}
            onClick={() => sheets.beanForm()}
          >
            Add your first bag
          </button>
        )}
      </Field>

      {last && (
        <div className="callout" style={{ marginBottom: 18 }}>
          <b>Last time · {agoLabel(daysBetween(last.date, now))}</b>
          {fmtN(last.dose_g)} g → {last.water_ml != null ? Math.round(last.water_ml) : '–'} mL ·
          grind {fmtN(last.grind)}
          {last.rating != null ? ` · rated ${fmtN(last.rating)}` : ''}
          {last.extraction ? ` · ${EXTRACTION.find((e) => e.key === last.extraction)?.label}` : ''}
          {last.next_time && <div style={{ marginTop: 4, fontWeight: 650 }}>{last.next_time}</div>}
          {best && best.id !== last.id && (
            <div style={{ marginTop: 8 }}>
              <button
                type="button"
                className="btn sm"
                onClick={() => setF((x) => ({ ...x, ...recipeFrom(best, s) }))}
              >
                Use best recipe ({fmtN(best.rating)}): grind {fmtN(best.grind)}, 1:
                {best.ratio ? best.ratio.toFixed(1) : '?'}
              </button>
            </div>
          )}
        </div>
      )}

      <Field label="Method">
        <ChoiceInput options={s.methods} value={f.method} onChange={(v) => set({ method: v })} />
      </Field>
      <Field label="Grinder">
        <ChoiceInput
          options={s.grinders}
          value={f.grinder}
          placeholder="Grinder name"
          onChange={(v) => set({ grinder: v })}
        />
      </Field>
      <Field label="Grind setting">
        <div className="step compact">
          <button type="button" aria-label="Finer" onClick={() => nudgeGrind(-0.2)}>
            −
          </button>
          <input
            className="in"
            inputMode="decimal"
            value={f.grind}
            placeholder="6.2"
            onChange={(e) => set({ grind: e.target.value })}
          />
          <button type="button" aria-label="Coarser" onClick={() => nudgeGrind(0.2)}>
            +
          </button>
        </div>
        {grinds.length > 0 && (
          <div className="seg" style={{ marginTop: 8 }}>
            {grinds.map((g) => (
              <button
                key={g}
                type="button"
                className="chip sm"
                aria-pressed={parseNum(f.grind) === g}
                onClick={() => set({ grind: String(g) })}
              >
                {g}
              </button>
            ))}
          </div>
        )}
      </Field>
      <div className="two fg">
        <div>
          <label className="lbl">Dose (g)</label>
          <input
            className="in"
            inputMode="decimal"
            value={f.dose}
            onChange={(e) => onDose(e.target.value)}
          />
        </div>
        <div>
          <label className="lbl">Water (mL)</label>
          <input
            className="in"
            inputMode="decimal"
            value={f.water}
            onChange={(e) => onWater(e.target.value)}
          />
        </div>
      </div>
      <div className="fg ratio">
        <span className="big">{ratioNow ? `1 : ${ratioNow.toFixed(2)}` : '1 : –'}</span>
        {RATIO_PRESETS.map((r) => (
          <button
            key={r}
            type="button"
            className="chip sm"
            aria-pressed={ratioNow != null && Math.abs(ratioNow - r) < 0.03}
            onClick={() => setRatio(r)}
          >
            1:{r}
          </button>
        ))}
        <button
          type="button"
          className="chip sm"
          aria-pressed={f.lock}
          onClick={() => set({ lock: !f.lock })}
          title="When locked, changing the dose keeps the ratio"
        >
          {f.lock ? 'Ratio locked' : 'Ratio free'}
        </button>
      </div>
      <Field label={`Water temp (°${s.temp_unit})`}>
        <div className="flexrow">
          <input
            className="in"
            style={{ maxWidth: 110 }}
            inputMode="decimal"
            value={f.temp}
            onChange={(e) => set({ temp: e.target.value })}
          />
          {TEMP_PRESETS[s.temp_unit].map((t) => (
            <button
              key={t}
              type="button"
              className="chip sm"
              aria-pressed={f.temp === String(t)}
              onClick={() => set({ temp: String(t) })}
            >
              {t}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Recipe / pour notes">
        <input
          className="in"
          value={f.notes}
          placeholder="60 g bloom 45 s, pours to 250/400/600, done 3:30"
          onChange={(e) => set({ notes: e.target.value })}
        />
      </Field>
      {editing ? (
        <RateFields v={rv} set={(p) => setRv((x) => ({ ...x, ...p }))} />
      ) : (
        <div className="fg">
          <button type="button" className="chip" aria-pressed={rate} onClick={() => setRate(!rate)}>
            {rate ? 'Rating it now' : 'Rate it now (or later)'}
          </button>
          {rate && (
            <div style={{ marginTop: 16 }}>
              <RateFields v={rv} set={(p) => setRv((x) => ({ ...x, ...p }))} />
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
