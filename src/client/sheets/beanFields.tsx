// A bag's editable fields, in groups: used by "Add a bag" and by each card on a bag's screen
// (where a card flips into these fields to edit just that group).
import { useState } from 'react';
import { COUNTRIES, PROCESSES, VARIETIES, mergeOptions } from '@shared/lookups';
import type { BeanView, Model } from '@shared/logic/model';
import type { Settings } from '@shared/types';
import { currencyDigits, roundMoney } from '@shared/currency';
import { currencySymbol, numStr, parseNum } from '../lib/format';
import { Field, MultiSelect, NotesField, Select } from '../components/ui';
import { DatePicker } from '../components/DateTimePicker';

/** Everything editable about a bag, as the fields hold it (strings while typing). */
export interface Draft {
  name: string;
  roaster: string;
  newRoaster: string;
  tasting: string;
  roaster_notes: string;
  bag: string;
  cost: string;
  roasted_on: string;
  rest_days: string;
  origins: string[];
  region: string;
  altitude: string;
  varieties: string[];
  process: string;
  process_notes: string;
  notes: string;
}

export function draftFrom(b?: BeanView): Draft {
  return {
    name: b?.name ?? '',
    roaster: b?.roaster_id ?? '',
    newRoaster: '',
    tasting: b?.tasting_notes ?? '',
    roaster_notes: b?.roaster_notes ?? '',
    bag: numStr(b?.bag_g),
    cost: b?.cost != null ? String(b.cost) : '',
    roasted_on: b?.roasted_on ?? '',
    rest_days: b?.rest_days != null ? String(b.rest_days) : '',
    origins: b?.origins ?? [],
    region: b?.region ?? '',
    // Just the number: the label says MASL (older entries carried it in the value).
    altitude: (b?.altitude ?? '').replace(/\s*m\.?\s*a\.?\s*s\.?\s*l\.?\s*$/i, ''),
    varieties: b?.varieties ?? [],
    process: b?.process ?? '',
    process_notes: b?.process_notes ?? '',
    notes: b?.notes ?? '',
  };
}

/** Which bag fields each group saves. */
export const GROUPS = {
  coffee: ['name', 'roaster', 'tasting', 'roaster_notes'],
  bag: ['bag', 'cost', 'roasted_on', 'rest_days'],
  origin: ['origins', 'region', 'altitude', 'varieties'],
  process: ['process', 'process_notes'],
  notes: ['notes'],
} as const satisfies Record<string, (keyof Draft)[]>;

/**
 * The API body for some of a draft's fields (all of them by default). A new roaster is created
 * first; null when that fails.
 */
export async function bodyFrom(
  d: Draft,
  s: Settings,
  createRoaster: (name: string) => Promise<{ id: string } | null | undefined>,
  only?: readonly (keyof Draft)[],
): Promise<Record<string, unknown> | null> {
  const want = (k: keyof Draft) => !only || only.includes(k);
  const out: Record<string, unknown> = {};
  if (want('name')) out.name = d.name.trim();
  if (want('roaster')) {
    let roaster_id: string | null = d.roaster && d.roaster !== '__new' ? d.roaster : null;
    if (d.roaster === '__new' && d.newRoaster.trim()) {
      const r = await createRoaster(d.newRoaster.trim());
      if (!r) return null;
      roaster_id = r.id;
    }
    out.roaster_id = roaster_id;
  }
  if (want('tasting')) out.tasting_notes = d.tasting;
  if (want('roaster_notes')) out.roaster_notes = d.roaster_notes;
  if (want('bag')) out.bag_g = parseNum(d.bag);
  // The price, to the currency's own decimals (whole yen, cents for dollars).
  if (want('cost'))
    out.cost = parseNum(d.cost) == null ? null : roundMoney(parseNum(d.cost)!, s.currency);
  if (want('roasted_on')) out.roasted_on = d.roasted_on || null;
  if (want('rest_days')) {
    const n = parseNum(d.rest_days);
    out.rest_days = n == null ? null : Math.max(0, Math.min(365, Math.round(n)));
  }
  if (want('origins')) out.origins = d.origins;
  if (want('region')) out.region = d.region;
  if (want('altitude')) out.altitude = d.altitude;
  if (want('varieties')) out.varieties = d.varieties;
  if (want('process')) out.process = d.process;
  if (want('process_notes')) out.process_notes = d.process_notes;
  if (want('notes')) out.notes = d.notes;
  return out;
}

/** Suggestions for the pickers: what's in use first, then the usual lists. */
export function useBeanOptions(m: Model) {
  const inUse = (pick: (x: (typeof m.beans)[number]) => string[]) => m.beans.flatMap(pick);
  return {
    countries: mergeOptions(
      inUse((x) => x.origins),
      COUNTRIES,
    ),
    varieties: mergeOptions(
      inUse((x) => x.varieties),
      VARIETIES,
    ),
    processes: mergeOptions(
      inUse((x) => (x.process ? [x.process] : [])),
      PROCESSES,
    ),
    roasters: m.roasters,
    mark: m.mark,
  };
}

type FieldProps = { d: Draft; set: (p: Partial<Draft>) => void };
type Options = ReturnType<typeof useBeanOptions>;

export function CoffeeFields({ d, set, o }: FieldProps & { o: Options }) {
  return (
    <>
      <Field label="Name">
        <input
          className="in"
          value={d.name}
          placeholder="Finca Chilamate"
          onChange={(e) => set({ name: e.target.value })}
        />
      </Field>
      <Field label="Roaster">
        <Select
          value={d.roaster}
          onChange={(v) => set({ roaster: v })}
          groups={[
            { options: o.roasters.map((r) => ({ value: r.id, label: r.name })) },
            { options: [{ value: '__new', label: '+ New roaster' }] },
          ]}
        />
        {d.roaster === '__new' && (
          <input
            className="in"
            style={{ marginTop: 8 }}
            value={d.newRoaster}
            placeholder="Roaster name"
            onChange={(e) => set({ newRoaster: e.target.value })}
          />
        )}
      </Field>
      <Field label="Tasting notes">
        <input
          className="in"
          value={d.tasting}
          placeholder="Cassis, cantaloupe, jammy"
          onChange={(e) => set({ tasting: e.target.value })}
        />
      </Field>
      <Field label="Description">
        <NotesField
          value={d.roaster_notes}
          onChange={(e) => set({ roaster_notes: e.target.value })}
        />
      </Field>
    </>
  );
}

export function BagFields({ d, set, s }: FieldProps & { s: Settings }) {
  return (
    <>
      <div className="two fg">
        <div>
          <label className="lbl">Bag (g)</label>
          <input
            className="in"
            inputMode="decimal"
            value={d.bag}
            placeholder="250"
            onChange={(e) => set({ bag: e.target.value })}
          />
        </div>
        <div>
          <label className="lbl">Cost ({currencySymbol(s.currency)})</label>
          <input
            className="in"
            inputMode={currencyDigits(s.currency) ? 'decimal' : 'numeric'}
            value={d.cost}
            placeholder={currencyDigits(s.currency) ? '22.00' : '3000'}
            onChange={(e) => set({ cost: e.target.value })}
          />
        </div>
      </div>
      <div className="two fg">
        <div>
          <label className="lbl">Roast date</label>
          <DatePicker
            allowNone
            label="Roast date"
            value={d.roasted_on}
            onChange={(v) => set({ roasted_on: v })}
          />
        </div>
        <div>
          <label className="lbl">Recommended rest</label>
          <input
            className="in"
            inputMode="numeric"
            value={d.rest_days}
            placeholder="Days"
            onChange={(e) => set({ rest_days: e.target.value.replace(/[^\d]/g, '') })}
          />
        </div>
      </div>
    </>
  );
}

/** The origins: a searchable multi-select of every coffee-growing country, each with its flag. */
export function OriginPicker({
  value,
  onChange,
  o,
  startOpen,
  onClose,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  o: Options;
  startOpen?: boolean;
  onClose?: () => void;
}) {
  return (
    <MultiSelect
      label="Origin"
      placeholder="Choose origins"
      value={value}
      options={o.countries}
      decorate={(c) => `${o.mark(c)} ${c}`.trim()}
      onChange={onChange}
      startOpen={startOpen}
      onClose={onClose}
    />
  );
}

/** The varieties: a searchable multi-select; one that isn't listed can be added from the search. */
export function VarietyPicker({
  value,
  onChange,
  o,
  startOpen,
  onClose,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  o: Options;
  startOpen?: boolean;
  onClose?: () => void;
}) {
  return (
    <MultiSelect
      label="Variety"
      placeholder="Choose varieties"
      value={value}
      options={o.varieties}
      onChange={onChange}
      startOpen={startOpen}
      onClose={onClose}
    />
  );
}

/** The process: one, picked from a searchable list; a new one can be added from the search. */
export function ProcessPicker({
  value,
  onChange,
  o,
  startOpen,
  onClose,
}: {
  value: string;
  onChange: (v: string) => void;
  o: Options;
  startOpen?: boolean;
  onClose?: () => void;
}) {
  return (
    <MultiSelect
      single
      label="Process"
      placeholder="Choose a process"
      value={value ? [value] : []}
      options={o.processes}
      onChange={(v) => onChange(v[0] ?? '')}
      startOpen={startOpen}
      onClose={onClose}
    />
  );
}

export function OriginFields({ d, set, o }: FieldProps & { o: Options }) {
  return (
    <>
      <Field label="Origin">
        <OriginPicker value={d.origins} onChange={(origins) => set({ origins })} o={o} />
      </Field>
      <div className="two fg">
        <div>
          <label className="lbl">Region / farm</label>
          <input
            className="in"
            value={d.region}
            onChange={(e) => set({ region: e.target.value })}
          />
        </div>
        <div>
          <label className="lbl">Altitude (MASL)</label>
          <input
            className="in"
            inputMode="numeric"
            value={d.altitude}
            placeholder="1900"
            onChange={(e) => set({ altitude: e.target.value })}
          />
        </div>
      </div>
      <Field label="Variety">
        <VarietyPicker value={d.varieties} onChange={(varieties) => set({ varieties })} o={o} />
      </Field>
    </>
  );
}

export function ProcessFields({ d, set, o }: FieldProps & { o: Options }) {
  return (
    <>
      <Field label="Process">
        <ProcessPicker value={d.process} onChange={(process) => set({ process })} o={o} />
      </Field>
      <Field label="Process notes">
        <input
          className="in"
          value={d.process_notes}
          onChange={(e) => set({ process_notes: e.target.value })}
        />
      </Field>
    </>
  );
}

/** Toggle chips from a list, with a field to add one that isn't there. */
export function TagPicker({
  value,
  options,
  onChange,
  decorate,
  onAdded,
}: {
  value: string[];
  options: string[];
  onChange: (v: string[]) => void;
  decorate?: (s: string) => string;
  /** One typed in and added. */
  onAdded?: (name: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const all = mergeOptions(value, options);
  const toggle = (o: string) =>
    onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o]);
  return (
    <>
      <div className="seg">
        {all.map((o) => (
          <button
            key={o}
            type="button"
            className="chip sm"
            aria-pressed={value.includes(o)}
            onClick={() => toggle(o)}
          >
            {decorate ? decorate(o) : o}
          </button>
        ))}
      </div>
      <input
        className="in"
        style={{ marginTop: 8, maxWidth: 260 }}
        value={draft}
        placeholder="Add another"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && draft.trim()) {
            e.preventDefault();
            const name = draft.trim();
            if (!value.includes(name)) {
              onChange([...value, name]);
              onAdded?.(name);
            }
            setDraft('');
          }
        }}
      />
    </>
  );
}
