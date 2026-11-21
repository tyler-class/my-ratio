import { useState } from 'react';
import { EXTRACTION, STATUSES, STRENGTH } from '@shared/lookups';
import {
  describeScale,
  byName,
  formatGrind,
  grindLabel,
  middleOf,
  scaleFor,
  snapGrind,
  stepGrind,
} from '@shared/grind';
import { brewedAt, dayLabel, sinceLabel, toLocalInput } from '@shared/logic/dates';
import type { BrewView, Model } from '@shared/logic/model';
import { defaultBean, startFor, type BrewStart } from '@shared/logic/brewStart';
import { fmtInt, fmtN, r1, tempIn, tempOut } from '@shared/logic/units';
import type { Extraction, Strength } from '@shared/lookups';
import type { Settings } from '@shared/types';
import { numStr, parseNum } from '../lib/format';
import { useActions } from '../lib/queries';
import { useToast } from '../components/Toast';
import { DatePicker, TimePicker } from '../components/DateTimePicker';
import { Icon } from '../components/Icon';
import {
  ChoiceInput,
  ConfirmButton,
  Field,
  NotesField,
  Select,
  Sheet,
  SlideToggle,
  FormSection,
  STEP_BLOBS,
} from '../components/ui';
import { STATUS_ICON } from '../lib/statusIcons';
import { StatusBadge } from '../components/StatusArt';
import { ICON_PATHS } from '../components/Icon';
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

/** Ratings are whole numbers, 1 to 10. */
const SCALE = Array.from({ length: 10 }, (_, i) => String(i + 1));

export function RateFields({ v, set }: { v: RateValues; set: (p: Partial<RateValues>) => void }) {
  // An older rating with a half (or 0) shows on the nearest number; it's only rewritten when a
  // number is tapped.
  const shown = v.rating == null ? null : String(Math.max(1, Math.min(10, Math.round(v.rating))));
  return (
    <div>
      <Field label="Rating">
        <SlideToggle
          label="Rating"
          className="rate-scale"
          value={shown}
          options={SCALE.map((n) => [n, n] as const)}
          // Tap the chosen number again to clear it.
          onChange={(k) => set({ rating: k && Number(k) !== v.rating ? Number(k) : null })}
        />
      </Field>
      <Field label="Extraction">
        <SlideToggle
          label="Extraction"
          className="on-white"
          value={v.extraction}
          allowClear
          options={EXTRACTION.map((e) => [e.key, e.label, e.tone] as const)}
          onChange={(extraction) => set({ extraction })}
        />
      </Field>
      <Field label="Strength">
        <SlideToggle
          label="Strength"
          className="on-white"
          value={v.strength}
          allowClear
          options={STRENGTH.map((e) => [e.key, e.label, e.tone] as const)}
          onChange={(strength) => set({ strength })}
        />
      </Field>
      <Field label="Tasting notes">
        <NotesField
          value={v.tasting_notes}
          onChange={(e) => set({ tasting_notes: e.target.value })}
        />
      </Field>
      <Field label="Next time">
        <input
          className="in"
          value={v.next_time}
          onChange={(e) => set({ next_time: e.target.value })}
        />
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
      toast({ text: `Rated Brew #${b.num}` });
    }
  };
  const skip = async () => {
    setBusy(true);
    const ok = await actions.brews.update(b.id, { rating_skipped: true });
    setBusy(false);
    if (ok) {
      sheets.close();
      toast({
        text: `Skipped rating for Brew #${b.num}`,
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
        {fmtN(b.dose_g)} g → {b.water_ml != null ? fmtInt(b.water_ml) : '–'} mL · {b.grinder ?? ''}{' '}
        {grindLabel(b, s.grind_scales) ?? '–'} · {fmtN(tempOut(b.water_temp_c, s.temp_unit))}°
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
  /** The number after "1:", as typed. */
  ratio: string;
}

/** With no brew of this bean to go on: 1:16.67, and 201°F (94°C). */
const DEFAULT_RATIO = '16.67';
const defaultTemp = (s: Settings) => (s.temp_unit === 'F' ? '201' : '94');
/** A ratio as typed: up to two decimals, no trailing zeros. */
const ratioStr = (r: number) => String(Math.round(r * 100) / 100);

function recipeFrom(br: BrewView | null, s: Settings): Recipe {
  return {
    method: br?.method ?? s.methods[0] ?? '',
    grinder: br?.grinder ?? s.grinders[0] ?? '',
    grind: br ? (grindLabel(br, s.grind_scales) ?? '') : '',
    dose: br?.dose_g != null ? String(br.dose_g) : '20',
    water: br?.water_ml != null ? String(r1(br.water_ml)) : '',
    temp: numStr(tempOut(br?.water_temp_c ?? null, s.temp_unit)) || defaultTemp(s),
    notes: br?.recipe_notes ?? '',
    ratio: br?.ratio ? ratioStr(br.ratio) : DEFAULT_RATIO,
  };
}

/** Every recipe field blank, to fill in: a bag never brewed, or no bag chosen yet. */
const BLANK: Recipe = {
  method: '',
  grinder: '',
  grind: '',
  dose: '',
  water: '',
  temp: '',
  notes: '',
  ratio: '',
};

/** A new brew's recipe for a bag (see startFor): its best or last brew, else blank. */
const recipeForStart = (st: BrewStart, s: Settings): Recipe =>
  st.brew ? recipeFrom(st.brew, s) : BLANK;

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
    // Brew again (Recipe book): that recipe, as it was.
    const again = prefill?.fromBrewId ? (m.brewMap.get(prefill.fromBrewId) ?? null) : null;
    const beanId = prefill?.beanId ?? again?.bean_id ?? defaultBean(m)?.id ?? '';
    const bn = beanId ? m.beanMap.get(beanId) : undefined;
    let rec: Recipe;
    if (again) rec = recipeFrom(again, s);
    else if (bn) rec = recipeForStart(startFor(bn), s);
    // No bag yet (you choose): blank until you pick one.
    else rec = BLANK;
    // Water follows from dose and ratio when both are there (a blank recipe stays blank).
    if (!rec.water && parseNum(rec.dose) && parseNum(rec.ratio))
      rec.water = String(r1(parseNum(rec.dose)! * parseNum(rec.ratio)!));
    // When it was brewed: now, as the sheet opens; change it for one brewed earlier.
    return { beanId, ...rec, when: toLocalInput(new Date()), lock: true };
  });
  const [rv, setRv] = useState<RateValues>(() => rateFrom(editing));
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));

  const bean = f.beanId ? (m.beanMap.get(f.beanId) ?? null) : null;
  // What a new brew started from (not for an edit, or Brew again's chosen recipe). The other
  // choice (best or last) is one tap away when they differ.
  const [startOver, setStartOver] = useState<BrewStart | null>(null);
  const start = !editing && !prefill?.fromBrewId && bean ? (startOver ?? startFor(bean)) : null;
  const switchStart = (st: BrewStart) => {
    setStartOver(st);
    setF((x) => ({ ...x, ...recipeForStart(st, s) }));
  };
  const last = bean?.last ?? null;
  const best = bean?.best ?? null;
  const doseN = parseNum(f.dose);
  const waterN = parseNum(f.water);
  const ratioN = parseNum(f.ratio);
  const now = new Date();

  const pickBean = (id: string) => {
    const nb = m.beanMap.get(id);
    if (!editing && nb) {
      setStartOver(null);
      setF((x) => ({
        ...x,
        beanId: id,
        ...recipeForStart(startFor(nb), s),
      }));
    } else set({ beanId: id });
  };
  // Dose and water: locked, one follows the other at the ratio; free, the ratio follows them.
  const onDose = (val: string) => {
    const d = parseNum(val);
    if (f.lock && d && d > 0 && ratioN) set({ dose: val, water: String(r1(d * ratioN)) });
    else if (d && d > 0 && waterN) set({ dose: val, ratio: ratioStr(waterN / d) });
    else set({ dose: val });
  };
  const onWater = (val: string) => {
    const w = parseNum(val);
    if (f.lock && w && w > 0 && ratioN) set({ water: val, dose: String(r1(w / ratioN)) });
    else if (w && doseN && doseN > 0) set({ water: val, ratio: ratioStr(w / doseN) });
    else set({ water: val });
  };
  const onRatio = (val: string) => {
    const r = parseNum(val);
    set({ ratio: val, ...(r && doseN && doseN > 0 ? { water: String(r1(doseN * r)) } : {}) });
  };
  // The grind follows the chosen grinder's own scale (Settings → Equipment, or its preset).
  const scale = scaleFor(f.grinder, s.grind_scales);
  const grindN = parseNum(f.grind);
  const steps = scale.kind === 'steps' ? scale : null;
  const nudgeGrind = (dir: 1 | -1) =>
    steps &&
    set({
      grind: formatGrind(grindN == null ? middleOf(steps) : stepGrind(grindN, dir, steps), steps),
    });
  // A different grinder reads a different dial: its old setting means nothing there.
  const pickGrinder = (v: string) => set({ grinder: v, ...(v !== f.grinder ? { grind: '' } : {}) });
  // Choices from Settings, plus this brew's own if it isn't one of them any more.
  // The methods and grinders set up in Settings, A to Z. A brew's own value that's no longer
  // there sits alone at the top, chosen, until something from the list is picked.
  const pickList = (list: string[], v: string) => [
    ...(v && !list.includes(v) ? [{ options: [{ value: v, label: v }] }] : []),
    { options: byName(list).map((x) => ({ value: x, label: x })) },
  ];
  const [whenDay, whenTime] = f.when.split('T') as [string, string];
  const rated =
    rv.rating != null || !!rv.extraction || !!rv.strength || !!rv.tasting_notes || !!rv.next_time;
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
      // A write-in grinder keeps the setting as written; any other, as a number on its dial.
      grind: steps ? parseNum(f.grind) : null,
      grind_text: steps ? null : f.grind.trim() || null,
      dose_g: doseN,
      water_ml: waterN,
      water_temp_c: tempIn(parseNum(f.temp), s.temp_unit),
      recipe_notes: f.notes,
      ...(brewedAt(f.when) ? { brewed_at: brewedAt(f.when)! } : {}),
      ...(editing || rated ? ratePayload(rv) : {}),
    };
    setBusy(true);
    const row = editing
      ? await actions.brews.update(editing.id, body)
      : await actions.brews.create(body);
    setBusy(false);
    if (!row) return;
    sheets.close();
    if (editing) toast({ text: `Saved Brew #${editing.num}` });
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
              ask={`Delete Brew #${editing.num}?`}
              onConfirm={() => {
                const undo = actions.brews.removeLater(editing.id);
                sheets.close();
                toast({
                  text: `Deleted Brew #${editing.num}`,
                  action: { label: 'Undo', run: undo },
                });
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
      <FormSection icon="dripper" title="Brew details">
        <Field label="Brew time">
          <div className="flexrow" style={{ gap: 8 }}>
            <DatePicker
              value={whenDay}
              label="Brew date"
              onChange={(d) => set({ when: `${d}T${whenTime}` })}
            />
            <TimePicker
              value={whenTime}
              label="Brew time"
              allowNone={false}
              onChange={(t) => set({ when: `${whenDay}T${t}` })}
            />
          </div>
        </Field>
        <Field label="Bean">
          <Select
            value={f.beanId}
            onChange={pickBean}
            groups={groups.map((g) => ({
              label: g.st.label,
              badge: (
                <StatusBadge
                  status={g.st.key}
                  blob={STEP_BLOBS[STATUSES.findIndex((x) => x.key === g.st.key)]!}
                  icon={ICON_PATHS[STATUS_ICON[g.st.key]]}
                />
              ),
              className: `st-${g.st.key}`,
              options: g.items.map((b) => ({
                value: b.id,
                label: b.name,
                sub: b.roasterName || undefined,
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

        {start && start.why !== 'fresh' && (
          // One panel saying what the form started from, the other choice a tap away, and the
          // last brew's "next time" (dial-in advice worth seeing before brewing).
          <div className="callout start-from" style={{ marginBottom: 18 }}>
            <b>
              {start.why === 'best'
                ? `Starting from your best brew · rated ${fmtN(start.brew!.rating)} · ${sinceLabel(start.brew!.date, now)}`
                : `Starting from your last brew · ${sinceLabel(start.brew!.date, now)}`}
            </b>
            <>
              {fmtN(start.brew!.dose_g)} g →{' '}
              {start.brew!.water_ml != null ? fmtInt(start.brew!.water_ml) : '–'} mL · grind{' '}
              {grindLabel(start.brew!, s.grind_scales) ?? '–'}
            </>
            {last?.next_time && (
              <div className="start-next">
                <span>Next time:</span> {last.next_time}
              </div>
            )}
            {start.why === 'best' && last && last.id !== start.brew!.id && (
              <button
                type="button"
                className="link start-switch"
                onClick={() => switchStart({ brew: last, why: 'last' })}
              >
                Use last brew instead
              </button>
            )}
            {start.why === 'last' && best && best.id !== start.brew!.id && (
              <button
                type="button"
                className="link start-switch"
                onClick={() => switchStart({ brew: best, why: 'best' })}
              >
                Use best brew instead (rated {fmtN(best.rating)})
              </button>
            )}
          </div>
        )}

        <Field label="Method">
          {s.methods.length ? (
            <Select
              value={f.method}
              groups={pickList(s.methods, f.method)}
              onChange={(v) => set({ method: v })}
            />
          ) : (
            <ChoiceInput options={[]} value={f.method} onChange={(v) => set({ method: v })} />
          )}
        </Field>
        <Field label="Grinder">
          {s.grinders.length ? (
            <Select
              value={f.grinder}
              groups={pickList(s.grinders, f.grinder)}
              onChange={pickGrinder}
            />
          ) : (
            <ChoiceInput options={[]} value={f.grinder} onChange={pickGrinder} />
          )}
        </Field>
        <Field label="Grind setting">
          {f.grinder && !steps ? (
            <input
              className="in grind-text"
              value={f.grind}
              maxLength={40}
              onChange={(e) => set({ grind: e.target.value })}
            />
          ) : (
            <div className="step compact">
              <button
                type="button"
                aria-label="Finer"
                disabled={!steps || !f.grinder || (grindN != null && grindN <= steps.min)}
                onClick={() => nudgeGrind(-1)}
              >
                <Icon name="minus" size={18} />
              </button>
              <input
                className="in"
                inputMode={steps?.between ? 'decimal' : 'numeric'}
                value={f.grind}
                disabled={!f.grinder}
                onChange={(e) => set({ grind: e.target.value })}
                // Typed settings land on the nearest one the dial has.
                onBlur={() =>
                  steps &&
                  grindN != null &&
                  set({ grind: formatGrind(snapGrind(grindN, steps), steps) })
                }
              />
              <button
                type="button"
                aria-label="Coarser"
                disabled={!steps || !f.grinder || (grindN != null && grindN >= steps.max)}
                onClick={() => nudgeGrind(1)}
              >
                <Icon name="plus" size={18} />
              </button>
            </div>
          )}
          {f.grinder && steps && <div className="sub grind-scale">{describeScale(scale)}</div>}
        </Field>
        <div className="fg dose-water">
          <div>
            <label className="lbl" htmlFor="brew-dose">
              Dose (g)
            </label>
            <input
              id="brew-dose"
              className="in"
              inputMode="decimal"
              value={f.dose}
              onChange={(e) => onDose(e.target.value)}
            />
          </div>
          {/* Between the two: locked, they move together at the ratio. */}
          <button
            type="button"
            className={`ratio-lock${f.lock ? ' on' : ''}`}
            aria-pressed={f.lock}
            aria-label={f.lock ? 'Dose and water locked to the ratio' : 'Dose and water free'}
            title={
              f.lock
                ? 'Locked: changing the dose or water keeps the ratio'
                : 'Free: changing the dose or water changes the ratio'
            }
            onClick={() => set({ lock: !f.lock })}
          >
            <Icon name={f.lock ? 'lock' : 'unlock'} size={18} />
          </button>
          <div>
            <label className="lbl" htmlFor="brew-water">
              Water (mL)
            </label>
            <input
              id="brew-water"
              className="in"
              inputMode="decimal"
              value={f.water}
              onChange={(e) => onWater(e.target.value)}
            />
          </div>
        </div>
        <Field label="Ratio">
          <div className="ratio-in">
            <span className="ratio-one" aria-hidden="true">
              1 :
            </span>
            <input
              className="in"
              inputMode="decimal"
              aria-label="Ratio, water to 1 of coffee"
              value={f.ratio}
              onChange={(e) => onRatio(e.target.value)}
            />
          </div>
        </Field>
        <Field label={`Water temp (°${s.temp_unit})`}>
          <div className="flexrow">
            <input
              className="in"
              style={{ maxWidth: 110 }}
              inputMode="decimal"
              value={f.temp}
              onChange={(e) => set({ temp: e.target.value })}
            />
          </div>
        </Field>
        <Field label="Comments">
          <NotesField value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
      </FormSection>
      <FormSection icon="star" title="Rating & tasting">
        <RateFields v={rv} set={(p) => setRv((x) => ({ ...x, ...p }))} />
      </FormSection>
    </Sheet>
  );
}
