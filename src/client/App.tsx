import { currencyForLocale } from '@shared/currency';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { api, ApiError, onUnauthorized } from './lib/api';
import { startPwa } from './lib/pwa';
import { keys, useActions, useAppState } from './lib/queries';
import { ToastProvider } from './components/Toast';
import { SheetProvider } from './sheets/Sheets';
import { Beans } from './routes/Beans';
import { Home } from './routes/Home';
import { Insights } from './routes/Insights';
import { Journal } from './routes/Journal';
import { Layout } from './routes/Layout';
import { Login, SetupNeeded } from './routes/Login';
import { Settings } from './routes/Settings';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (n, e) => !(e instanceof ApiError && [401, 403, 404, 503].includes(e.status)) && n < 2,
      refetchOnWindowFocus: true,
    },
  },
});

startPwa();

const router = createBrowserRouter([
  {
    element: (
      <SheetProvider>
        <Layout />
      </SheetProvider>
    ),
    children: [
      { path: '/', element: <Home /> },
      { path: '/journal', element: <Journal /> },
      { path: '/beans', element: <Beans /> },
      { path: '/insights', element: <Insights /> },
      { path: '/settings', element: <Settings /> },
      { path: '*', element: <Home /> },
    ],
  },
]);

/** Tells the server this device's time zone, so assistants speak in local dates. */
function SyncTimeZone() {
  const { data } = useAppState();
  const { saveSettings } = useActions();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  useEffect(() => {
    if (data && tz && data.settings.time_zone !== tz) void saveSettings({ time_zone: tz });
  }, [data, tz, saveSettings]);
  return null;
}

/** Until someone picks a currency, use the one this browser's language suggests (once). */
function SyncCurrency() {
  const { data } = useAppState();
  const { saveSettings } = useActions();
  const done = useRef(false);
  useEffect(() => {
    if (!data || data.settings.currency_set || done.current) return;
    done.current = true;
    void saveSettings({ currency: currencyForLocale(navigator.language) });
  }, [data, saveSettings]);
  return null;
}

function Gate() {
  const qc = useQueryClient();
  const session = useQuery({
    queryKey: keys.session,
    queryFn: () => api.get<{ ok: true }>('/session'),
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  useEffect(
    () =>
      onUnauthorized(() => {
        qc.setQueryData(keys.session, null);
        qc.invalidateQueries({ queryKey: keys.session });
      }),
    [qc],
  );
  if (session.isPending) return null;
  const err = session.error;
  if (err instanceof ApiError && err.status === 503) return <SetupNeeded message={err.message} />;
  // Offline before the session could be confirmed: show the app with cached data.
  const offline = err instanceof ApiError && err.status === 0;
  if (!offline && (err || !session.data)) return <Login />;
  return (
    <>
      {!offline && <SyncTimeZone />}
      {!offline && <SyncCurrency />}
      <RouterProvider router={router} />
    </>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <Gate />
      </ToastProvider>
    </QueryClientProvider>
  );
}
