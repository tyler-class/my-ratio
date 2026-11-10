import { createContext, useContext } from 'react';

export interface LogPrefill {
  beanId?: string;
  fromBrewId?: string;
}

export interface SheetApi {
  log: (prefill?: LogPrefill) => void;
  rate: (brewId: string) => void;
  editBrew: (brewId: string) => void;
  bean: (beanId: string) => void;
  beanForm: (beanId?: string) => void;
  roaster: (roasterId?: string) => void;
  about: () => void;
  close: () => void;
}

const noop = () => {};
export const SheetCtx = createContext<SheetApi>({
  log: noop,
  rate: noop,
  editBrew: noop,
  bean: noop,
  beanForm: noop,
  roaster: noop,
  about: noop,
  close: noop,
});

export const useSheets = () => useContext(SheetCtx);
