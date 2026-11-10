import { useMemo, useState, type ReactNode } from 'react';
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

/** One sheet at a time, reachable from anywhere through useSheets(). */
export function SheetProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<Open | null>(null);
  const data = useModel();
  const api = useMemo<SheetApi>(() => {
    let n = 0;
    return {
      log: (prefill) => setOpen({ type: 'log', prefill, n: ++n }),
      editBrew: (id) => setOpen({ type: 'edit', id }),
      rate: (id) => setOpen({ type: 'rate', id }),
      bean: (id) => setOpen({ type: 'bean', id }),
      beanForm: (id) => setOpen({ type: 'beanForm', id, n: ++n }),
      roaster: (id) => setOpen({ type: 'roaster', id, n: ++n }),
      about: () => setOpen({ type: 'about' }),
      close: () => setOpen(null),
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
      sheet = <RoasterSheet key={'r' + open.n} m={m} roasterId={open.id} />;
  }

  return (
    <SheetCtx.Provider value={api}>
      {children}
      {sheet}
    </SheetCtx.Provider>
  );
}
