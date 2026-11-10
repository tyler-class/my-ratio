import { useState } from 'react';
import { EXTRACTION, flagFor } from '@shared/lookups';
import { daysBetween, MO, startOfDay } from '@shared/logic/dates';
import { mean, streak } from '@shared/logic/model';
import { fmtN, r1 } from '@shared/logic/units';
import { money, money0 } from '../lib/format';
import { useActions, useModel } from '../lib/queries';
import { PanelBoard, type PanelDef } from '../components/Panels';
import {
  Columns,
  Heatmap,
  Legend,
  Rank,
  Scatter,
  StackedMonths,
  type Col,
  type MonthMix,
} from '../components/charts';
import { PageHeader, RB, SlideToggle, Stat } from '../components/ui';
import { useSheets } from '../sheets/context';

const DIMS = [
  ['origin', 'Origin'],
  ['process', 'Process'],
  ['roaster', 'Roaster'],
  ['method', 'Method'],
  ['grinder', 'Grinder'],
] as const;

export function Insights() {
  const data = useModel();
  const sheets = useSheets();
  const actions = useActions();
  const [dim, setDim] = useState<(typeof DIMS)[number][0]>('origin');
  const [minN, setMinN] = useState(3);
  const [rm, setRm] = useState<string | null>(null);
  if (!data) return null;
  const { m, state } = data;
  const cur = state.settings.currency;
  const now = new Date();
  const rated = m.brews.filter((b) => b.rating != null);
  const avg = mean(rated.map((b) => b.rating!));
  const spent = m.beans.reduce((s, b) => s + (b.cost ?? 0), 0);
  const cpc = mean(m.brews.filter((b) => b.cup != null).map((b) => b.cup!));

  const monday = startOfDay(now);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const weekly: Col[] = [];
  for (let i = 11; i >= 0; i--) {
    const s = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - i * 7);
    const e = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 7);
    weekly.push({
      label: `${s.getMonth() + 1}/${s.getDate()}`,
      value: m.brews.filter((b) => b.date >= s && b.date < e).length,
      tone: i === 0 ? 'a' : 's',
    });
  }
  const dist: Col[] = [];
  for (let r = 1; r <= 10; r++)
    dist.push({
      label: String(r),
      value: rated.filter((b) => Math.max(1, Math.min(10, Math.round(b.rating!))) === r).length,
      tone: r >= 8 ? 'good' : r >= 6 ? 'a' : 'warn',
    });

  const gm = new Map<string, number[]>();
  const add = (k: string | null | undefined, v: number) => {
    if (!k?.trim()) return;
    gm.set(k.trim(), [...(gm.get(k.trim()) ?? []), v]);
  };
  for (const b of rated) {
    if (dim === 'origin') b.bean?.origins.forEach((c) => add(c, b.rating!));
    else if (dim === 'process') add(b.bean?.process, b.rating!);
    else if (dim === 'roaster') add(b.roasterName, b.rating!);
    else if (dim === 'method') add(b.method, b.rating!);
    else add(b.grinder, b.rating!);
  }
  const taste = [...gm]
    .map(([k, v]) => ({ k, n: v.length, avg: mean(v) ?? 0 }))
    .filter((g) => g.n >= minN)
    .sort((a, b) => b.avg - a.avg);

  const methods = [...new Set(rated.map((b) => b.method).filter(Boolean) as string[])];
  const ratioMethod = rm ?? methods[0] ?? null;
  const ratioPts = rated
    .filter((b) => b.ratio && b.method === ratioMethod && b.ratio > 1 && b.ratio < 25)
    .map((b) => {
      const ex = EXTRACTION.find((e) => e.key === b.extraction);
      return {
        x: b.ratio!,
        y: b.rating!,
        tone: ex?.tone ?? 'a',
        title: `${b.beanName} · 1:${b.ratio!.toFixed(1)} · ${fmtN(b.rating)}`,
      };
    });
  const bk = new Map<string, number[]>();
  for (const p of ratioPts) {
    const k = (Math.round(p.x * 2) / 2).toFixed(1);
    bk.set(k, [...(bk.get(k) ?? []), p.y]);
  }
  const bRows = [...bk]
    .map(([k, v]) => ({ k, n: v.length, avg: mean(v) ?? 0 }))
    .filter((x) => x.n >= 3)
    .sort((a, b) => b.avg - a.avg);

  const mm = new Map<string, MonthMix>();
  for (const b of m.brews) {
    if (!b.extraction) continue;
    const k = b.key.slice(0, 7);
    const e = mm.get(k) ?? {
      label: MO[b.date.getMonth()]!,
      under: 0,
      balanced: 0,
      over: 0,
      uneven: 0,
      total: 0,
    };
    e.total++;
    e[b.extraction]++;
    mm.set(k, e);
  }
  const months = [...mm]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v)
    .slice(-10);

  const rs = new Map<string, { name: string; spend: number; grams: number; bags: number }>();
  for (const b of m.beans) {
    if (!b.cost || !b.roasterName) continue;
    const r = rs.get(b.roasterName) ?? { name: b.roasterName, spend: 0, grams: 0, bags: 0 };
    r.spend += b.cost;
    r.grams += b.bag_g ?? 0;
    r.bags += 1;
    rs.set(b.roasterName, r);
  }
  const spendRows = [...rs.values()].sort((a, b) => b.spend - a.spend);
  const top = m.beans.filter((b) => b.rated.length >= 2).sort((a, b) => b.avg! - a.avg!);
  const reorder = m.beans
    .filter(
      (b) => b.status === 'finished' && (b.buy_again === 'definitely' || b.buy_again === 'yes'),
    )
    .sort(
      (a, b) =>
        (a.buy_again === 'definitely' ? 0 : 1) - (b.buy_again === 'definitely' ? 0 : 1) ||
        (b.avg ?? 0) - (a.avg ?? 0),
    );
  const best = [...rated].sort(
    (a, b) => b.rating! - a.rating! || b.date.getTime() - a.date.getTime(),
  );
  const st = streak(m.brews, now);

  if (!m.brews.length)
    return (
      <div>
        <PageHeader title="Insights" icon="chart" />
        <div className="card empty">Log and rate a few brews to see patterns here.</div>
      </div>
    );

  const panels: PanelDef[] = [
    {
      id: 'glance',
      title: 'At a glance',
      size: 'full',
      body: (
        <div className="stats">
          <Stat
            v={m.brews.length}
            l="Brews logged"
            d={`${m.brews.filter((b) => daysBetween(b.date, now) <= 29).length} in 30 days`}
          />
          <Stat
            v={avg != null ? fmtN(r1(avg)) : '–'}
            l="Average rating"
            d={`${rated.length} rated`}
          />
          <Stat v={`${st} ${st === 1 ? 'day' : 'days'}`} l="Brew streak" />
          <Stat
            v={m.beans.length}
            l="Bags tried"
            d={`${m.beans.filter((b) => b.status === 'finished').length} finished`}
          />
          <Stat
            v={money0(spent, cur)}
            l="Spent on beans"
            d={cpc != null ? `${money(cpc, cur)} per cup` : undefined}
          />
          <Stat
            v={m.runway != null ? `${Math.round(m.runway)} d` : '–'}
            l="Runway"
            d={`${Math.round(m.stock)} g, ${Math.round(m.burn)} g/day`}
          />
        </div>
      ),
    },
    {
      id: 'calendar',
      title: 'Your coffee calendar',
      sub: 'Last 26 weeks',
      size: 'full',
      body: <Heatmap keys={m.brews.map((b) => b.key)} />,
    },
    {
      id: 'weekly',
      title: 'Brews per week',
      sub: 'Last 12 weeks',
      size: 'half',
      body: <Columns data={weekly} />,
    },
    {
      id: 'ratings',
      title: 'How you rate',
      sub: 'Distribution of all rated brews',
      size: 'half',
      body: <Columns data={dist} />,
    },
    {
      id: 'taste',
      title: 'Taste explorer',
      size: 'full',
      body: (
        <>
          <div
            className="flexrow"
            style={{ justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap' }}
          >
            <SlideToggle
              label="Group by"
              className="fit"
              value={dim}
              options={DIMS}
              onChange={setDim}
            />
            <SlideToggle
              label="Minimum brews"
              className="fit"
              value={String(minN)}
              options={[1, 3, 5, 10].map((n) => [String(n), `${n}+ brews`] as const)}
              onChange={(n) => setMinN(Number(n))}
            />
          </div>
          {taste.length ? (
            <Rank
              rows={taste.slice(0, 12).map((g) => ({
                key: g.k,
                label: `${dim === 'origin' ? flagFor(g.k) + ' ' : ''}${g.k}`,
                value: g.avg,
                vl: `${fmtN(r1(g.avg))} · ${g.n} ${g.n === 1 ? 'brew' : 'brews'}`,
              }))}
              max={10}
            />
          ) : (
            <div className="empty">Not enough rated brews for that cut. Lower the minimum.</div>
          )}
        </>
      ),
    },
    {
      id: 'ratio',
      title: 'Ratio vs rating',
      size: 'half',
      body: (
        <>
          {methods.length > 1 && (
            <div style={{ margin: '8px 0 10px' }}>
              <SlideToggle
                label="Method"
                className="fit"
                value={ratioMethod}
                options={methods.map((o) => [o, o] as const)}
                onChange={setRm}
              />
            </div>
          )}
          {ratioPts.length >= 3 ? (
            <div>
              <Scatter
                pts={ratioPts}
                xMin={Math.floor(Math.min(...ratioPts.map((p) => p.x)) - 0.5)}
                xMax={Math.ceil(Math.max(...ratioPts.map((p) => p.x)) + 0.5)}
                yMin={0}
                yMax={10}
                xStep={1}
                yStep={2}
                xFmt={(v) => `1:${v}`}
              />
              {bRows[0] ? (
                <div className="hint">
                  Best average rating at 1:{bRows[0].k} ({fmtN(r1(bRows[0].avg))}, {bRows[0].n}{' '}
                  brews).
                </div>
              ) : (
                <div className="hint">Not enough repeats at any one ratio yet.</div>
              )}
            </div>
          ) : (
            <div className="empty">Rate a few more {ratioMethod ?? ''} brews to see this.</div>
          )}
        </>
      ),
    },
    {
      id: 'dialin',
      title: 'Dial-in accuracy',
      sub: 'Extraction labels by month',
      size: 'half',
      body: (
        <>
          {months.length ? (
            <StackedMonths data={months} />
          ) : (
            <div className="empty">Label extraction when rating to see this.</div>
          )}
          <Legend />
        </>
      ),
    },
    {
      id: 'top',
      title: 'Top bags',
      sub: 'Average brew rating, 2+ rated brews',
      size: 'half',
      body: (
        <>
          {top.length ? (
            <Rank
              rows={top.slice(0, 8).map((b) => ({
                key: b.id,
                label: b.name,
                value: b.avg!,
                vl: `${fmtN(r1(b.avg!))} · ${b.rated.length} brews`,
                sub: b.roasterName + (b.perG ? ` · ${money(b.perG * m.avgDose, cur)} / cup` : ''),
                onClick: () => sheets.bean(b.id),
              }))}
              max={10}
            />
          ) : (
            <div className="empty">Rate more brews.</div>
          )}
        </>
      ),
    },
    {
      id: 'orderAgain',
      title: 'Order Again Shortlist',
      sub: 'Finished bags you would buy again',
      size: 'half',
      body: (
        <>
          {reorder.length ? (
            reorder.slice(0, 8).map((b) => (
              <div className="ri" key={b.id}>
                <button type="button" className="rm" onClick={() => sheets.bean(b.id)}>
                  <RB v={b.avg != null ? r1(b.avg) : null} />
                  <div className="mid">
                    <div className="t1">{b.name}</div>
                    <div className="t2">
                      {b.roasterName}
                      {b.cost ? ` · ${money(b.cost, cur)} / ${b.bag_g ?? '?'} g` : ''}
                    </div>
                  </div>
                  <span className={'tag ' + (b.buy_again === 'definitely' ? 'good' : 'acc')}>
                    {b.buy_again === 'definitely' ? 'Definitely' : 'Yes'}
                  </span>
                </button>
              </div>
            ))
          ) : (
            <div className="empty">Mark finished bags as Yes or Definitely.</div>
          )}
        </>
      ),
    },
    {
      id: 'spend',
      title: 'Spend by roaster',
      sub: 'Total across bags, with price per 100 g',
      size: 'half',
      body: (
        <>
          {spendRows.length ? (
            <Rank
              rows={spendRows.slice(0, 8).map((r) => ({
                key: r.name,
                label: r.name,
                value: r.spend,
                vl: money0(r.spend, cur),
                sub: `${r.bags} ${r.bags === 1 ? 'bag' : 'bags'}${r.grams ? ` · ${money((r.spend / r.grams) * 100, cur)} / 100 g` : ''}`,
              }))}
              max={spendRows[0]!.spend}
            />
          ) : (
            <div className="empty">No prices logged.</div>
          )}
        </>
      ),
    },
    {
      id: 'recipes',
      title: 'Recipe book',
      sub: 'Your best-rated brews. Tap one to brew it again.',
      size: 'half',
      body: (
        <>
          {best.slice(0, 6).map((b) => (
            <div className="ri" key={b.id}>
              <button type="button" className="rm" onClick={() => sheets.log({ fromBrewId: b.id })}>
                <RB v={b.rating} />
                <div className="mid">
                  <div className="t1">{b.beanName}</div>
                  <div className="t2">
                    {b.method ? b.method + ' · ' : ''}
                    {fmtN(b.dose_g)} g → {b.water_ml != null ? Math.round(b.water_ml) : '–'} mL ·
                    grind {fmtN(b.grind)}
                  </div>
                </div>
              </button>
            </div>
          ))}
        </>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Insights" icon="chart" />
      <PanelBoard
        defs={panels}
        saved={state.settings.insights_layout}
        onSave={(insights_layout) => void actions.saveSettings({ insights_layout })}
      />
    </div>
  );
}
