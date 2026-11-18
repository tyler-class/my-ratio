// View choices remembered on this device: search, sort, filters and folded sections.
// Choices that make sense to bookmark or share also go in the address; the address wins.
import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router';

function read<T>(key: string): T | null {
  try {
    const v = localStorage.getItem(key);
    return v == null ? null : (JSON.parse(v) as T);
  } catch {
    return null;
  }
}

function write(key: string, v: unknown) {
  try {
    if (v == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* private mode: still applies for this visit */
  }
}

/**
 * A page's view choices, each one a string. A value in the address comes first, then the one
 * last chosen on this device, then the default. Setting one writes both; a default value
 * leaves the address and the device.
 */
export function useView<T extends Record<string, string>>(
  page: string,
  defaults: T,
): [T, (patch: Partial<T>) => void] {
  const key = `ratio-view-${page}`;
  const [params, setParams] = useSearchParams();
  const saved = read<Record<string, string>>(key) ?? {};
  const values: Record<string, string> = { ...defaults };
  for (const k of Object.keys(defaults)) {
    const v = params.get(k) ?? saved[k];
    if (typeof v === 'string') values[k] = v;
  }
  const set = (patch: Partial<T>) => {
    const next = { ...read<Record<string, string>>(key) };
    for (const [k, v] of Object.entries(patch)) {
      if (v === defaults[k] || v === undefined) delete next[k];
      else next[k] = v;
    }
    write(key, Object.keys(next).length ? next : null);
    setParams(
      (p) => {
        for (const [k, v] of Object.entries(patch)) {
          if (v === defaults[k]) p.delete(k);
          else p.set(k, v as string);
        }
        return p;
      },
      { replace: true },
    );
  };
  return [values as T, set];
}

/** Whether a folding section is open, remembered on this device. */
export function useFolded(id: string, initial = false): [boolean, () => void] {
  const key = `ratio-fold-${id}`;
  const [open, setOpen] = useState(() => read<boolean>(key) ?? initial);
  const toggle = useCallback(
    () =>
      setOpen((o) => {
        write(key, !o);
        return !o;
      }),
    [key],
  );
  return [open, toggle];
}
