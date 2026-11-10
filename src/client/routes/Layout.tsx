import { useEffect, useLayoutEffect } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router';
import { GlassTabBar, type GlassTab } from '../components/GlassTabBar';
import { Icon } from '../components/Icon';
import { useSheets } from '../sheets/context';
import { useTabSwipe } from '../lib/tabSwipe';
import { onPushOpen } from '../kit/push';

const TABS: GlassTab[] = [
  ['/', 'Home', 'home'],
  ['/journal', 'Journal', 'book'],
  ['/beans', 'Beans', 'bean'],
  ['/insights', 'Insights', 'chart'],
  ['/settings', 'Settings', 'settings'],
];

const TAB_PATHS = TABS.map(([to]) => to);

/** The tab whose page this is (swiping between tabs works there), or null elsewhere. */
function tabRoot(path: string): string | null {
  const p = path.replace(/\/+$/, '') || '/';
  return TAB_PATHS.includes(p) ? p : null;
}

function activeTab(path: string): string {
  for (const [p] of TABS.slice(1)) if (path.startsWith(p)) return p;
  return '/';
}

export function Brand() {
  return (
    <div className="brand serif">
      <span className="logo">
        <Icon name="coffee" size={21} strokeWidth={2} />
      </span>
      Ratio
    </div>
  );
}

/**
 * Phones (and the installed app): tabs in a floating glass capsule along the bottom, a floating
 * Log button, and a solid band under the status bar. 768px and up: a sidebar with the same tabs.
 */
export function Layout() {
  const { pathname } = useLocation();
  // Every change of screen, Back included, opens at the top, never at the old scroll position.
  useLayoutEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
  }, [pathname]);
  const active = activeTab(pathname);
  useTabSwipe(TAB_PATHS, tabRoot(pathname));
  const sheets = useSheets();
  const nav = useNavigate();
  // A tapped notification while Ratio is open: go to its screen in-app. (No app-icon badge.)
  useEffect(() => onPushOpen((url) => nav(url)), [nav]);
  // ?bean=<id> (a notification about a bag): open its sheet, then drop it from the address.
  const [params, setParams] = useSearchParams();
  const beanParam = params.get('bean');
  useEffect(() => {
    if (!beanParam) return;
    sheets.bean(beanParam);
    setParams(
      (p) => {
        p.delete('bean');
        return p;
      },
      { replace: true },
    );
  }, [beanParam, sheets, setParams]);
  const tab = ([to, label, icon]: GlassTab) => (
    <NavLink key={to} to={to} aria-current={active === to ? 'page' : undefined}>
      <Icon name={icon} size={20} />
      {label}
    </NavLink>
  );
  return (
    <div className="shell">
      <aside className="side">
        <Brand />
        <button type="button" className="btn primary" onClick={() => sheets.log()}>
          <Icon name="plus" size={18} /> Log a brew
        </button>
        <nav aria-label="Main">{TABS.map(tab)}</nav>
        <button type="button" className="side-about" onClick={sheets.about}>
          <Icon name="info" size={18} /> About Ratio
        </button>
      </aside>
      {/* Phones: a solid app bar at the top, like Nitrogen's. iOS blurs whatever scrolls under
          the status bar (and a little below it) in installed apps; over a plain bar it's invisible. */}
      <header className="appbar">
        <Link to="/" aria-label="Ratio home" className="appbar-home">
          <Brand />
        </Link>
      </header>
      <main className="main">
        <Outlet />
      </main>
      <button type="button" className="fab" aria-label="Log a brew" onClick={() => sheets.log()}>
        <Icon name="plus" size={28} strokeWidth={2} />
      </button>
      <GlassTabBar tabs={TABS} active={active} />
    </div>
  );
}
