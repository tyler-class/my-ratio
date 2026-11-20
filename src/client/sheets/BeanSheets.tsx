import { useState } from 'react';
import { STATUSES, type BeanStatus } from '@shared/lookups';
import type { Model } from '@shared/logic/model';
import type { Settings } from '@shared/types';
import { r1 } from '@shared/logic/units';
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
          <button type="button" className="btn ghost" onClick={sheets.close}>
            Cancel
          </button>
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
              onConfirm={() => {
                const undo = actions.roasters.removeLater(r.id);
                sheets.close();
                toast({ text: `Deleted ${r.name}`, action: { label: 'Undo', run: undo } });
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
        <NotesField value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
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
