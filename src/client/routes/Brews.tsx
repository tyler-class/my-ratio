import { useState } from 'react';
import { dayLabel } from '@shared/logic/dates';
import type { BrewView } from '@shared/logic/model';
import { useModel } from '../lib/queries';
import { useView } from '../lib/view';
import { BrewRow } from '../components/BrewRow';
import { Icon } from '../components/Icon';
import { useSheets } from '../sheets/context';
import { plural } from '@shared/logic/units';
import {
  Empty,
  FilterButton,
  FilterGroup,
  FilterSheet,
  PageHeader,
  SlideToggle,
} from '../components/ui';

const RATED = [
  ['all', 'All', () => true],
  ['rated', 'Rated', (b: BrewView) => b.rating != null],
  ['unrated', 'Unrated', (b: BrewView) => b.rating == null],
] as const;

// Search and filters are remembered on this device and kept in the address, so the "Rate your
// brew" notification can open /brews?rated=unrated.
const VIEW = { q: '', rated: 'all', method: '' };

export function Brews() {
  const data = useModel();
  const sheets = useSheets();
  const [vw, setView] = useView('journal', VIEW); // (stored under its old name, so remembered filters carry over)
  const [limit, setLimit] = useState(40);
  const [filters, setFilters] = useState(false);
  if (!data) return null;
  const { m, state } = data;
  const now = new Date();
  const q = vw.q;
  const ql = q.trim().toLowerCase();
  const methods = [...new Set(m.brews.map((b) => b.method).filter(Boolean) as string[])];
  const rated = RATED.find(([k]) => k === vw.rated)?.[0] ?? 'all';
  const method = methods.includes(vw.method) ? vw.method : null;
  const list = m.brews.filter((b) => {
    if (method && b.method !== method) return false;
    if (rated === 'rated' && b.rating == null) return false;
    if (rated === 'unrated' && b.rating != null) return false;
    if (
      ql &&
      !`#${b.num} ${b.beanName} ${b.roasterName} ${b.recipe_notes ?? ''} ${b.tasting_notes ?? ''} ${b.next_time ?? ''}`
        .toLowerCase()
        .includes(ql)
    )
      return false;
    return true;
  });
  const active = (rated !== 'all' ? 1 : 0) + (method ? 1 : 0);
  const groups: { key: string; date: Date; items: BrewView[] }[] = [];
  for (const b of list.slice(0, limit)) {
    const g = groups[groups.length - 1];
    if (g && g.key === b.key) g.items.push(b);
    else groups.push({ key: b.key, date: b.date, items: [b] });
  }
  return (
    <div>
      {/* Logging: at the right of the header row on phones; wider, at the end of the search row. */}
      <PageHeader
        title="Brews"
        icon="book"
        action={
          <button
            type="button"
            className="btn primary sm add-btn add-top"
            onClick={() => sheets.log()}
          >
            <Icon name="plus" size={16} /> Log a brew
          </button>
        }
      />
      <div className="searchrow">
        <input
          className="in search"
          type="search"
          aria-label="Search"
          placeholder="Search beans, roasters, notes"
          value={q}
          onChange={(e) => setView({ q: e.target.value })}
        />
        <FilterButton count={active} onClick={() => setFilters(true)} />
        <button
          type="button"
          className="btn primary sm add-btn add-row"
          onClick={() => sheets.log()}
        >
          <Icon name="plus" size={16} /> Log a brew
        </button>
      </div>
      <div className="sub listmeta">
        {[
          plural(list.length, 'brew'),
          rated !== 'all' && (rated === 'rated' ? 'Rated' : 'Unrated'),
          method,
        ]
          .filter(Boolean)
          .join(' · ')}
      </div>
      {filters && (
        <FilterSheet
          count={active}
          onClose={() => setFilters(false)}
          onClear={() => setView({ rated: 'all', method: '' })}
        >
          <FilterGroup title="Rating">
            <SlideToggle
              label="Rating"
              value={rated}
              options={RATED.map(([k, label, f]) => [
                k,
                <>
                  {label} <span className="n">{m.brews.filter(f).length}</span>
                </>,
              ])}
              onChange={(rated) => setView({ rated })}
            />
          </FilterGroup>
          {methods.length > 0 && (
            <FilterGroup title="Method">
              <SlideToggle
                label="Method"
                value={method}
                allowClear
                options={methods.map((o) => [
                  o,
                  <>
                    {o} <span className="n">{m.brews.filter((b) => b.method === o).length}</span>
                  </>,
                ])}
                onChange={(o) => setView({ method: o ?? '' })}
              />
            </FilterGroup>
          )}
        </FilterSheet>
      )}
      {groups.map((g) => (
        <div key={g.key}>
          <div className="dayh">
            {dayLabel(g.date, now)} · {g.items.length}
          </div>
          <div className="card flat" style={{ padding: '4px 16px' }}>
            {g.items.map((b) => (
              <BrewRow key={b.id} b={b} s={state.settings} />
            ))}
          </div>
        </div>
      ))}
      {list.length === 0 &&
        (m.brews.length ? (
          <Empty icon="search" title="No brews match">
            Try another search or filter.
          </Empty>
        ) : (
          <Empty icon="book" title="No brews yet">
            Brews you log show up here, newest first.
          </Empty>
        ))}
      {list.length > limit && (
        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <button type="button" className="btn" onClick={() => setLimit(limit + 40)}>
            Show more
          </button>
        </div>
      )}
    </div>
  );
}
