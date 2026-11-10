import { useState } from 'react';
import {
  BAG_PRESETS,
  BUY_AGAIN,
  COUNTRIES,
  EXTRACTION,
  PROCESSES,
  STATUSES,
  VARIETIES,
  flagFor,
  mergeOptions,
  type BeanStatus,
} from '@shared/lookups';
import { agoLabel, dayLabel, daysBetween, parseDay } from '@shared/logic/dates';
import { grindTable, type Model } from '@shared/logic/model';
import { fmtN, r1 } from '@shared/logic/units';
import type { Settings } from '@shared/types';
import { currencySymbol, money, numStr, parseNum } from '../lib/format';
import { currencyDigits, roundMoney } from '@shared/currency';
import { useActions } from '../lib/queries';
import { useToast } from '../components/Toast';
import { Legend, Scatter } from '../components/charts';
import { Photos } from '../components/Photos';
import { flags } from '../components/BeanCard';
import {
  ChoiceInput,
  ConfirmButton,
  Field,
  RB,
  Select,
  Sheet,
  SlideToggle,
  Stat,
} from '../components/ui';
import { useSheets } from './context';

const statusOpts = STATUSES.map((s) => [s.key, `${s.icon} ${s.label}`] as const);

export function BeanSheet({ m, s, beanId }: { m: Model; s: Settings; beanId: string }) {
  const b = m.beanMap.get(beanId);
  const sheets = useSheets();
  const actions = useActions();
  const toast = useToast();
  const [notes, setNotes] = useState(b?.notes ?? '');
  if (!b) return null;
  const now = new Date();
  const left = b.remaining != null ? Math.floor(b.remaining / m.dose7d) : null;
  const setStatus = async (k: BeanStatus | null) => {
    if (!k || k === b.status) return;
    const row = await actions.beans.update(b.id, { status: k });
    if (row && k !== 'finished')
      toast({ text: `${b.name} → ${STATUSES.find((x) => x.key === k)!.label}` });
  };
  const pts = b.brews
    .filter((x) => x.grind != null && x.rating != null)
    .map((x) => {
      const ex = EXTRACTION.find((e) => e.key === x.extraction);
      return {
        x: x.grind!,
        y: x.rating!,
        tone: ex?.tone ?? 'a',
        title: `Grind ${fmtN(x.grind)} · rated ${fmtN(x.rating)}${ex ? ' · ' + ex.label : ''}`,
      };
    });
  const gx = pts.map((p) => p.x);
  const gRows = grindTable(b);
  const sub = [flags(b), b.roasterName || 'No roaster', b.process, b.region]
    .filter(Boolean)
    .join(' · ');

  return (
    <Sheet
      title={b.name}
      sub={sub}
      onClose={sheets.close}
      footer={
        <>
          <button type="button" className="btn ghost left" onClick={() => sheets.beanForm(b.id)}>
            Edit details
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => sheets.log({ beanId: b.id })}
          >
            Brew this
          </button>
        </>
      }
    >
      <Field label="Status">
        <SlideToggle label="Status" value={b.status} options={statusOpts} onChange={setStatus} />
      </Field>
      {b.status === 'finished' && (
        <Field label="Would you buy it again?">
          <SlideToggle
            label="Would you buy it again?"
            value={b.buy_again}
            allowClear
            options={BUY_AGAIN.map((o) => [o.key, o.label, o.tone] as const)}
            onChange={(buy_again) => actions.beans.update(b.id, { buy_again })}
          />
        </Field>
      )}
      <div className="stats" style={{ marginTop: 0, marginBottom: 18 }}>
        <Stat
          v={b.avg != null ? fmtN(r1(b.avg)) : '–'}
          l="Avg rating"
          d={`${b.rated.length} rated of ${b.brews.length}`}
        />
        <Stat
          v={`${Math.round(b.used)}${b.bag_g ? ' / ' + b.bag_g : ''} g`}
          l="Used"
          d={
            b.remaining != null
              ? `${Math.round(b.remaining)} g left${left != null ? ` · ~${left} ${left === 1 ? 'brew' : 'brews'}` : ''}`
              : undefined
          }
        />
        <Stat
          v={money(b.cost, s.currency)}
          l="Price"
          d={b.perG ? `${money(b.perG * 100, s.currency)} / 100 g` : undefined}
        />
        <Stat
          v={b.perG ? money(b.perG * m.avgDose, s.currency) : '–'}
          l="Per cup"
          d={`at ${Math.round(m.avgDose)} g`}
        />
      </div>
      <Field label="Photos">
        <Photos owner="beans" ownerId={b.id} images={b.images} />
      </Field>
      {b.tags.length > 0 && (
        <Field label="Roaster says">
          <div className="tags">
            {b.tags.map((t) => (
              <span className="tag acc" key={t}>
                {t}
              </span>
            ))}
          </div>
        </Field>
      )}
      <Field label="Roasted">
        <div className="flexrow">
          <input
            className="in"
            type="date"
            style={{ maxWidth: 190 }}
            value={b.roasted_on ?? ''}
            onChange={(e) => actions.beans.update(b.id, { roasted_on: e.target.value || null })}
          />
          {b.roasted_on && (
            <span className="sub">{agoLabel(daysBetween(parseDay(b.roasted_on), now))}</span>
          )}
        </div>
      </Field>
      {b.status === 'resting' && (
        <Field label="Rest until">
          <input
            className="in"
            type="date"
            style={{ maxWidth: 190 }}
            value={b.rest_until ?? ''}
            onChange={(e) => actions.beans.update(b.id, { rest_until: e.target.value || null })}
          />
        </Field>
      )}
      {pts.length >= 2 && (
        <Field label="Dial-in: grind vs rating">
          <Scatter
            pts={pts}
            xMin={Math.floor(Math.min(...gx) - 0.5)}
            xMax={Math.ceil(Math.max(...gx) + 0.5)}
            yMin={0}
            yMax={10}
            xStep={1}
            yStep={2}
          />
          <Legend />
          {gRows[0] && (
            <div className="hint">
              Best average: grind {gRows[0].grind} ({fmtN(r1(gRows[0].avg))}, {gRows[0].n}{' '}
              {gRows[0].n === 1 ? 'brew' : 'brews'})
            </div>
          )}
        </Field>
      )}
      <Field label="Notes on this bag">
        <textarea
          className="in"
          value={notes}
          placeholder="What you would tell future you"
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== (b.notes ?? '') && actions.beans.update(b.id, { notes })}
        />
      </Field>
      {b.brews.length > 0 && (
        <Field label={`Brews with this bag (${b.brews.length})`}>
          <div className="card flat" style={{ padding: '2px 12px' }}>
            {b.brews.slice(0, 8).map((x) => (
              <div className="ri" key={x.id}>
                <button type="button" className="rm" onClick={() => sheets.rate(x.id)}>
                  <RB v={x.rating} />
                  <div className="mid">
                    <div className="t1">
                      {dayLabel(x.date, now)}
                      <span> · #{x.num}</span>
                    </div>
                    <div className="t2">
                      {fmtN(x.dose_g)} g → {x.water_ml != null ? Math.round(x.water_ml) : '–'} mL ·
                      grind {fmtN(x.grind)}
                      {x.extraction
                        ? ' · ' + EXTRACTION.find((e) => e.key === x.extraction)?.label
                        : ''}
                    </div>
                  </div>
                </button>
              </div>
            ))}
          </div>
        </Field>
      )}
    </Sheet>
  );
}

/** Add a bag, or edit every detail of one. */
export function BeanForm({ m, s, beanId }: { m: Model; s: Settings; beanId?: string }) {
  const sheets = useSheets();
  const actions = useActions();
  const toast = useToast();
  const b = beanId ? m.beanMap.get(beanId) : undefined;
  const [f, setF] = useState(() => ({
    name: b?.name ?? '',
    roaster: b?.roaster_id ?? '',
    newRoaster: '',
    status: (b?.status ?? 'resting') as BeanStatus,
    origins: b?.origins ?? [],
    varieties: b?.varieties ?? [],
    process: b?.process ?? '',
    process_notes: b?.process_notes ?? '',
    region: b?.region ?? '',
    altitude: b?.altitude ?? '',
    roasted_on: b?.roasted_on ?? '',
    received_on: b?.received_on ?? '',
    rest_until: b?.rest_until ?? '',
    bag: numStr(b?.bag_g),
    cost: b?.cost != null ? String(b.cost) : '',
    tasting: b?.tasting_notes ?? '',
    roaster_notes: b?.roaster_notes ?? '',
  }));
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const inUse = (pick: (x: (typeof m.beans)[number]) => string[]) => m.beans.flatMap(pick);
  const countries = mergeOptions(
    inUse((x) => x.origins),
    COUNTRIES,
  );
  const varieties = mergeOptions(
    inUse((x) => x.varieties),
    VARIETIES,
  );
  const processes = mergeOptions(
    inUse((x) => (x.process ? [x.process] : [])),
    PROCESSES,
  );

  const save = async () => {
    if (!f.name.trim()) return toast({ text: 'Name the bean first', tone: 'bad' });
    setBusy(true);
    let roaster_id: string | null = f.roaster && f.roaster !== '__new' ? f.roaster : null;
    if (f.roaster === '__new' && f.newRoaster.trim()) {
      const r = await actions.roasters.create({ name: f.newRoaster.trim() });
      if (!r) return setBusy(false);
      roaster_id = r.id;
    }
    const body = {
      name: f.name,
      roaster_id,
      status: f.status,
      origins: f.origins,
      varieties: f.varieties,
      process: f.process,
      process_notes: f.process_notes,
      region: f.region,
      altitude: f.altitude,
      roasted_on: f.roasted_on || null,
      received_on: f.received_on || null,
      rest_until: f.rest_until || null,
      bag_g: parseNum(f.bag),
      // The price, to the currency's own decimals (whole yen, cents for dollars).
      cost: parseNum(f.cost) == null ? null : roundMoney(parseNum(f.cost)!, s.currency),
      tasting_notes: f.tasting,
      roaster_notes: f.roaster_notes,
    };
    const row = b ? await actions.beans.update(b.id, body) : await actions.beans.create(body);
    setBusy(false);
    if (!row) return;
    toast({ text: b ? 'Saved' : `Added ${row.name}` });
    sheets.bean(row.id);
  };

  return (
    <Sheet
      title={b ? 'Edit bag' : 'Add a bag'}
      onClose={() => (b ? sheets.bean(b.id) : sheets.close())}
      footer={
        <>
          {b && (
            <ConfirmButton
              className="left"
              confirm={
                b.brews.length ? `Delete with ${b.brews.length} brews?` : 'Tap again to delete'
              }
              onConfirm={async () => {
                if (await actions.beans.remove(b.id)) {
                  sheets.close();
                  toast({ text: `Deleted ${b.name}` });
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
            {busy ? 'Saving…' : b ? 'Save' : 'Add bag'}
          </button>
        </>
      }
    >
      <Field label="Name">
        <input
          className="in"
          value={f.name}
          placeholder="Finca Chilamate"
          onChange={(e) => set({ name: e.target.value })}
        />
      </Field>
      <Field label="Roaster">
        <Select
          value={f.roaster}
          onChange={(v) => set({ roaster: v })}
          groups={[
            { options: m.roasters.map((r) => ({ value: r.id, label: r.name })) },
            { options: [{ value: '__new', label: '+ New roaster' }] },
          ]}
        />
        {f.roaster === '__new' && (
          <input
            className="in"
            style={{ marginTop: 8 }}
            value={f.newRoaster}
            placeholder="Roaster name"
            onChange={(e) => set({ newRoaster: e.target.value })}
          />
        )}
      </Field>
      <Field label="Status">
        <SlideToggle
          label="Status"
          value={f.status}
          options={statusOpts}
          onChange={(status) => set({ status })}
        />
      </Field>
      <div className="three fg">
        <div>
          <label className="lbl">Bag (g)</label>
          <input
            className="in"
            inputMode="decimal"
            value={f.bag}
            placeholder="250"
            onChange={(e) => set({ bag: e.target.value })}
          />
        </div>
        <div>
          <label className="lbl">Cost ({currencySymbol(s.currency)})</label>
          <input
            className="in"
            inputMode={currencyDigits(s.currency) ? 'decimal' : 'numeric'}
            value={f.cost}
            placeholder={currencyDigits(s.currency) ? '22.00' : '3000'}
            onChange={(e) => set({ cost: e.target.value })}
          />
        </div>
        <div>
          <label className="lbl">Roasted</label>
          <input
            className="in"
            type="date"
            value={f.roasted_on}
            onChange={(e) => set({ roasted_on: e.target.value })}
          />
        </div>
      </div>
      <div className="seg fg" style={{ marginTop: -6 }}>
        {BAG_PRESETS.map((g) => (
          <button
            key={g}
            type="button"
            className="chip sm"
            aria-pressed={f.bag === String(g)}
            onClick={() => set({ bag: String(g) })}
          >
            {g} g
          </button>
        ))}
      </div>
      <Field label="Origin">
        <TagPicker
          value={f.origins}
          options={countries}
          decorate={(c) => `${flagFor(c)} ${c}`.trim()}
          onChange={(origins) => set({ origins })}
        />
      </Field>
      <Field label="Process">
        <ChoiceInput
          small
          options={processes}
          value={f.process}
          onChange={(v) => set({ process: v })}
        />
      </Field>
      <Field label="Roaster tasting notes">
        <input
          className="in"
          value={f.tasting}
          placeholder="Cassis, cantaloupe, jammy"
          onChange={(e) => set({ tasting: e.target.value })}
        />
      </Field>
      <details className="fg" open={!!b}>
        <summary className="sub" style={{ cursor: 'pointer', marginBottom: 12 }}>
          More details
        </summary>
        <Field label="Region / farm">
          <input
            className="in"
            value={f.region}
            onChange={(e) => set({ region: e.target.value })}
          />
        </Field>
        <Field label="Variety">
          <TagPicker
            value={f.varieties}
            options={varieties}
            onChange={(varieties) => set({ varieties })}
          />
        </Field>
        <div className="two fg">
          <div>
            <label className="lbl">Altitude</label>
            <input
              className="in"
              value={f.altitude}
              placeholder="1,900 MASL"
              onChange={(e) => set({ altitude: e.target.value })}
            />
          </div>
          <div>
            <label className="lbl">Process notes</label>
            <input
              className="in"
              value={f.process_notes}
              onChange={(e) => set({ process_notes: e.target.value })}
            />
          </div>
        </div>
        <div className="two fg">
          <div>
            <label className="lbl">Received</label>
            <input
              className="in"
              type="date"
              value={f.received_on}
              onChange={(e) => set({ received_on: e.target.value })}
            />
          </div>
          <div>
            <label className="lbl">Rest until</label>
            <input
              className="in"
              type="date"
              value={f.rest_until}
              onChange={(e) => set({ rest_until: e.target.value })}
            />
          </div>
        </div>
        <Field label="Roaster’s description">
          <textarea
            className="in"
            value={f.roaster_notes}
            onChange={(e) => set({ roaster_notes: e.target.value })}
          />
        </Field>
      </details>
      {b && (
        <Field label="Photos">
          <Photos owner="beans" ownerId={b.id} images={b.images} />
        </Field>
      )}
    </Sheet>
  );
}

/** Toggle chips from a list, with a field to add one that isn't there. */
function TagPicker({
  value,
  options,
  onChange,
  decorate,
}: {
  value: string[];
  options: string[];
  onChange: (v: string[]) => void;
  decorate?: (s: string) => string;
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
            if (!value.includes(draft.trim())) onChange([...value, draft.trim()]);
            setDraft('');
          }
        }}
      />
    </>
  );
}

export function RoasterSheet({ m, roasterId }: { m: Model; roasterId?: string }) {
  const sheets = useSheets();
  const actions = useActions();
  const toast = useToast();
  const r = roasterId ? m.roasterMap.get(roasterId) : undefined;
  const [f, setF] = useState({
    name: r?.name ?? '',
    location: r?.location ?? '',
    website: r?.website ?? '',
    notes: r?.notes ?? '',
  });
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const beans = r ? m.beans.filter((b) => b.roaster_id === r.id) : [];
  const href = f.website && !/^https?:\/\//.test(f.website) ? `https://${f.website}` : f.website;

  const save = async () => {
    if (!f.name.trim()) return toast({ text: 'Name the roaster first', tone: 'bad' });
    setBusy(true);
    const row = r ? await actions.roasters.update(r.id, f) : await actions.roasters.create(f);
    setBusy(false);
    if (!row) return;
    toast({ text: r ? 'Saved' : `Added ${row.name}` });
    if (r) sheets.close();
    else sheets.roaster(row.id);
  };

  return (
    <Sheet
      title={r ? r.name : 'Add a roaster'}
      sub={r?.location ?? undefined}
      onClose={sheets.close}
      footer={
        <>
          {r && (
            <ConfirmButton
              className="left"
              confirm="Tap again to delete"
              onConfirm={async () => {
                if (await actions.roasters.remove(r.id)) {
                  sheets.close();
                  toast({ text: `Deleted ${r.name}` });
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
            {busy ? 'Saving…' : r ? 'Save' : 'Add roaster'}
          </button>
        </>
      }
    >
      {r && (
        <Field label="Logo">
          <Photos owner="roasters" ownerId={r.id} images={r.images} single />
        </Field>
      )}
      <Field label="Name">
        <input className="in" value={f.name} onChange={(e) => set({ name: e.target.value })} />
      </Field>
      <div className="two fg">
        <div>
          <label className="lbl">Location</label>
          <input
            className="in"
            value={f.location}
            placeholder="Durham, NC"
            onChange={(e) => set({ location: e.target.value })}
          />
        </div>
        <div>
          <label className="lbl">Website</label>
          <input
            className="in"
            value={f.website}
            inputMode="url"
            placeholder="example.coffee"
            onChange={(e) => set({ website: e.target.value })}
          />
          {r && f.website && (
            <p className="sub" style={{ margin: '8px 0 0' }}>
              <a href={href} target="_blank" rel="noreferrer">
                Open website
              </a>
            </p>
          )}
        </div>
      </div>
      <Field label="Notes">
        <textarea className="in" value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
      </Field>
      {beans.length > 0 && (
        <Field label={`Bags from ${r!.name} (${beans.length})`}>
          <div className="card flat" style={{ padding: '2px 12px' }}>
            {beans.map((b) => (
              <div className="ri" key={b.id}>
                <button type="button" className="rm" onClick={() => sheets.bean(b.id)}>
                  <RB v={b.avg != null ? r1(b.avg) : null} />
                  <div className="mid">
                    <div className="t1">{b.name}</div>
                    <div className="t2">
                      {STATUSES.find((x) => x.key === b.status)?.label} · {b.brews.length} brews
                    </div>
                  </div>
                </button>
              </div>
            ))}
          </div>
        </Field>
      )}
    </Sheet>
  );
}
