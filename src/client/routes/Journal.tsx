import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { dayLabel } from '@shared/logic/dates';
import type { BrewView } from '@shared/logic/model';
import { useModel } from '../lib/queries';
import { BrewRow } from '../components/BrewRow';
import { FilterButton, FilterGroup, FilterSheet, PageHeader, SlideToggle } from '../components/ui';

export function Journal() {
  const data = useModel();
  const [q, setQ] = useState('');
  const [method, setMethod] = useState<string | null>(null);
  const [rated, setRated] = useState<'all' | 'rated' | 'unrated'>('all');
  const [limit, setLimit] = useState(40);
  const [open, setOpen] = useState<string | null>(null);
  const [filters, setFilters] = useState(false);
  // ?rated=unrated (the "Rate your brew" notification): show only unrated brews, then drop it
  // from the address.
  const [params, setParams] = useSearchParams();
  const ratedParam = params.get('rated');
  const [seenParam, setSeenParam] = useState<string | null>(null);
  if (ratedParam !== seenParam) {
    setSeenParam(ratedParam);
    if (ratedParam === 'unrated' || ratedParam === 'rated') setRated(ratedParam);
  }
  useEffect(() => {
    if (ratedParam)
      setParams(
        (p) => {
          p.delete('rated');
          return p;
        },
        { replace: true },
      );
  }, [ratedParam, setParams]);
  if (!data) return null;
  const { m, state } = data;
  const now = new Date();
  const ql = q.trim().toLowerCase();
  const methods = [...new Set(m.brews.map((b) => b.method).filter(Boolean) as string[])];
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
      <PageHeader title="Journal" icon="book" />
      <div className="searchrow">
        <input
          className="in search"
          type="search"
          placeholder="Search beans, roasters, notes"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <FilterButton count={active} onClick={() => setFilters(true)} />
      </div>
      <div className="sub listmeta">
        {[
          `${list.length} ${list.length === 1 ? 'brew' : 'brews'}`,
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
          onClear={() => {
            setRated('all');
            setMethod(null);
          }}
        >
          <FilterGroup title="Rating">
            <SlideToggle
              label="Rating"
              value={rated}
              options={[
                ['all', 'All'],
                ['rated', 'Rated'],
                ['unrated', 'Unrated'],
              ]}
              onChange={setRated}
            />
          </FilterGroup>
          {methods.length > 0 && (
            <FilterGroup title="Method">
              <SlideToggle
                label="Method"
                value={method}
                allowClear
                options={methods.map((o) => [o, o] as const)}
                onChange={setMethod}
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
              <BrewRow
                key={b.id}
                b={b}
                s={state.settings}
                open={open === b.id}
                onToggle={() => setOpen(open === b.id ? null : b.id)}
              />
            ))}
          </div>
        </div>
      ))}
      {list.length === 0 && <div className="empty">No brews match.</div>}
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
