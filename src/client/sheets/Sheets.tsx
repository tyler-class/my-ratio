import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useModel } from '../lib/queries';
import { BeanForm, BeanSheet, RoasterSheet } from './BeanSheets';
import { AboutSheet } from './AboutSheet';
import { BrewSheet, RateSheet } from './BrewSheet';
import { SheetCtx, type LogPrefill, type SheetApi } from './context';

type Open =
  | { type: 'log'; prefill?: LogPrefill; n: number }
  | { type: 'edit'; id: string }
  | { type: 'rate'; id: string }
  | { type: 'bean'; id: string }
  | { type: 'beanForm'; id?: string; n: number }
  | { type: 'roaster'; id?: string; n: number }
  | { type: 'about' };

/**
 * One sheet at a time, reachable from anywhere through useSheets(). Opening one from a bag's or
 * roaster's record (a brew from the bag, a bag from the roaster) remembers that record, and
 * closing goes back to it instead of all the way out. Records deleted meanwhile are skipped.
 */
export function SheetProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<Open | null>(null);
  const data = useModel();
  const current = useRef<Open | null>(null);
  const back = useRef<Open[]>([]);
  const model = useRef(data);
  useEffect(() => {
    current.current = open;
    model.current = data;
  });
  const api = useMemo<SheetApi>(() => {
    let n = 0;
    const show = (next: Open) => {
      const from = current.current;
      // From a record: come back to it. From anything else (or nothing): a fresh start.
      if (from && (from.type === 'bean' || from.type === 'roaster')) back.current.push(from);
      else if (!from) back.current = [];
      // Going back to a record by hand (a bag's edit form returns to the bag): drop it, and
      // anything after it, from the way back, so closing doesn't show it twice.
      const same = (o: Open) =>
        o.type === next.type && 'id' in o && 'id' in next && o.id === next.id;
      const at = back.current.findIndex(same);
      if (at >= 0) back.current = back.current.slice(0, at);
      current.current = next;
      setOpen(next);
    };
    const exists = (o: Open) => {
      const m = model.current?.m;
      if (!m) return false;
      if (o.type === 'bean') return m.beanMap.has(o.id);
      if (o.type === 'roaster') return !o.id || m.roasters.some((r) => r.id === o.id);
      return true;
    };
    return {
      log: (prefill) => show({ type: 'log', prefill, n: ++n }),
      editBrew: (id) => show({ type: 'edit', id }),
      rate: (id) => show({ type: 'rate', id }),
      bean: (id) => show({ type: 'bean', id }),
      beanForm: (id) => show({ type: 'beanForm', id, n: ++n }),
      roaster: (id) => show({ type: 'roaster', id, n: ++n }),
      about: () => show({ type: 'about' }),
      close: () => {
        let prev = back.current.pop() ?? null;
        while (prev && !exists(prev)) prev = back.current.pop() ?? null;
        current.current = prev;
        setOpen(prev);
      },
    };
  }, []);

  let sheet: ReactNode = open?.type === 'about' ? <AboutSheet /> : null;
  if (open && data) {
    const { m, state } = data;
    const s = state.settings;
    if (open.type === 'log')
      sheet = <BrewSheet key={'log' + open.n} m={m} s={s} prefill={open.prefill} />;
    if (open.type === 'edit')
      sheet = <BrewSheet key={'edit' + open.id} m={m} s={s} editId={open.id} />;
    if (open.type === 'rate')
      sheet = <RateSheet key={'rate' + open.id} m={m} s={s} brewId={open.id} />;
    if (open.type === 'bean')
      sheet = <BeanSheet key={'bean' + open.id} m={m} s={s} beanId={open.id} />;
    if (open.type === 'beanForm')
      sheet = <BeanForm key={'bf' + open.n} m={m} s={s} beanId={open.id} />;
    if (open.type === 'roaster')
      sheet = <RoasterSheet key={'r' + open.n} m={m} s={s} roasterId={open.id} />;
  }

  return (
    <SheetCtx.Provider value={api}>
      {children}
      {sheet}
    </SheetCtx.Provider>
  );
}
