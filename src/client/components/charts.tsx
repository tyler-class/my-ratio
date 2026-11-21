// Small hand-drawn SVG charts, styled by CSS classes so they follow the theme.
import { dayKey, MO, startOfDay, WD } from '@shared/logic/dates';
import { fmtN, fmtRatio } from '@shared/logic/units';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

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

/**
 * Brews per day, GitHub-style: as many recent weeks as fit the panel's width (13 to 53), so the
 * squares stay a comfortable size and fill it, wide or narrow.
 */
export function Heatmap({ keys }: { keys: string[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const counts = new Map<string, number>();
  for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
  const today = startOfDay(new Date());
  const cell = 14,
    gap = 3,
    left = 24,
    top = 16;
  const weeks = width
    ? Math.max(13, Math.min(53, Math.floor((width - left - 18 + gap) / (cell + gap))))
    : 26;
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
    <div ref={box} className="heatmap">
      <svg
        className="chart"
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        role="img"
        aria-label={`Brews per day, last ${weeks} weeks`}
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
    </div>
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
      <i className="lg-gray" />
      Uneven
    </span>
  </div>
);

export interface HistPt {
  id: string;
  num: number;
  t: number;
  rating: number | null;
  /** Position along the dial (evenly spaced), or null without a numeric grind. */
  grind: number | null;
  /** The grind as written ("4.2"). */
  grindLabel: string | null;
  ratio: number | null;
  /** Water temperature as shown ("201°F"), or null. */
  temp: string | null;
  grinder: string | null;
  method: string | null;
}

/** A rating's colour: 7+ worked, 5 to 7 so-so, under 5 missed, none unrated. */
export const ratingTone = (r: number | null) =>
  r == null ? 'gray' : r >= 7 ? 'good' : r >= 5 ? 'warn' : 'bad';

/** The star icon's outline (24-unit box), for marking the best combination in charts. */
const ICON_STAR = 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z';

const mmdd = (t: number) => {
  const d = new Date(t);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * A bag's brews over time, in one chart: each brew a bar as tall as its rating (coloured by it,
 * the number on top), in brew order with every brew's date along the bottom (angled to fit);
 * over the bars, the grind as a line on the left axis and the ratio on the right. Tall green
 * bars under the lines show the settings that worked. Tap to pick a brew.
 */
export function BrewHistory({
  pts,
  grindFmt,
  onOpen,
  marked,
  faded,
  initialSel,
  onSelect,
}: {
  pts: HistPt[];
  /** The brew picked to start with (coming back to the page). */
  initialSel?: string | null;
  onSelect?: (id: string | null) => void;
  /** Brews on another grinder than the one shown: their bars fade. */
  faded?: Set<string>;
  grindFmt: (v: number) => string;
  onOpen: (id: string) => void;
  /** Brews in the best combination: a star above their bars. */
  marked?: Set<string>;
}) {
  const [ref, W] = useWidth();
  const scroller = useRef<HTMLDivElement>(null);
  const [sel, setSelState] = useState<string | null>(initialSel ?? null);
  const setSel = (id: string | null) => {
    setSelState(id);
    onSelect?.(id);
  };
  const sorted = [...pts].sort((a, b) => a.t - b.t);
  const n = sorted.length;
  // To two decimals, as typed on the brew (1:16.67), not rounded off.
  const ratioFmt = fmtRatio;
  const hasGrind = sorted.some((p) => p.grind != null);
  const hasRatio = sorted.some((p) => p.ratio != null);

  // The axes stay put at either side; the plot between them scrolls sideways once every brew
  // can't have room for its date ("11/18" needs about 32 px).
  const l = hasGrind ? 40 : 8,
    r = hasRatio ? 46 : 8,
    t = 30,
    b = 24,
    H = 222;
  const MIN_SLOT = 32;
  const room = Math.max(1, W - l - r);
  const PW = Math.max(room, n * MIN_SLOT);
  const slot = PW / Math.max(1, n);
  const cx = (i: number) => slot * (i + 0.5);
  const bw = Math.max(3, Math.min(22, slot * 0.62));
  const ry = (v: number) => H - b - (v / 10) * (H - t - b);

  // When the chart scrolls: open on the picked brew (coming back to the page), else on the
  // newest brews at the right-hand end.
  const startSel = useRef(initialSel);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const at = sorted.findIndex((p) => p.id === startSel.current);
    el.scrollLeft = at >= 0 ? slot * (at + 0.5) - el.clientWidth / 2 : el.scrollWidth;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, PW]);

  /** A line's own scale, padded so it doesn't sit on the chart's edges. */
  const scaleOf = (get: (p: HistPt) => number | null, mid: boolean) => {
    const vals = sorted.map(get).filter((v): v is number => v != null);
    const min = Math.min(...vals),
      max = Math.max(...vals);
    const pad = (max - min || Math.abs(max) || 1) * 0.2;
    const lo = min - pad,
      hi = max + pad;
    const y = (v: number) => H - b - ((v - lo) / (hi - lo || 1)) * (H - t - b);
    const path = sorted
      .map((p, i) => [i, get(p)] as const)
      .filter(([, v]) => v != null)
      .map(([i, v]) => `${cx(i).toFixed(1)},${y(v!).toFixed(1)}`)
      .join(' ');
    // Lowest and highest settings used (and the middle, where that reads as a value), as labels.
    const ticks = [...new Set(mid ? [min, (min + max) / 2, max] : [min, max])];
    return { y, path, ticks };
  };
  const g = hasGrind ? scaleOf((p) => p.grind, false) : null;
  const ra = hasRatio ? scaleOf((p) => p.ratio, true) : null;
  const pickedIdx = sorted.findIndex((p) => p.id === sel);
  const picked = pickedIdx >= 0 ? sorted[pickedIdx]! : null;

  // On click, not on touch-down: a swipe to scroll never picks a brew.
  const pick = (e: React.MouseEvent<SVGSVGElement>) => {
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
    const i = Math.max(0, Math.min(n - 1, Math.floor(x / slot)));
    const p = sorted[i];
    if (p) setSel(p.id === sel ? null : p.id);
  };

  return (
    <div ref={ref} className="chart-box hist">
      <div className="legend hist-legend">
        <span>
          <i className="hist-key bars" /> Rating
        </span>
        {hasGrind && (
          <span>
            <i className="hist-key grind" /> Grind (left)
          </span>
        )}
        {hasRatio && (
          <span>
            <i className="hist-key ratio" /> Ratio (right)
          </span>
        )}
      </div>
      <div className="hist-row">
        <svg className="chart" width={l} height={H} aria-hidden="true">
          {g?.ticks.map((v) => (
            <text key={v} x={l - 6} y={g.y(v) + 4} textAnchor="end" className="hist-ax grind">
              {grindFmt(v)}
            </text>
          ))}
        </svg>
        <div ref={scroller} className="hist-scroll">
          <svg
            className="chart"
            viewBox={`0 0 ${PW} ${H}`}
            width={PW}
            height={H}
            role="img"
            aria-label="Brews over time: rating, grind and ratio"
            onClick={pick}
          >
            {picked && (
              // The picked brew: a grey column from its star to its date.
              <rect
                className="hist-band"
                x={cx(pickedIdx) - slot / 2 + 1}
                y={2}
                width={slot - 2}
                height={H - 4}
                rx={8}
              />
            )}
            <line className="gl" x1={0} x2={PW} y1={ry(10)} y2={ry(10)} />
            <line className="gl" x1={0} x2={PW} y1={ry(5)} y2={ry(5)} />
            {/* Ratings: a soft bar to each brew's rating, the number above. */}
            {sorted.map((p, i) => {
              const x = cx(i) - bw / 2;
              return (
                <g key={p.id} className={faded?.has(p.id) ? 'hist-faded' : undefined}>
                  {p.rating == null ? (
                    <rect
                      className="hist-none"
                      x={x}
                      y={ry(0) - 3}
                      width={bw}
                      height={3}
                      rx={1.5}
                    />
                  ) : (
                    <rect
                      className={`bar-${ratingTone(p.rating)} hist-bar`}
                      x={x}
                      y={ry(p.rating)}
                      width={bw}
                      height={Math.max(2, ry(0) - ry(p.rating))}
                      rx={Math.min(4, bw / 3)}
                    />
                  )}
                  <text className="hist-rv" x={cx(i)} y={ry(10) - 5} textAnchor="middle">
                    {p.rating != null ? fmtN(p.rating) : '–'}
                  </text>
                  {marked?.has(p.id) && (
                    <path
                      className="hist-star"
                      d={ICON_STAR}
                      transform={`translate(${cx(i) - 6} ${ry(10) - 28}) scale(0.5)`}
                    />
                  )}
                </g>
              );
            })}
            {g && (
              <>
                <polyline className="hist-line grind" points={g.path} />
                {sorted.map((p, i) =>
                  p.grind == null ? null : (
                    <circle
                      key={p.id}
                      className={`hist-pt grind${faded?.has(p.id) ? ' hist-faded' : ''}`}
                      cx={cx(i)}
                      cy={g.y(p.grind)}
                      r={i === pickedIdx ? 5 : 3.5}
                    />
                  ),
                )}
              </>
            )}
            {ra && (
              <>
                <polyline className="hist-line ratio" points={ra.path} />
                {sorted.map((p, i) =>
                  p.ratio == null ? null : (
                    <circle
                      key={p.id}
                      className={`hist-pt ratio${faded?.has(p.id) ? ' hist-faded' : ''}`}
                      cx={cx(i)}
                      cy={ra.y(p.ratio)}
                      r={i === pickedIdx ? 5 : 3.5}
                    />
                  ),
                )}
              </>
            )}
            <line className="ax" x1={0} x2={PW} y1={H - b} y2={H - b} />
            {/* Every brew's date as MM/DD, straight under its bar. */}
            {sorted.map((p, i) => (
              <text
                key={p.id}
                className={i === pickedIdx ? 'hist-day on' : 'hist-day'}
                x={cx(i)}
                y={H - b + 14}
                textAnchor="middle"
              >
                {mmdd(p.t)}
              </text>
            ))}
          </svg>
        </div>
        <svg className="chart" width={r} height={H} aria-hidden="true">
          {ra?.ticks.map((v) => (
            <text key={v} x={6} y={ra.y(v) + 4} className="hist-ax ratio">
              {ratioFmt(v)}
            </text>
          ))}
        </svg>
      </div>
      {picked && (
        <div className="hist-pick on">
          <span className="hist-num">
            <b>
              Brew #{picked.num} on {MO[new Date(picked.t).getMonth()]}{' '}
              {new Date(picked.t).getDate()}
            </b>
            {(picked.method || picked.grinder) && (
              <span className="hist-grinder">
                {[picked.method, picked.grinder].filter(Boolean).join(' · ')}
              </span>
            )}
          </span>
          <dl className="hist-vals">
            <div>
              <dt>Grind</dt>
              <dd>{picked.grindLabel ?? '–'}</dd>
            </div>
            <div>
              <dt>Ratio</dt>
              <dd>{picked.ratio != null ? ratioFmt(picked.ratio) : '–'}</dd>
            </div>
            <div>
              <dt>Temp</dt>
              <dd>{picked.temp ?? '–'}</dd>
            </div>
            <div>
              <dt>Rating</dt>
              <dd>{picked.rating != null ? fmtN(picked.rating) : '–'}</dd>
            </div>
          </dl>
          <button
            type="button"
            className="hist-open"
            aria-label={`Open brew #${picked.num}`}
            onClick={() => onOpen(picked.id)}
          >
            Open
            <Icon name="chevRight" size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
