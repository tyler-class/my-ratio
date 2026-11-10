// Small hand-drawn SVG charts, styled by CSS classes so they follow the theme.
import { dayKey, MO, startOfDay, WD } from '@shared/logic/dates';
import { fmtN } from '@shared/logic/units';
import { useEffect, useRef, useState } from 'react';

/**
 * The width a chart actually has, so it draws at true size: text and dots stay the same size
 * in a half-width panel, a full-width one and on a phone, instead of the picture scaling up.
 */
function useWidth(fallback = 600) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const next = Math.round(e!.contentRect.width);
      if (next > 0) setW(next);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, Math.max(220, w)] as const;
}

/** Show every nth label so they never run into each other. */
const every = (count: number, width: number, minGap: number) =>
  Math.max(1, Math.ceil((count * minGap) / Math.max(1, width)));

export interface Col {
  label: string;
  value: number;
  tone?: string;
}

export function Columns({ data, height = 160 }: { data: Col[]; height?: number }) {
  const [ref, W] = useWidth();
  const H = height,
    pl = 6,
    pb = 24,
    pt = 20;
  const max = Math.max(1, ...data.map((d) => d.value));
  const bw = (W - pl * 2) / Math.max(1, data.length);
  // Bars stay slim on a wide panel; labels thin out on a narrow one.
  const barW = Math.min(bw * 0.7, 44);
  const step = every(data.length, W, 38);
  return (
    <div ref={ref} className="chart-box">
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img">
        <line className="ax" x1={pl} x2={W - pl} y1={H - pb} y2={H - pb} />
        {data.map((d, i) => {
          const h = ((H - pb - pt) * d.value) / max;
          const x = pl + i * bw + (bw - barW) / 2;
          return (
            <g key={i}>
              <rect
                className={'bar-' + (d.tone ?? 'a')}
                x={x}
                y={H - pb - h}
                width={barW}
                height={Math.max(h, d.value > 0 ? 2 : 0)}
                rx={4}
              >
                <title>{`${d.label}: ${d.value}`}</title>
              </rect>
              {d.value > 0 && (
                <text className="vl" x={x + barW / 2} y={H - pb - h - 5} textAnchor="middle">
                  {d.value}
                </text>
              )}
              {i % step === 0 && (
                <text x={x + barW / 2} y={H - 7} textAnchor="middle">
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export interface Pt {
  x: number;
  y: number;
  tone?: string;
  title: string;
}

export function Scatter({
  pts,
  xMin,
  xMax,
  yMin,
  yMax,
  xStep,
  yStep,
  xFmt,
}: {
  pts: Pt[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  xStep: number;
  yStep: number;
  xFmt?: (v: number) => string;
}) {
  const [ref, W] = useWidth();
  const H = 250,
    l = 34,
    r = 12,
    t = 10,
    b = 28;
  const sx = (v: number) => l + ((v - xMin) / (xMax - xMin || 1)) * (W - l - r);
  const sy = (v: number) => H - b - ((v - yMin) / (yMax - yMin || 1)) * (H - t - b);
  const xs: number[] = [];
  for (let v = xMin; v <= xMax + 1e-9; v += xStep) xs.push(v);
  const xEvery = every(xs.length, W - l - r, 44);
  const ys: number[] = [];
  for (let v = yMin; v <= yMax + 1e-9; v += yStep) ys.push(v);
  return (
    <div ref={ref} className="chart-box">
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img">
        {ys.map((v) => (
          <g key={'y' + v}>
            <line className="gl" x1={l} x2={W - r} y1={sy(v)} y2={sy(v)} />
            <text x={l - 8} y={sy(v) + 4} textAnchor="end">
              {fmtN(v)}
            </text>
          </g>
        ))}
        {xs.map((v, i) =>
          i % xEvery === 0 ? (
            <text key={'x' + v} x={sx(v)} y={H - 8} textAnchor="middle">
              {xFmt ? xFmt(v) : fmtN(v)}
            </text>
          ) : null,
        )}
        <line className="ax" x1={l} x2={W - r} y1={H - b} y2={H - b} />
        {pts.map((p, i) => (
          <circle key={i} className={'dot-' + (p.tone ?? 'a')} cx={sx(p.x)} cy={sy(p.y)} r={5.5}>
            <title>{p.title}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}

/** Brews per day for the last 26 weeks, GitHub-style. */
export function Heatmap({ keys }: { keys: string[] }) {
  const counts = new Map<string, number>();
  for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
  const today = startOfDay(new Date());
  const weeks = 26,
    cell = 13,
    gap = 3,
    left = 24,
    top = 16;
  const start = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() - today.getDay() - (weeks - 1) * 7,
  );
  const cells: { x: number; y: number; c: number; t: string }[] = [];
  const months: { x: number; t: string }[] = [];
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const dt = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d);
      if (dt > today) continue;
      const c = counts.get(dayKey(dt)) ?? 0;
      cells.push({
        x: left + w * (cell + gap),
        y: top + d * (cell + gap),
        c,
        t: `${MO[dt.getMonth()]} ${dt.getDate()}: ${c} ${c === 1 ? 'brew' : 'brews'}`,
      });
      if (d === 0 && dt.getDate() <= 7)
        months.push({ x: left + w * (cell + gap), t: MO[dt.getMonth()]! });
    }
  }
  // Room on the right for the last month label.
  const W = left + weeks * (cell + gap) + 18,
    H = top + 7 * (cell + gap);
  return (
    <svg
      className="chart"
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      role="img"
      style={{ maxWidth: '100%', height: 'auto', display: 'block' }}
    >
      {months.map((m, i) => (
        <text key={i} x={m.x} y={10}>
          {m.t}
        </text>
      ))}
      {[1, 3, 5].map((d) => (
        <text key={d} x={0} y={top + d * (cell + gap) + 10}>
          {WD[d]!.charAt(0)}
        </text>
      ))}
      {cells.map((c, i) => (
        <rect
          key={i}
          className={'h' + Math.min(4, c.c)}
          x={c.x}
          y={c.y}
          width={cell}
          height={cell}
          rx={3.5}
        >
          <title>{c.t}</title>
        </rect>
      ))}
    </svg>
  );
}

export interface MonthMix {
  label: string;
  under: number;
  balanced: number;
  over: number;
  uneven: number;
  total: number;
}

export function StackedMonths({ data }: { data: MonthMix[] }) {
  const [ref, W] = useWidth();
  const H = 190,
    pb = 24,
    pt = 8;
  const bw = (W - 12) / Math.max(1, data.length);
  const parts = [
    { k: 'under', c: 'warn' },
    { k: 'uneven', c: 'blue' },
    { k: 'over', c: 'bad' },
    { k: 'balanced', c: 'good' },
  ] as const;
  const barW = Math.min(bw * 0.72, 56);
  const step = every(data.length, W, 40);
  return (
    <div ref={ref} className="chart-box">
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img">
        <line className="ax" x1={6} x2={W - 6} y1={H - pb} y2={H - pb} />
        {data.map((d, i) => {
          let y = H - pb;
          const x = 6 + i * bw + (bw - barW) / 2;
          return (
            <g key={i}>
              <title>{`${d.label}: ${d.balanced} of ${d.total} balanced`}</title>
              {parts.map((p) => {
                const h = d.total ? ((H - pb - pt) * d[p.k]) / d.total : 0;
                y -= h;
                return h > 0 ? (
                  <rect
                    key={p.k}
                    className={'bar-' + p.c}
                    x={x}
                    y={y}
                    width={barW}
                    height={h}
                    rx={3}
                  />
                ) : null;
              })}
              {i % step === 0 && (
                <text x={x + barW / 2} y={H - 8} textAnchor="middle">
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export interface RankRow {
  key: string;
  label: string;
  value: number;
  vl: string;
  sub?: string;
  onClick?: () => void;
}

export function Rank({ rows, max }: { rows: RankRow[]; max: number }) {
  return (
    <div className="rank">
      {rows.map((r) => (
        <div
          className={'rk' + (r.onClick ? ' click' : '')}
          key={r.key}
          onClick={r.onClick}
          role={r.onClick ? 'button' : undefined}
        >
          <div className="rk-top">
            <span className="rk-l">{r.label}</span>
            <span className="rk-v">{r.vl}</span>
          </div>
          <div className="bar">
            <i style={{ width: `${max ? Math.min(100, (r.value / max) * 100) : 0}%` }} />
          </div>
          {r.sub ? <div className="rk-s">{r.sub}</div> : null}
        </div>
      ))}
    </div>
  );
}

export const Legend = () => (
  <div className="legend">
    <span>
      <i className="lg-good" />
      Balanced
    </span>
    <span>
      <i className="lg-warn" />
      Under
    </span>
    <span>
      <i className="lg-bad" />
      Over
    </span>
    <span>
      <i className="lg-blue" />
      Uneven
    </span>
  </div>
);
