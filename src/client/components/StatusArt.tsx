// A bag's current status, drawn on its clay blob with a little life (styles: .sx in styles.css):
// Ordered fans out a stack of receipts, Freezing has snow blowing through, Resting is a night
// sky with a full moon and twinkling stars, Drinking a filled cup with curling steam, Finished a
// thick check drawn in on green. The fan and the check play once; snow, stars and steam loop.
// Reduce Motion shows each one still.
import { useId } from 'react';
import type { BeanStatus } from '@shared/lookups';

const REC = 'M6 3.5h12v17l-2.5-1.5-2 1.5-1.5-1.5-1.5 1.5-2-1.5L6 20.5z';
const SNOW =
  'M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5L12 6l2.5-1.5M9.5 19.5L12 18l2.5 1.5M5 10.5l2.6-1.5-.1-2.9M19 13.5l-2.6 1.5.1 2.9M5 13.5l2.6 1.5-.1 2.9M19 10.5l-2.6-1.5.1-2.9';
const MOON = 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z';
const CUP = 'M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9z';
const HANDLE = 'M17 10h1.5a2.5 2.5 0 0 1 0 5H17';
const STAR = 'M0 -3 L.8 -.8 L3 0 L.8 .8 L0 3 L-.8 .8 L-3 0 L-.8 -.8Z';
const ICON = 'translate(18.8 18.8) scale(1.1)';

const FLAKES = [
  [14, 1.2, 0.0, 2.6],
  [22, 0.9, 1.1, 3.1],
  [30, 1.4, 0.4, 2.4],
  [38, 1.0, 1.8, 3.4],
  [46, 1.3, 0.8, 2.8],
  [52, 0.9, 2.2, 3.0],
  [18, 1.0, 2.6, 3.3],
  [42, 1.2, 1.5, 2.5],
  [26, 0.8, 0.2, 3.6],
] as const;
const STARS = [
  [14, 18, 1.0, 0],
  [47, 14, 0.8, 0.5],
  [50, 40, 1.1, 1.1],
  [16, 44, 0.7, 1.6],
  [34, 9, 0.6, 0.8],
  [24, 52, 0.8, 2.0],
] as const;

/** The art for a status's selected step, filling a 64-unit square (its blob given as a path). */
export function StatusArt({ status, blob }: { status: BeanStatus; blob: string }) {
  const id = useId().replace(/:/g, '');
  const clip = `sx-${id}`;
  const shell = (cls: string, fill: string, inner: React.ReactNode, back?: React.ReactNode) => (
    <svg className={`sx sx-${cls}`} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <clipPath id={clip}>
          <path d={blob} />
        </clipPath>
      </defs>
      <path d={blob} fill={fill} />
      {back && <g clipPath={`url(#${clip})`}>{back}</g>}
      {inner}
    </svg>
  );
  const line = { fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  switch (status) {
    case 'ordered': {
      const paper = (cls: string) => (
        <g
          className={`sx-paper ${cls}`}
          {...line}
          stroke="#fff"
          strokeOpacity={0.62}
          strokeWidth={1.6}
        >
          <path d={REC} fill="#8b8178" />
          <path d="M9 8h6M9 11.5h6" strokeDasharray="1.6 1.4" />
        </g>
      );
      return shell(
        'ordered',
        '#8b8178',
        <g transform={ICON}>
          {paper('sx-l')}
          {paper('sx-r')}
          <g {...line} stroke="#fff" strokeWidth={1.7}>
            <path d={REC} fill="#8b8178" />
            <path d="M9 8h6M9 11.5h6M9 15h3.5" />
          </g>
        </g>,
      );
    }
    case 'freezing':
      return shell(
        'freezing',
        '#3f82c4',
        <g transform={ICON} {...line} stroke="#fff" strokeWidth={1.8}>
          <path d={SNOW} />
        </g>,
        <g fill="#fff">
          {FLAKES.map(([y, r, delay, dur], i) => (
            <circle
              key={i}
              className="sx-flake"
              cx={0}
              cy={y}
              r={r}
              style={{ animationDelay: `-${delay}s`, animationDuration: `${dur}s` }}
            />
          ))}
        </g>,
      );
    case 'resting':
      return shell(
        'resting',
        '#1f2c55',
        <g transform={ICON} fill="#fff" stroke="#fff" strokeWidth={1.4} strokeLinejoin="round">
          <path d={MOON} />
        </g>,
        <g fill="#fff">
          {STARS.map(([x, y, s, delay], i) => (
            <path
              key={i}
              className="sx-star"
              d={STAR}
              transform={`translate(${x} ${y}) scale(${s})`}
              style={{ animationDelay: `${delay}s` }}
            />
          ))}
        </g>,
      );
    case 'drinking':
      return shell(
        'drinking',
        '#a4542a',
        <>
          <g {...line} stroke="#fff" strokeWidth={1.7}>
            {[
              [26.6, 0],
              [31, 0.7],
              [35.4, 1.4],
            ].map(([x, delay], i) => (
              <path
                key={i}
                className="sx-steam"
                pathLength={1}
                d={`M${x} 31 c-2.6 -1.8 2.6 -3.6 0 -5.4 s-2.6 -3.6 0 -5.4 s-2.6 -3.6 0 -5.4`}
                style={{ animationDelay: `${delay}s` }}
              />
            ))}
          </g>
          <g transform="translate(18.8 25) scale(1.1)" {...line} stroke="#fff" strokeWidth={1.7}>
            <path d={CUP} fill="#fff" />
            <path d={HANDLE} />
          </g>
        </>,
      );
    case 'finished':
      return shell(
        'finished',
        '#a8d5a0',
        <g transform={ICON} {...line} stroke="#2d6a33" strokeWidth={2.9}>
          <path className="sx-tick" pathLength={1} d="M5 12.5l4.5 4.5L19 7.5" />
        </g>,
      );
  }
}

/** Each status's colours, as its selected step shows them: the blob, and the icon on it. */
export const STATUS_COLORS: Record<BeanStatus, { fill: string; ink: string }> = {
  ordered: { fill: '#8b8178', ink: '#fff' },
  freezing: { fill: '#3f82c4', ink: '#fff' },
  resting: { fill: '#1f2c55', ink: '#fff' },
  drinking: { fill: '#a4542a', ink: '#fff' },
  finished: { fill: '#a8d5a0', ink: '#2d6a33' },
};

/** A small, still badge for a status: its icon on its coloured blob. */
export function StatusBadge({
  status,
  blob,
  icon,
  size = 22,
}: {
  status: BeanStatus;
  blob: string;
  icon: string;
  size?: number;
}) {
  const c = STATUS_COLORS[status];
  return (
    <svg className="status-badge" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <path d={blob} fill={c.fill} />
      <g
        transform="translate(15 15) scale(1.4)"
        fill="none"
        stroke={c.ink}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        dangerouslySetInnerHTML={{ __html: icon }}
      />
    </svg>
  );
}
