import { useState } from 'react';
import { STATUSES, type BeanStatus } from '@shared/lookups';
import type { BeanView, Model } from '@shared/logic/model';
import { money, money0 } from '../lib/format';
import { Icon } from '../components/Icon';
import type { Settings } from '@shared/types';
import { fmtInt, fmtN, plural, r1 } from '@shared/logic/units';
import { useActions } from '../lib/queries';
import { useToast } from '../components/Toast';
import { Photos } from '../components/Photos';
import {
  ConfirmButton,
  Field,
  FormSection,
  NotesField,
  RB,
  Sheet,
  Stat,
  StatusPath,
} from '../components/ui';
import { STATUS_ICON } from '../lib/statusIcons';
import { useSheets } from './context';
import {
  BagFields,
  CoffeeFields,
  OriginFields,
  ProcessFields,
  bodyFrom,
  draftFrom,
  useBeanOptions,
  type Draft,
} from './beanFields';

const statusOpts = STATUSES.map((s) => [s.key, s.label, STATUS_ICON[s.key]] as const);

export { BeanSheet } from './BeanView';

/** Add a bag (an existing one is edited on its own screen, card by card). */
export function BeanForm({ m, s, beanId }: { m: Model; s: Settings; beanId?: string }) {
  const sheets = useSheets();
  const actions = useActions();
  const toast = useToast();
  const b = beanId ? m.beanMap.get(beanId) : undefined;
  const o = useBeanOptions(m);
  const [d, setD] = useState<Draft>(() => draftFrom(b));
  const [status, setStatus] = useState<BeanStatus>(b?.status ?? 'ordered');
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));

  const save = async () => {
    if (!d.name.trim()) return toast({ text: 'Name the bean first', tone: 'bad' });
    setBusy(true);
    const body = await bodyFrom(d, s, (name) => actions.roasters.create({ name }));
    if (!body) return setBusy(false);
    body.status = status;
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
          <button type="button" className="btn primary" disabled={busy} onClick={save}>
            {busy ? 'Saving…' : b ? 'Save' : 'Add bag'}
          </button>
        </>
      }
    >
      <Field label="Status">
        <StatusPath
          label="Status"
          value={status}
          from={b?.status}
          options={statusOpts}
          onChange={setStatus}
        />
      </Field>
      <FormSection icon="coffee" title="The coffee">
        <CoffeeFields d={d} set={set} o={o} />
      </FormSection>
      <FormSection icon="bag" title="The bag">
        <BagFields d={d} set={set} s={s} />
      </FormSection>
      <FormSection icon="map" title="Origin">
        <OriginFields d={d} set={set} o={o} />
      </FormSection>
      <FormSection icon="drop" title="Process">
        <ProcessFields d={d} set={set} o={o} />
      </FormSection>
    </Sheet>
  );
}

/**
 * A roaster: its details (edited here), what your bags from it add up to, and the bags.
 */
export function RoasterSheet({ m, s, roasterId }: { m: Model; s: Settings; roasterId?: string }) {
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
  const beans = r
    ? m.beans
        .filter((b) => b.roaster_id === r.id)
        .sort((a, b) => b.created.getTime() - a.created.getTime())
    : [];
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
              ask={`Delete ${r.name}?`}
              onConfirm={() => {
                const undo = actions.roasters.removeLater(r.id);
                sheets.close();
                toast({ text: `Deleted ${r.name}`, action: { label: 'Undo', run: undo } });
              }}
            >
              Delete
            </ConfirmButton>
          )}
          <button type="button" className="btn primary" disabled={busy} onClick={save}>
            {busy ? 'Saving…' : r ? 'Save' : 'Add roaster'}
          </button>
        </>
      }
    >
      <FormSection icon="store" title="Details">
        {r && (
          <Field label="Logo">
            <Photos owner="roasters" ownerId={r.id} images={r.images} single />
          </Field>
        )}
        <Field label="Name">
          <input className="in" value={f.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <div className="two fg stack-phone">
          <div>
            <label className="lbl">Location</label>
            <input
              className="in"
              value={f.location}
              onChange={(e) => set({ location: e.target.value })}
            />
          </div>
          <div>
            <label className="lbl lbl-link">
              Website
              {f.website.trim() && (
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="lbl-open"
                  aria-label="Open website in a new tab"
                  title="Open in a new tab"
                >
                  <Icon name="external" size={14} />
                </a>
              )}
            </label>
            <input
              className="in"
              value={f.website}
              inputMode="url"
              onChange={(e) => set({ website: e.target.value })}
            />
          </div>
        </div>
        <Field label="Notes">
          <NotesField value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
      </FormSection>
      {r && beans.length > 0 && <RoasterInsights beans={beans} cur={s.currency} />}
      {r && beans.length > 0 && (
        <FormSection icon="bag" title={`Bags (${fmtInt(beans.length)})`}>
          <div className="rs-bags">
            {beans.map((b) => (
              <button key={b.id} type="button" className="rs-bag" onClick={() => sheets.bean(b.id)}>
                <RB v={b.avg != null ? r1(b.avg) : null} />
                <span className="rs-bag-t">
                  <span className="t1">{b.name}</span>
                  <span className="t2">{plural(b.brews.length, 'brew')}</span>
                </span>
                <span className={`tag st-pill s-${b.status}`}>
                  <Icon name={STATUS_ICON[b.status]} size={13} />
                  {STATUSES.find((x) => x.key === b.status)?.label}
                </span>
              </button>
            ))}
          </div>
        </FormSection>
      )}
    </Sheet>
  );
}

/**
 * What your bags from a roaster add up to, as tiles: average rating (each rated bag's average,
 * averaged; always shown), bags bought, spend and grams and price per 100 g.
 * The price tiles are left out when no prices are logged.
 */
function RoasterInsights({ beans, cur }: { beans: BeanView[]; cur: string }) {
  // The roaster's rating: each bag's own average (its rated brews), averaged across the bags that
  // have one, so a bag brewed often doesn't outweigh the rest.
  const ratedBags = beans.filter((b) => b.avg != null);
  const avg = ratedBags.length
    ? ratedBags.reduce((t, b) => t + b.avg!, 0) / ratedBags.length
    : null;
  const priced = beans.filter((b) => b.cost);
  const spend = priced.reduce((t, b) => t + b.cost!, 0);
  const pricedGrams = priced.reduce((t, b) => t + (b.bag_g ?? 0), 0);
  const grams = beans.reduce((t, b) => t + (b.bag_g ?? 0), 0);
  return (
    <FormSection icon="hash" title="Metrics">
      <div className="stats rs-stats">
        <Stat
          v={avg != null ? fmtN(r1(avg)) : '—'}
          l="Avg rating"
          d={avg != null ? `across ${plural(ratedBags.length, 'rated bag')}` : 'nothing rated yet'}
        />
        <Stat
          v={fmtInt(beans.length)}
          l={beans.length === 1 ? 'Bag bought' : 'Bags bought'}
          d={grams ? `${fmtInt(grams)} g in all` : undefined}
        />
        {spend > 0 && (
          <Stat v={money0(spend, cur)} l="Spent" d={`across ${plural(priced.length, 'bag')}`} />
        )}
        {spend > 0 && pricedGrams > 0 && (
          <Stat v={money((spend / pricedGrams) * 100, cur)} l="Per 100 g" d="on average" />
        )}
      </div>
    </FormSection>
  );
}
