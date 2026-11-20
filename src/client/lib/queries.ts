import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { buildModel, type Model } from '@shared/logic/model';
import type { AppState, Bean, Brew, Roaster, Settings } from '@shared/types';
import { api, errorMessage } from './api';
import { useToast } from '../components/Toast';

export const keys = { state: ['state'] as const, session: ['session'] as const };

type Kind = 'roasters' | 'beans' | 'brews';
type RowOf<K extends Kind> = K extends 'roasters' ? Roaster : K extends 'beans' ? Bean : Brew;

/**
 * Deletes waiting out their Undo: gone from the screen at once, sent to the server when the
 * toast's time is up (or when the page goes away). Undo just cancels the wait, so nothing has to
 * be rebuilt.
 */
export const UNDO_MS = 8000;
const pending = new Map<string, { kind: Kind; timer: ReturnType<typeof setTimeout> }>();

/** The state without anything waiting to be deleted (so a refetch doesn't bring it back). */
function withoutPending(s: AppState): AppState {
  if (!pending.size) return s;
  const gone = (id: string | null) => !!id && pending.has(id);
  return {
    ...s,
    roasters: s.roasters.filter((r) => !gone(r.id)),
    beans: s.beans
      .filter((b) => !gone(b.id))
      .map((b) => (gone(b.roaster_id) ? { ...b, roaster_id: null } : b)),
    // A bag's brews go with it.
    brews: s.brews.filter((b) => !gone(b.id) && !gone(b.bean_id)),
  };
}

function flushPending() {
  for (const [id, { kind, timer }] of pending) {
    clearTimeout(timer);
    // keepalive lets the request finish after the page is gone.
    void fetch(`/api/${kind}/${id}`, {
      method: 'DELETE',
      credentials: 'same-origin',
      keepalive: true,
    }).catch(() => {});
  }
  pending.clear();
}
if (typeof window !== 'undefined') window.addEventListener('pagehide', flushPending);

export function useAppState() {
  return useQuery({
    queryKey: keys.state,
    queryFn: async () => withoutPending(await api.get<AppState>('/state')),
    staleTime: 15_000,
  });
}

/** The joined view model, rebuilt only when the data changes. */
export function useModel(): { state: AppState; m: Model } | null {
  const { data } = useAppState();
  // Day boundaries matter ("today", streaks), so rebuild at least when the date changes.
  const day = new Date().toDateString();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `day` is a deliberate cache key
  return useMemo(() => (data ? { state: data, m: buildModel(data) } : null), [data, day]);
}

/**
 * Writes that patch the cached state from the server's response, so the screen updates
 * without refetching the whole log. Errors show as a toast and resolve to undefined.
 */
export function useActions() {
  const qc = useQueryClient();
  const toast = useToast();

  const edit = useCallback(
    (fn: (s: AppState) => AppState) => {
      const cur = qc.getQueryData<AppState>(keys.state);
      if (cur) qc.setQueryData(keys.state, fn(cur));
    },
    [qc],
  );

  const run = useCallback(
    async <T>(fn: () => Promise<T>): Promise<T | undefined> => {
      try {
        return await fn();
      } catch (e) {
        toast({ text: errorMessage(e), tone: 'bad' });
        return undefined;
      }
    },
    [toast],
  );

  return useMemo(() => {
    const upsert =
      <K extends Kind>(kind: K) =>
      (row: RowOf<K>) =>
        edit((s) => {
          const list = s[kind] as RowOf<K>[];
          const i = list.findIndex((r) => r.id === row.id);
          const next = i >= 0 ? list.map((r) => (r.id === row.id ? row : r)) : [row, ...list];
          return { ...s, [kind]: next };
        });
    const remove = (kind: Kind, id: string) =>
      edit((s) => ({ ...s, [kind]: (s[kind] as { id: string }[]).filter((r) => r.id !== id) }));

    function crud<K extends Kind>(kind: K) {
      return {
        create: (body: unknown) =>
          run(async () => {
            const row = await api.post<RowOf<K>>(`/${kind}`, body);
            upsert(kind)(row);
            return row;
          }),
        update: (id: string, body: unknown) =>
          run(async () => {
            const row = await api.patch<RowOf<K>>(`/${kind}/${id}`, body);
            upsert(kind)(row);
            return row;
          }),
        remove: (id: string) =>
          run(async () => {
            await api.del(`/${kind}/${id}`);
            remove(kind, id);
            // Deleting a bean removes its brews; deleting a roaster unlinks its beans.
            if (kind !== 'brews') await qc.invalidateQueries({ queryKey: keys.state });
            return true;
          }),
        /**
         * Takes it off the screen now and deletes it once Undo has had its time. Returns the
         * undo, which puts it back.
         */
        removeLater: (id: string) => {
          const timer = setTimeout(() => {
            pending.delete(id);
            void run(async () => {
              await api.del(`/${kind}/${id}`);
              return true;
            }).finally(() => qc.invalidateQueries({ queryKey: keys.state }));
          }, UNDO_MS);
          pending.set(id, { kind, timer });
          edit(withoutPending);
          return () => {
            const p = pending.get(id);
            if (!p) return;
            clearTimeout(p.timer);
            pending.delete(id);
            void qc.invalidateQueries({ queryKey: keys.state });
          };
        },
      };
    }

    return {
      run,
      refresh: () => qc.invalidateQueries({ queryKey: keys.state }),
      roasters: crud('roasters'),
      beans: crud('beans'),
      brews: crud('brews'),
      /** A bag's timeline: each call returns (and stores) the bag as it now stands. */
      timeline: {
        add: (beanId: string, body: { status: string; on_day: string }) =>
          run(async () => {
            const row = await api.post<RowOf<'beans'>>(`/beans/${beanId}/events`, body);
            upsert('beans')(row);
            return row;
          }),
        update: (eventId: string, body: { on_day?: string; status?: string }) =>
          run(async () => {
            const row = await api.patch<RowOf<'beans'>>(`/bean-events/${eventId}`, body);
            upsert('beans')(row);
            return row;
          }),
        remove: (eventId: string) =>
          run(async () => {
            const row = await api.del<RowOf<'beans'>>(`/bean-events/${eventId}`);
            upsert('beans')(row);
            return row;
          }),
      },
      saveSettings: (patch: Partial<Settings>) =>
        run(async () => {
          const settings = await api.patch<Settings>('/settings', patch);
          edit((s) => ({ ...s, settings }));
          return settings;
        }),
    };
  }, [edit, run, qc]);
}

export type Actions = ReturnType<typeof useActions>;
