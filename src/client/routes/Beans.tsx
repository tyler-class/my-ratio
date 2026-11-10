import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { statusOf } from '@shared/lookups';
import { r1 } from '@shared/logic/units';
import type { BeanView } from '@shared/logic/model';
import { useModel } from '../lib/queries';
import { BeanCard } from '../components/BeanCard';
import { Icon } from '../components/Icon';
import { Thumb } from '../components/Photos';
import {
  FilterButton,
  FilterGroup,
  FilterSheet,
  PageHeader,
  RB,
  Select,
  SlideToggle,
} from '../components/ui';
import { useSheets } from '../sheets/context';

const FILTERS: { k: string; label: string; name: string; f: (b: BeanView) => boolean }[] = [
  ...(['ordered', 'resting', 'freezing', 'drinking', 'finished'] as const).map((k) => {
    const st = statusOf(k)!;
    return {
      k,
      label: `${st.icon} ${st.label}`,
      name: st.label,
      f: (b: BeanView) => b.status === k,
    };
  }),
  { k: 'all', label: 'All', name: 'All', f: () => true },
];

const SORTS = [
  ['recent', 'Recent'],
  ['rating', 'Top rated'],
  ['name', 'A–Z'],
  ['brews', 'Most brewed'],
] as const;

export function Beans() {
  const data = useModel();
  const sheets = useSheets();
  const [params, setParams] = useSearchParams();
  const view = params.get('v') === 'roasters' ? 'roasters' : 'beans';
  const filter = params.get('f') ?? 'drinking';
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'recent' | 'rating' | 'name' | 'brews'>('recent');
  const [roaster, setRoaster] = useState<string | null>(null);
  const [rsort, setRsort] = useState<'name' | 'rating' | 'bags'>('name');
  const [filters, setFilters] = useState(false);
  if (!data) return null;
  const { m } = data;
  const active = (filter !== 'drinking' ? 1 : 0) + (roaster ? 1 : 0) + (sort !== 'recent' ? 1 : 0);
  const setParam = (k: string, v: string) =>
    setParams(
      (p) => {
        p.set(k, v);
        return p;
      },
      { replace: true },
    );
  const ql = q.trim().toLowerCase();

  const header = (
    <PageHeader
      title="Beans"
      icon="bean"
      action={
        <button
          type="button"
          className="btn primary sm"
          onClick={() => (view === 'roasters' ? sheets.roaster() : sheets.beanForm())}
        >
          <Icon name="plus" size={16} /> {view === 'roasters' ? 'Add roaster' : 'Add a bag'}
        </button>
      }
    />
  );
  const viewSwitch = (
    <div className="viewswitch">
      <SlideToggle
        label="Show"
        value={view}
        onChange={(v) => setParam('v', v)}
        options={[
          [
            'beans',
            <>
              Bags <span className="n">{m.beans.length}</span>
            </>,
          ],
          [
            'roasters',
            <>
              Roasters <span className="n">{m.roasters.length}</span>
            </>,
          ],
        ]}
      />
    </div>
  );

  if (view === 'roasters') {
    const rows = m.roasters
      .filter((r) => !ql || `${r.name} ${r.location ?? ''}`.toLowerCase().includes(ql))
      .map((r) => {
        const beans = m.beans.filter((b) => b.roaster_id === r.id);
        const ratings = beans.flatMap((b) => b.rated.map((x) => x.rating!));
        return {
          r,
          beans,
          avg: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null,
        };
      })
      .sort((a, b) =>
        rsort === 'rating'
          ? (b.avg ?? -1) - (a.avg ?? -1)
          : rsort === 'bags'
            ? b.beans.length - a.beans.length
            : a.r.name.localeCompare(b.r.name),
      );
    const ractive = rsort !== 'name' ? 1 : 0;
    return (
      <div>
        {header}
        {viewSwitch}
        <div className="searchrow" style={{ marginBottom: 14 }}>
          <input
            className="in search"
            type="search"
            placeholder="Search roasters"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <FilterButton count={ractive} onClick={() => setFilters(true)} />
        </div>
        {filters && (
          <FilterSheet
            count={ractive}
            onClose={() => setFilters(false)}
            onClear={() => setRsort('name')}
          >
            <FilterGroup title="Sort">
              <SlideToggle
                label="Sort"
                value={rsort}
                options={[
                  ['name', 'A–Z'],
                  ['rating', 'Top rated'],
                  ['bags', 'Most bags'],
                ]}
                onChange={setRsort}
              />
            </FilterGroup>
          </FilterSheet>
        )}
        {rows.length ? (
          <div className="card flat" style={{ padding: '4px 16px' }}>
            {rows.map(({ r, beans, avg }) => (
              <div className="ri" key={r.id}>
                <button type="button" className="rm" onClick={() => sheets.roaster(r.id)}>
                  {r.images[0] ? (
                    <Thumb img={r.images[0]} className="logo-img" />
                  ) : (
                    <span className="logo-img" style={{ display: 'grid', placeItems: 'center' }}>
                      <Icon name="store" size={20} />
                    </span>
                  )}
                  <div className="mid">
                    <div className="t1">{r.name}</div>
                    <div className="t2">
                      {[r.location, `${beans.length} ${beans.length === 1 ? 'bag' : 'bags'}`]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </div>
                  <RB v={avg != null ? r1(avg) : null} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">No roasters yet.</div>
        )}
      </div>
    );
  }

  const cur = FILTERS.find((t) => t.k === filter) ?? FILTERS[0]!;
  const list = m.beans
    .filter(
      (b) =>
        cur.f(b) &&
        (!roaster || b.roaster_id === roaster) &&
        (!ql ||
          `${b.name} ${b.roasterName} ${b.tasting_notes ?? ''} ${b.origins.join(' ')} ${b.process ?? ''}`
            .toLowerCase()
            .includes(ql)),
    )
    .sort((a, b) => {
      if (sort === 'rating') return (b.avg ?? -1) - (a.avg ?? -1);
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'brews') return b.brews.length - a.brews.length;
      return (
        (b.last?.date.getTime() ?? b.created.getTime()) -
        (a.last?.date.getTime() ?? a.created.getTime())
      );
    });
  return (
    <div>
      {header}
      {viewSwitch}
      <div className="searchrow">
        <input
          className="in search"
          type="search"
          placeholder="Search beans, origin, notes"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <FilterButton count={active} onClick={() => setFilters(true)} />
      </div>
      <div className="sub listmeta" style={{ marginBottom: 14 }}>
        {[
          `${list.length} ${list.length === 1 ? 'bag' : 'bags'}`,
          cur.label,
          roaster && m.roasters.find((r) => r.id === roaster)?.name,
          sort !== 'recent' && SORTS.find(([k]) => k === sort)?.[1],
        ]
          .filter(Boolean)
          .join(' · ')}
      </div>
      {filters && (
        <FilterSheet
          count={active}
          onClose={() => setFilters(false)}
          onClear={() => {
            setParam('f', 'drinking');
            setRoaster(null);
            setSort('recent');
          }}
        >
          <FilterGroup title="Status">
            <SlideToggle
              label="Status"
              value={filter}
              options={FILTERS.map((t) => [
                t.k,
                <>
                  {t.name} <span className="n">{m.beans.filter(t.f).length}</span>
                </>,
              ])}
              onChange={(k) => setParam('f', k)}
            />
          </FilterGroup>
          {m.roasters.length > 1 && (
            <FilterGroup title="Roaster">
              <Select
                value={roaster ?? ''}
                onChange={(v) => setRoaster(v || null)}
                groups={[
                  {
                    options: [
                      { value: '', label: 'Any roaster' },
                      ...m.roasters
                        .slice()
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((r) => ({ value: r.id, label: r.name })),
                    ],
                  },
                ]}
              />
            </FilterGroup>
          )}
          <FilterGroup title="Sort">
            <SlideToggle label="Sort" value={sort} options={SORTS} onChange={setSort} />
          </FilterGroup>
        </FilterSheet>
      )}
      {list.length ? (
        <div className="grid">
          {list.map((b) => (
            <BeanCard key={b.id} b={b} m={m} />
          ))}
        </div>
      ) : (
        <div className="empty">Nothing here.</div>
      )}
    </div>
  );
}
