// A bag's screen: its status path (the current status drawn with StatusArt), a rest card while
// it rests, and three tabs. Overview shows every detail in cards that each flip into their fields
// to edit; Timeline lists its status changes, newest first; Dial-in has the grind-vs-rating plot,
// stats and its brews.
import { grindLabel, positionOf, scaleFor } from '@shared/grind';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { BUY_AGAIN, EXTRACTION, STATUSES, type BeanStatus } from '@shared/lookups';
import { dayKey, dayLabel, daysBetween, parseDay } from '@shared/logic/dates';
import { bestCombos, type BeanView, type Model } from '@shared/logic/model';
import { restInfo, stretches, type BeanEvent } from '@shared/logic/timeline';
import { fmtInt, fmtN, fmtRatio, plural, r1, tempOut } from '@shared/logic/units';
import type { Settings } from '@shared/types';
import { altitudeNum, currencyAffix, groupDigits, money, numStr, parseNum } from '../lib/format';
import { roundMoney } from '@shared/currency';
import { useActions } from '../lib/queries';
import { STATUS_ICON } from '../lib/statusIcons';
import { useToast } from '../components/Toast';
import { BrewHistory, type HistPt } from '../components/charts';
import { Photos } from '../components/Photos';
import { Icon } from '../components/Icon';
import { StatusArt } from '../components/StatusArt';
import { DatePicker } from '../components/DateTimePicker';
import {
  ConfirmButton,
  NotesField,
  RB,
  Select,
  Sheet,
  SlideToggle,
  StatusPath,
} from '../components/ui';
import { OriginPicker, ProcessPicker, VarietyPicker, useBeanOptions } from './beanFields';
import { useSheets } from './context';
import { thenRest } from '../components/BeanCard';

const statusOpts = STATUSES.map((s) => [s.key, s.label, STATUS_ICON[s.key]] as const);
type Tab = 'overview' | 'timeline' | 'dialin';
const TABS: [Tab, string][] = [
  ['overview', 'Details'],
  ['timeline', 'Timeline'],
  ['dialin', 'Brews'],
];

/** "Nov 13", or "Nov 13, 2025" when it isn't this year. */
function shortDay(day: string): string {
  const d = parseDay(day);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}),
  });
}

/**
 * Where a bag's page was left: its tab, how far it was scrolled, and on Brews the picked brew
 * and grinder. Opening a brew from the page and closing it comes back to exactly that.
 */
interface BeanPlace {
  tab: Tab;
  scroll: number;
  sel: string | null;
  grinder: string | null;
}
const places = new Map<string, BeanPlace>();
const placeOf = (id: string): BeanPlace =>
  places.get(id) ?? { tab: 'overview', scroll: 0, sel: null, grinder: null };
const keepPlace = (id: string, p: Partial<BeanPlace>) => places.set(id, { ...placeOf(id), ...p });

export function BeanSheet({
  m,
  s,
  beanId,
  back,
}: {
  m: Model;
  s: Settings;
  beanId: string;
  /** Coming back to the page (closing a brew opened from it): restore where it was. */
  back?: boolean;
}) {
  const b = m.beanMap.get(beanId);
  const sheets = useSheets();
  const actions = useActions();
  const toast = useToast();
  // A fresh visit starts at the top of Details; coming back picks up where it was.
  const [start] = useState(() => {
    if (!back) places.delete(beanId);
    return placeOf(beanId);
  });
  const [tab, setTabState] = useState<Tab>(start.tab);
  const setTab = (t: Tab) => {
    setTabState(t);
    keepPlace(beanId, { tab: t, sel: null });
  };
  const anchor = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const body = anchor.current?.closest('.sh-body');
    if (!body) return;
    if (start.scroll) body.scrollTop = start.scroll;
    const onScroll = () => keepPlace(beanId, { scroll: body.scrollTop });
    body.addEventListener('scroll', onScroll, { passive: true });
    return () => body.removeEventListener('scroll', onScroll);
  }, [beanId, start.scroll]);
  if (!b) return null;

  const setStatus = async (k: BeanStatus | null) => {
    if (!k || k === b.status) return;
    const row = await actions.beans.update(b.id, { status: k });
    if (!row) return;
    // Undo removes the timeline entry the move made (the status follows the timeline back) and
    // puts back the dates it stamped.
    const made = row.events.find((e) => !b.events.some((x) => x.id === e.id));
    toast({
      text:
        k === 'finished'
          ? `Finished ${b.name}`
          : `${b.name} → ${STATUSES.find((x) => x.key === k)!.label}`,
      action: {
        label: 'Undo',
        run: () =>
          void (async () => {
            if (made) await actions.timeline.remove(made.id);
            await actions.beans.update(b.id, {
              received_on: b.received_on,
              thawed_on: b.thawed_on,
              finished_on: b.finished_on,
            });
          })(),
      },
    });
  };

  return (
    <Sheet
      full
      title={b.name}
      sub={<BeanSub b={b} m={m} />}
      onClose={sheets.close}
      footer={
        <>
          <ConfirmButton
            className="left"
            ask={`Delete ${b.name}?`}
            detail={b.brews.length ? 'Brews on this bean get deleted too' : undefined}
            onConfirm={() => {
              const undo = actions.beans.removeLater(b.id);
              sheets.close();
              toast({ text: `Deleted ${b.name}`, action: { label: 'Undo', run: undo } });
            }}
          >
            Delete
          </ConfirmButton>
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
      <div ref={anchor} hidden />
      <div className="bv-status">
        <StatusPath
          label="Status"
          value={b.status}
          options={statusOpts}
          onChange={setStatus}
          art={(v, blob) => <StatusArt status={v} blob={blob} />}
        />
        {/* While drinking: a thin line under the step, filling as the bag is brewed through.
            It sits in the gap below the steps, so it never changes the height. */}
        {b.status === 'drinking' && b.bag_g ? (
          <div
            className="bv-used"
            role="progressbar"
            aria-label="Brewed so far"
            aria-valuemin={0}
            aria-valuemax={b.bag_g}
            aria-valuenow={Math.min(b.bag_g, Math.round(b.used))}
            style={{
              left: `${((statusOpts.findIndex(([k]) => k === 'drinking') + 0.5) / statusOpts.length) * 100}%`,
            }}
          >
            <i style={{ width: `${Math.min(100, (b.used / b.bag_g) * 100)}%` }} />
          </div>
        ) : null}
        {/* In the freezer: the rest still to come once it's out, in the gap under the Freezing
            step (like the drinking line), so it never changes the height. */}
        {thenRest(b) && (
          <span
            className="bv-then"
            style={{
              left: `${((statusOpts.findIndex(([k]) => k === 'freezing') + 0.5) / statusOpts.length) * 100}%`,
            }}
          >
            {thenRest(b)}
          </span>
        )}
      </div>
      {b.status === 'resting' && <RestCard b={b} />}
      {b.status === 'finished' && (
        <div className="buy-again">
          <span className="lbl">Would you buy it again?</span>
          <SlideToggle
            label="Would you buy it again?"
            value={b.buy_again}
            allowClear
            options={BUY_AGAIN.map((o) => [o.key, o.label, o.tone] as const)}
            onChange={(buy_again) => actions.beans.update(b.id, { buy_again })}
          />
        </div>
      )}
      <div className="bv-tabs" role="tablist" aria-label="Bag">
        {TABS.map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            className={tab === k ? 'on' : undefined}
            onClick={() => setTab(k)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'overview' && <Overview b={b} m={m} s={s} />}
      {tab === 'timeline' && <Timeline b={b} />}
      {tab === 'dialin' && <DialIn b={b} s={s} place={start} />}
    </Sheet>
  );
}

/** Under the name: the roaster, and on the right a small cloud of its origin, process, variety. */
function BeanSub({ b, m }: { b: BeanView; m: Model }) {
  const marks = b.origins.map(m.mark).join('');
  const pills = [...b.origins, ...(b.process ? [b.process] : []), ...b.varieties];
  return (
    <span className="bv-sub">
      <span className="bv-roaster">
        {marks && <span className="bv-flags">{marks}</span>}
        {b.roasterName || 'No roaster'}
      </span>
      {pills.length > 0 && (
        <span className="bv-pills">
          {pills.map((p) => (
            <span className="bv-pill" key={p}>
              {p}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

/**
 * While resting: with a recommended rest, a ring counting toward it and the day it's ready; with
 * none, how many days it has been resting. The recommended rest can be set or cleared right here,
 * and the card follows.
 */
function RestCard({ b }: { b: BeanView }) {
  const actions = useActions();
  const [editing, setEditing] = useState(false);
  const [days, setDays] = useState('');
  const today = dayKey(new Date());
  const r = restInfo(b, b.events, today, b.brews.length ? dayKey(b.brews.at(-1)!.date) : null);
  if (!r) return null;
  const open = () => {
    setDays(b.rest_days != null ? String(b.rest_days) : '');
    setEditing(true);
  };
  const save = async () => {
    const n = days.trim() ? Math.max(0, Math.min(365, Math.round(Number(days)))) : null;
    if (n !== b.rest_days) await actions.beans.update(b.id, { rest_days: n });
    setEditing(false);
  };
  const editor = editing && (
    <div className="rest-edit">
      <label className="lbl" htmlFor={`rest-${b.id}`}>
        Recommended rest (days)
      </label>
      <div className="flexrow" style={{ gap: 8 }}>
        <input
          id={`rest-${b.id}`}
          className="in"
          inputMode="numeric"
          autoFocus
          value={days}
          style={{ maxWidth: 120 }}
          onChange={(e) => setDays(e.target.value.replace(/[^\d]/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && void save()}
        />
        <button type="button" className="btn sm" onClick={() => void save()}>
          Save
        </button>
        <button type="button" className="btn sm ghost" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
    </div>
  );

  if (r.mode === 'count')
    return (
      <div className="rest-card">
        <div className="rest-count" aria-hidden="true">
          <b>{r.rested}</b>
          <span>{r.rested === 1 ? 'day' : 'days'}</span>
        </div>
        <div className="rest-t">
          <div className="rest-t1">Rested {plural(r.rested, 'day')}</div>
          <div className="rest-t2">{restBasis(r)}</div>
          {!editing && (
            <button type="button" className="rest-link" onClick={open}>
              Add a recommended rest
            </button>
          )}
          {editor}
        </div>
      </div>
    );

  const R = 26;
  const C = 2 * Math.PI * R;
  const pct = Math.min(1, r.rested / Math.max(1, r.restDays!));
  return (
    <div className={`rest-card${r.ready ? ' ready' : ''}`}>
      <svg className="rest-ring" viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r={R} className="track" />
        <circle
          cx="32"
          cy="32"
          r={R}
          className="prog"
          strokeDasharray={`${C * pct} ${C}`}
          transform="rotate(-90 32 32)"
        />
        <text x="32" y="31" textAnchor="middle" className="n">
          {r.rested}
        </text>
        <text x="32" y="43" textAnchor="middle" className="of">
          of {r.restDays} d
        </text>
      </svg>
      <div className="rest-t">
        <div className="rest-t1">
          {r.ready ? 'Ready to brew' : `Ready in ${plural(r.left, 'day')}`}
        </div>
        <div className="rest-t2">
          {r.ready ? `Ready since ${shortDay(r.readyDay!)}` : `Ready ${shortDay(r.readyDay!)}`}
          {r.restingSince ? ` · resting since ${shortDay(r.restingSince)}` : ''}
        </div>
        <div className="rest-t3">{restBasis(r)}</div>
        {!editing && (
          <button type="button" className="rest-link" onClick={open}>
            Recommended rest: {plural(r.restDays!, 'day')}
          </button>
        )}
        {editor}
      </div>
    </div>
  );
}

/**
 * How many days the bag has rested so far, read-only: the same clock as the rest card (from the
 * roast date, less freezer days; it stops at the first brew).
 */
function RestedDays({ b }: { b: BeanView }) {
  const today = dayKey(new Date());
  const first = b.brews.length ? dayKey(b.brews.at(-1)!.date) : null;
  const r = restInfo(b, b.events, today, first);
  if (!r) return <Field1 label="Rested days" value="—" unset />;
  const sub = r.frozen ? `Less ${plural(r.frozen, 'day')} frozen` : undefined;
  return <Field1 label="Rested days" value={plural(r.rested, 'day')} sub={sub} />;
}

/** How the rest clock counted: every day out of the freezer. */
function restBasis(r: { from: 'roast' | 'timeline'; frozen: number }): string {
  const less = r.frozen ? `, less ${plural(r.frozen, 'day')} in the freezer` : '';
  return r.from === 'roast'
    ? `Every day since the roast date${less}`
    : `Every day it wasn’t on order or in the freezer (no roast date)`;
}

/**
 * One detail of a bag, with a pencil. Tap the pencil (or the value) to edit just that value in
 * place, in the same type: text saves on Enter or when you leave it (Escape cancels); dates,
 * lists and chips save as you pick, with Done to close.
 */
function Field1({
  label,
  value,
  sub,
  unset,
  editor,
  long,
}: {
  label: string;
  value: ReactNode;
  /** A second, quieter fact under the value ("23 days ago" under the roast date). */
  sub?: ReactNode;
  /** A long text (a description): left-aligned, filling the space after the label. */
  long?: boolean;
  /** No value yet: a faint em dash beside the pencil. */
  unset?: boolean;
  /** The editor, given a way to close itself; none for a read-only line. */
  editor?: (done: () => void) => ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const done = () => setEditing(false);
  const shown = sub ? (
    <>
      {value}
      <span className="bv-sub">{sub}</span>
    </>
  ) : (
    value
  );
  return (
    // An empty long field sits by its pencil like any other until it's being written in.
    <div
      className={`bv-row${editing ? ' editing' : ''}${long && (!unset || editing) ? ' long' : ''}`}
    >
      <span className="bv-l">{label}</span>
      {editing && editor ? (
        <span className="bv-ed">{editor(done)}</span>
      ) : (
        <span className="bv-vw">
          {editor ? (
            <button
              type="button"
              className={`bv-v${unset ? ' unset' : ''}`}
              onClick={() => setEditing(true)}
            >
              {shown}
            </button>
          ) : (
            <span className={`bv-v${unset ? ' unset' : ''}`}>{shown}</span>
          )}
          {editor && (
            <button
              type="button"
              className="bv-pen"
              aria-label={`Edit ${label.toLowerCase()}`}
              onClick={() => setEditing(true)}
            >
              <Icon name="edit" size={14} />
            </button>
          )}
        </span>
      )}
    </div>
  );
}

/** Text (or a number) edited in place, in the value's own type. */
function InlineText({
  value,
  onSave,
  done,
  multiline,
  numeric,
  placeholder,
  prefix,
  suffix,
}: {
  value: string;
  onSave: (v: string) => unknown;
  done: () => void;
  multiline?: boolean;
  numeric?: boolean;
  placeholder?: string;
  /** A unit shown before or after the number while editing ($, g, days). */
  prefix?: string;
  suffix?: string;
}) {
  const [v, setV] = useState(value);
  const left = useRef(false);
  const save = () => {
    if (left.current) return;
    left.current = true;
    if (v !== value) void onSave(v);
    done();
  };
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      // Cancel just this edit: don't let the sheet close too.
      e.nativeEvent.stopPropagation();
      left.current = true;
      done();
    } else if (e.key === 'Enter' && (!multiline || e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      save();
    }
  };
  return multiline ? (
    <NotesField
      className="bv-in multi"
      autoFocus
      value={v}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={keys}
      onBlur={save}
    />
  ) : (
    <span className="bv-in-wrap">
      {prefix && <span className="bv-unit">{prefix}</span>}
      <input
        className="bv-in"
        autoFocus
        value={v}
        inputMode={numeric ? 'decimal' : undefined}
        size={Math.max(2, (v || placeholder || '').length + 1)}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={keys}
        onBlur={save}
      />
      {suffix && <span className="bv-unit">{suffix}</span>}
    </span>
  );
}

/** "Today", "Yesterday", "23 days ago": spelled out, under a date. */
const daysAgo = (n: number) => (n <= 0 ? 'Today' : n === 1 ? 'Yesterday' : `${n} days ago`);

function Overview({ b, m, s }: { b: BeanView; m: Model; s: Settings }) {
  const actions = useActions();
  const o = useBeanOptions(m);
  const [notes, setNotes] = useState(b.notes ?? '');
  const now = new Date();
  // Brews left: what's in the bag over the dose you use for it (its last few brews), else your
  // usual dose lately.
  const ownDoses = b.brews
    .slice(0, 5)
    .map((x) => x.dose_g)
    .filter((d): d is number => !!d);
  const dose = ownDoses.length ? ownDoses.reduce((t, d) => t + d, 0) / ownDoses.length : m.dose7d;
  const brewsLeft = b.remaining != null ? Math.floor(b.remaining / dose) : null;
  const save = (body: Record<string, unknown>) => actions.beans.update(b.id, body);
  const text = (
    key: keyof BeanView & string,
    opts: { multiline?: boolean; numeric?: boolean; placeholder?: string } = {},
  ) => {
    const cur = b[key];
    return (done: () => void) => (
      <InlineText
        {...opts}
        value={cur == null ? '' : String(cur)}
        done={done}
        onSave={(v) => save({ [key]: v.trim() })}
      />
    );
  };
  const show = (v: string | null | undefined, empty = '—') =>
    v && v.trim() ? { value: v } : { value: empty, unset: true };
  const altitude = altitudeNum(b.altitude);
  return (
    <>
      <section className="form-sec bv-card">
        <h3>
          <Icon name="coffee" size={17} />
          The coffee
        </h3>
        <Field1 label="Name" value={b.name} editor={text('name')} />
        <Field1
          label="Roaster"
          {...show(b.roasterName)}
          editor={(close) => <RoasterPick b={b} m={m} done={close} />}
        />
        <Field1
          label="Tasting notes"
          long
          {...show(b.tasting_notes)}
          editor={text('tasting_notes', {
            multiline: true,
          })}
        />
        <Field1
          label="Description"
          long
          {...show(b.roaster_notes)}
          editor={text('roaster_notes', { multiline: true })}
        />
      </section>

      <section className="form-sec bv-card">
        <h3>
          <Icon name="bag" size={17} />
          The bag
        </h3>
        <Field1
          label="Remaining"
          value={
            b.remaining != null
              ? `${fmtInt(b.remaining)} g of ${fmtN(b.bag_g)} g`
              : `${fmtInt(b.used)} g used`
          }
          sub={
            b.remaining != null && brewsLeft != null
              ? `About ${plural(brewsLeft, 'brew')} left`
              : undefined
          }
        />
        <Field1
          label="Bag size"
          {...(b.bag_g != null ? { value: `${fmtN(b.bag_g)} g` } : { value: '—', unset: true })}
          editor={(close) => (
            <InlineText
              numeric
              suffix="g"
              value={numStr(b.bag_g)}
              done={close}
              onSave={(v) => save({ bag_g: parseNum(v) })}
            />
          )}
        />
        <Field1
          label="Cost"
          {...(b.cost != null
            ? {
                value: money(b.cost, s.currency),
                sub: b.perG ? `${money(b.perG * 100, s.currency)} per 100 g` : undefined,
              }
            : { value: '—', unset: true })}
          editor={(close) => (
            <InlineText
              numeric
              {...currencyAffix(s.currency)}
              value={b.cost != null ? String(b.cost) : ''}
              done={close}
              onSave={(v) =>
                save({
                  cost: parseNum(v) == null ? null : roundMoney(parseNum(v)!, s.currency),
                })
              }
            />
          )}
        />
        <Field1
          label="Roast date"
          {...(b.roasted_on
            ? {
                value: shortDay(b.roasted_on),
                sub: daysAgo(daysBetween(parseDay(b.roasted_on), now)),
              }
            : { value: '—', unset: true })}
          editor={(close) => (
            <DatePicker
              allowNone
              startOpen
              label="Roast date"
              value={b.roasted_on ?? ''}
              onClose={close}
              onChange={(v) => void save({ roasted_on: v || null })}
            />
          )}
        />
        <Field1
          label="Recommended rest"
          {...(b.rest_days != null
            ? { value: plural(b.rest_days, 'day') }
            : { value: '—', unset: true })}
          editor={(close) => (
            <InlineText
              numeric
              suffix="days"
              value={b.rest_days != null ? String(b.rest_days) : ''}
              done={close}
              onSave={(v) => {
                const n = parseNum(v);
                return save({
                  rest_days: n == null ? null : Math.max(0, Math.min(365, Math.round(n))),
                });
              }}
            />
          )}
        />
        <RestedDays b={b} />
      </section>

      <section className="form-sec bv-card">
        <h3>
          <Icon name="map" size={17} />
          Origin
        </h3>
        <Field1
          label="Origin"
          {...show(b.origins.map((x) => `${m.mark(x)} ${x}`.trim()).join(', '))}
          editor={(close) => (
            <LiveMulti
              initial={b.origins}
              onSave={(origins) => save({ origins })}
              render={(v, set) => (
                <OriginPicker startOpen value={v} onChange={set} o={o} onClose={close} />
              )}
            />
          )}
        />
        <Field1 label="Region / farm" {...show(b.region)} editor={text('region')} />
        <Field1
          label="Altitude (MASL)"
          {...show(altitude ? groupDigits(altitude) : null)}
          editor={(close) => (
            <InlineText
              numeric
              value={altitude}
              done={close}
              onSave={(v) => save({ altitude: v.trim() })}
            />
          )}
        />
        <Field1
          label="Variety"
          {...show(b.varieties.join(', '))}
          editor={(close) => (
            <LiveMulti
              initial={b.varieties}
              onSave={(varieties) => save({ varieties })}
              render={(v, set) => (
                <VarietyPicker startOpen value={v} onChange={set} o={o} onClose={close} />
              )}
            />
          )}
        />
      </section>

      <section className="form-sec bv-card">
        <h3>
          <Icon name="drop" size={17} />
          Process
        </h3>
        <Field1
          label="Process"
          {...show(b.process)}
          editor={(close) => (
            <ProcessPicker
              startOpen
              value={b.process ?? ''}
              o={o}
              onClose={close}
              onChange={(process) => {
                void save({ process });
                close();
              }}
            />
          )}
        />
        <Field1
          label="Process notes"
          long
          {...show(b.process_notes)}
          editor={text('process_notes', { multiline: true })}
        />
      </section>

      <section className="form-sec bv-card">
        <h3>
          <Icon name="note" size={17} />
          Comments
        </h3>
        <NotesField
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== (b.notes ?? '') && actions.beans.update(b.id, { notes })}
        />
      </section>
      <section className="form-sec bv-card">
        <h3>
          <Icon name="camera" size={17} />
          Photos
        </h3>
        <Photos owner="beans" ownerId={b.id} images={b.images} />
      </section>
    </>
  );
}

/** A multi-pick edited in place (origins, varieties): each pick is saved as it's made. */
function LiveMulti({
  initial,
  onSave,
  render,
}: {
  initial: string[];
  onSave: (v: string[]) => unknown;
  render: (v: string[], set: (v: string[]) => void) => ReactNode;
}) {
  const [v, setV] = useState(initial);
  return render(v, (next) => {
    setV(next);
    void onSave(next);
  });
}

/** The roaster, picked from the list (or a new one typed in), saved as soon as it's chosen. */
function RoasterPick({ b, m, done }: { b: BeanView; m: Model; done: () => void }) {
  const actions = useActions();
  const [adding, setAdding] = useState(false);
  // Picking "+ New roaster" closes the list too: don't treat that as leaving the field.
  const toNew = useRef(false);
  if (adding)
    return (
      <InlineText
        value=""
        done={done}
        onSave={async (name) => {
          if (!name.trim()) return;
          const r = await actions.roasters.create({ name: name.trim() });
          if (r) await actions.beans.update(b.id, { roaster_id: r.id });
        }}
      />
    );
  return (
    <Select
      startOpen
      onClose={() => !toNew.current && done()}
      value={b.roaster_id ?? ''}
      onChange={(v) => {
        if (v === '__new') {
          toNew.current = true;
          return setAdding(true);
        }
        void actions.beans.update(b.id, { roaster_id: v || null });
        done();
      }}
      groups={[
        { options: m.roasters.map((r) => ({ value: r.id, label: r.name })) },
        { options: [{ value: '__new', label: '+ New roaster' }] },
      ]}
    />
  );
}

/** How long a status lasted, said plainly: "On order for 8 days, until Nov 11". */
function stretchLine(status: BeanStatus, days: number, to: string | null): string | null {
  const until = to ? `, until ${shortDay(to)}` : ' so far';
  const n = plural(days, 'day');
  switch (status) {
    case 'ordered':
      return `On order for ${n}${until}`;
    case 'freezing':
      return days ? `Frozen for ${n}` : 'Frozen starting today';
    case 'resting':
      if (to) return `Rested for ${n}${until}`;
      return days ? `Resting for ${n} so far` : 'Resting started today';
    case 'drinking':
      if (to) return `Drank for ${n}${until}`;
      return days ? `Drinking for ${n} so far` : 'Drinking started today';
    default:
      return null;
  }
}

const EVENT_TITLE: Record<BeanStatus, string> = {
  ordered: 'Ordered',
  freezing: 'Freezing',
  resting: 'Resting',
  drinking: 'Drinking',
  finished: 'Finished',
};

/** The timeline, newest first: four entries, then Show more. */
function Timeline({ b }: { b: BeanView }) {
  const actions = useActions();
  const sheets = useSheets();
  const [all, setAll] = useState(false);
  const today = dayKey(new Date());
  const st = stretches(b.events, today);
  const firstBrew = b.brews.length ? dayKey(b.brews.at(-1)!.date) : null;
  type Item =
    | { kind: 'event'; e: BeanEvent; prev?: BeanStatus; to: string | null; days: number }
    | { kind: 'brew'; day: string }
    | { kind: 'roast'; day: string };
  const items: Item[] = st.map((x, i) => ({
    kind: 'event' as const,
    e: x.event,
    prev: st[i - 1]?.status,
    to: x.to,
    days: x.days,
  }));
  // The roast day and the first brew go in after the changes up to their day; then newest
  // first, keeping the order of changes made on the same day.
  const place = (it: Item & { day: string }) => {
    const at = items.findIndex((x) => (x.kind === 'event' ? x.e.on_day : x.day) > it.day);
    items.splice(at < 0 ? items.length : at, 0, it);
  };
  if (b.roasted_on) place({ kind: 'roast', day: b.roasted_on });
  if (firstBrew) place({ kind: 'brew', day: firstBrew });
  items.reverse();
  const shown = all ? items : items.slice(0, 4);

  return (
    <>
      <ol className="tl">
        {shown.map((it) => {
          if (it.kind === 'roast')
            return (
              <li className="tl-ev roast" key="roast">
                <span className="tl-dot">
                  <Icon name="flame" size={19} />
                </span>
                <div className="tl-b">
                  <div className="tl-t">
                    <b>Roasted</b>
                    <span className="tl-day">
                      <DatePicker
                        label="Roasted on"
                        value={it.day}
                        onChange={(v) => v && actions.beans.update(b.id, { roasted_on: v })}
                      />
                    </span>
                  </div>
                </div>
              </li>
            );
          if (it.kind === 'brew') {
            const fb = b.brews.at(-1)!;
            return (
              <li className="tl-ev brew" key="brew">
                <span className="tl-dot">
                  <Icon name="dripper" size={19} />
                </span>
                <div className="tl-b">
                  <div className="tl-t">
                    <b>First brew</b>
                    <span className="tl-day">{shortDay(it.day)}</span>
                  </div>
                  <div className="tl-s">
                    <button
                      type="button"
                      className="tl-link"
                      onClick={() => sheets.editBrew(fb.id)}
                    >
                      Brew #{fb.num}
                    </button>
                    {fb.rating != null && ` · rated ${fmtN(fb.rating)}`}
                  </div>
                </div>
              </li>
            );
          }
          const title =
            it.e.status === 'resting' && it.prev === 'freezing'
              ? 'Thawed and resting'
              : EVENT_TITLE[it.e.status];
          const sub = stretchLine(it.e.status, it.days, it.to);
          return (
            <li className={`tl-ev s-${it.e.status}`} key={it.e.id}>
              <span className="tl-dot">
                <Icon name={STATUS_ICON[it.e.status]} size={19} />
              </span>
              <div className="tl-b">
                <div className="tl-t">
                  <b>{title}</b>
                  <span className="tl-day">
                    <DatePicker
                      label={`${title} on`}
                      value={it.e.on_day}
                      onChange={(v) => v && actions.timeline.update(it.e.id, { on_day: v })}
                    />
                  </span>
                </div>
                {sub && <div className="tl-s">{sub}</div>}
                {b.events.length > 1 && (
                  <ConfirmButton
                    className="tl-rm"
                    confirm="Tap again to remove"
                    onConfirm={() => void actions.timeline.remove(it.e.id)}
                  >
                    Remove
                  </ConfirmButton>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {items.length > 4 && (
        <button type="button" className="tl-more" onClick={() => setAll((x) => !x)}>
          {all ? 'Hide' : `Show more (${items.length - 4})`}
        </button>
      )}
    </>
  );
}

function DialIn({ b, s, place }: { b: BeanView; s: Settings; place: BeanPlace }) {
  const sheets = useSheets();
  const now = new Date();
  // Grind settings only compare on one grinder: with several, a switch picks which shows (the
  // best recipe's to start); the other grinders' brews fade. Best Combination looks across all.
  const setupOf = (x: { grinder: string | null }) => x.grinder ?? '';
  const setups = [...new Set(b.brews.map(setupOf))];
  const setupLabel = (k: string) => k || 'No grinder';
  const [chosen, setChosenState] = useState<string | null>(place.grinder);
  const setChosen = (k: string) => {
    setChosenState(k);
    keepPlace(b.id, { grinder: k });
  };
  const combos = bestCombos(b, s.grind_scales);
  const setup =
    chosen != null && setups.includes(chosen)
      ? chosen
      : combos[0]
        ? setupOf(combos[0])
        : (setups[0] ?? '');
  const grinder = setup || null;
  const tempLabel = (c: number | null) =>
    // Whole degrees: a tenth of a degree is noise here.
    c == null ? null : `${Math.round(tempOut(c, s.temp_unit)!)}°${s.temp_unit}`;
  const scale = scaleFor(grinder, s.grind_scales);
  const grindNames = new Map<number, string>();
  const pts: HistPt[] = b.brews.map((x) => {
    const g = x.grind != null && setupOf(x) === setup ? positionOf(x.grind, scale) : null;
    const label = grindLabel(x, s.grind_scales);
    if (g != null && label) grindNames.set(g, label);
    return {
      id: x.id,
      num: x.num,
      t: x.date.getTime(),
      rating: x.rating,
      grind: g,
      grindLabel: label,
      ratio: x.ratio,
      temp: tempLabel(x.water_temp_c),
      grinder: x.grinder,
      method: x.method,
    };
  });
  // The grind and ratio that rated best together (ties all listed), starred in the chart.
  const marked = new Set(combos.flatMap((c) => c.ids));
  const faded = new Set(
    setups.length > 1 ? b.brews.filter((x) => setupOf(x) !== setup).map((x) => x.id) : [],
  );
  return (
    <>
      <section className="form-sec bv-card">
        <h3>
          <Icon name="target" size={17} />
          Brew history
        </h3>
        {b.brews.length >= 2 ? (
          <>
            {setups.length > 1 && (
              <div className="hist-grinders">
                <SlideToggle
                  label="Grinder"
                  className="fit"
                  value={setup}
                  options={setups.map((k) => [k, setupLabel(k)] as const)}
                  onChange={setChosen}
                />
              </div>
            )}
            <BrewHistory
              pts={pts}
              faded={faded}
              grindFmt={(v) => grindNames.get(v) ?? fmtN(r1(v))}
              onOpen={(id) => sheets.editBrew(id)}
              initialSel={place.sel}
              onSelect={(sel) => keepPlace(b.id, { sel })}
              marked={marked}
            />
            {combos.length > 0 && (
              <div className="combo-list">
                {combos.map((c) => (
                  <div className="combo" key={`${c.grind}|${c.ratio}`}>
                    <div className="combo-top">
                      <div className="combo-h">
                        <Icon name="star" size={18} />
                        {combos.length > 1 ? 'Best Combination (a tie)' : 'Best Combination'}
                      </div>
                      {/* Only for a bag you can brew now: resting or drinking. */}
                      {(b.status === 'resting' || b.status === 'drinking') && (
                        <button
                          type="button"
                          className="btn sm"
                          onClick={() => sheets.log({ fromBrewId: c.bestId })}
                        >
                          Brew this
                        </button>
                      )}
                    </div>
                    {(c.method || c.grinder) && (
                      <div className="combo-g">
                        {[c.method, c.grinder].filter(Boolean).join(' · ')}
                      </div>
                    )}
                    <div className="combo-v">
                      <div>
                        <span className="lbl">Grind</span>
                        <b>{c.grind}</b>
                      </div>
                      <div>
                        <span className="lbl">Ratio</span>
                        <b>{fmtRatio(c.ratio)}</b>
                      </div>
                      <div>
                        <span className="lbl">Temp</span>
                        <b>{tempLabel(c.temp_c) ?? '–'}</b>
                      </div>
                      <div>
                        <span className="lbl">Avg rating</span>
                        <b>{fmtN(r1(c.avg))}</b>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="hint">
            Log two brews of this bag to see how rating, grind and ratio change over time.
          </p>
        )}
      </section>
      {b.brews.length > 0 && (
        <section className="form-sec bv-card">
          <h3>
            <Icon name="dripper" size={17} />
            Brews
          </h3>
          {b.brews.slice(0, 8).map((x) => (
            <div className="ri" key={x.id}>
              <button type="button" className="rm" onClick={() => sheets.editBrew(x.id)}>
                <RB v={x.rating} />
                <div className="mid">
                  <div className="t1">
                    {dayLabel(x.date, now)}
                    <span> · #{x.num}</span>
                  </div>
                  <div className="t2">
                    {fmtN(x.dose_g)} g → {x.water_ml != null ? fmtInt(x.water_ml) : '–'} mL · grind{' '}
                    {grindLabel(x, s.grind_scales) ?? '–'}
                    {x.extraction
                      ? ' · ' + EXTRACTION.find((e) => e.key === x.extraction)?.label
                      : ''}
                  </div>
                </div>
              </button>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
