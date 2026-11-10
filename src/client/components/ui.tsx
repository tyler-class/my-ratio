import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { fmtN } from '@shared/logic/units';
import type { Tone } from '@shared/lookups';
import { Icon, type IconName } from './Icon';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

/** Rating badge, colored by band: 5 and under grey, then yellow, orange, and green at the top. */
export function RB({ v, big }: { v: number | null | undefined; big?: boolean }) {
  if (v == null) return <span className={cx('rb rb-none', big && 'big')}>–</span>;
  const c = v >= 8.5 ? 'top' : v >= 7 ? 'high' : v > 5 ? 'mid' : 'low';
  return <span className={cx('rb', 'rb-' + c, big && 'big')}>{fmtN(v)}</span>;
}

/** Chips for known values plus a dashed "New" chip to type one. */
export function ChoiceInput({
  options,
  value,
  onChange,
  placeholder,
  small,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  small?: boolean;
}) {
  const known = options.some((o) => o === value);
  const [typing, setTyping] = useState(!!value && !known);
  return (
    <div className="seg">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          className={cx('chip', small && 'sm')}
          aria-pressed={!typing && value === o}
          onClick={() => {
            setTyping(false);
            onChange(value === o ? '' : o);
          }}
        >
          {o}
        </button>
      ))}
      {typing ? (
        <input
          className="in chip-in"
          style={{ maxWidth: 220 }}
          autoFocus={!value}
          value={value}
          placeholder={placeholder ?? 'Type one'}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <button
          type="button"
          className={cx('chip new', small && 'sm')}
          onClick={() => {
            setTyping(true);
            onChange('');
          }}
        >
          <Icon name="plus" size={14} /> New
        </button>
      )}
    </div>
  );
}

export interface SelectGroup {
  label?: string;
  options: { value: string; label: string }[];
}

/** A styled dropdown: a field-like button that opens a list below it. */
export function Select({
  value,
  onChange,
  groups,
  placeholder = 'Choose',
}: {
  value: string;
  onChange: (v: string) => void;
  groups: SelectGroup[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const listId = useId();
  const flat = groups.flatMap((g) => g.options);
  const current = flat.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);
  useEffect(() => {
    if (!open || hi < 0) return;
    list.current?.querySelector(`[data-i="${hi}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, hi]);

  const show = () => {
    setHi(
      Math.max(
        0,
        flat.findIndex((o) => o.value === value),
      ),
    );
    setOpen(true);
  };
  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && open) {
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      setOpen(false);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return show();
      const d = e.key === 'ArrowDown' ? 1 : -1;
      setHi((i) => Math.max(0, Math.min(flat.length - 1, i + d)));
    } else if ((e.key === 'Enter' || e.key === ' ') && open && flat[hi]) {
      e.preventDefault();
      pick(flat[hi].value);
    }
  };

  const offset = groups.map((_, gi) =>
    groups.slice(0, gi).reduce((sum, g) => sum + g.options.length, 0),
  );
  return (
    <div className="sel" ref={root} onKeyDown={onKey}>
      <button
        type="button"
        className={cx('in sel-btn', !current && 'ph')}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => (open ? setOpen(false) : show())}
      >
        <span className="sel-val">{current?.label ?? placeholder}</span>
        <Icon name="chevDown" size={16} />
      </button>
      {open && (
        <div className="sel-list" role="listbox" id={listId} ref={list}>
          {groups.map((g, gi) =>
            g.options.length ? (
              <div key={g.label ?? gi} role="group" aria-label={g.label}>
                {g.label && <div className="sel-grp">{g.label}</div>}
                {g.options.map((o, oi) => {
                  const n = (offset[gi] ?? 0) + oi;
                  return (
                    <div
                      key={o.value}
                      role="option"
                      data-i={n}
                      aria-selected={o.value === value}
                      className={cx('sel-opt', n === hi && 'hi')}
                      onPointerEnter={() => setHi(n)}
                      onClick={() => pick(o.value)}
                    >
                      <span>{o.label}</span>
                      {o.value === value && <Icon name="check" size={15} />}
                    </div>
                  );
                })}
              </div>
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}

/** Pick several from suggestions, or type new ones (Enter or comma adds). */
export function TagInput({
  value,
  onChange,
  suggestions,
  decorate,
  placeholder,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  suggestions: string[];
  decorate?: (s: string) => string;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState('');
  const has = (s: string) => value.some((v) => v.toLowerCase() === s.toLowerCase());
  const add = (s: string) => {
    const t = s.trim();
    if (t && !has(t)) onChange([...value, t]);
    setDraft('');
  };
  const q = draft.trim().toLowerCase();
  const shown = suggestions.filter((s) => !has(s) && (!q || s.toLowerCase().includes(q)));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {value.length > 0 && (
        <div className="seg">
          {value.map((v) => (
            <button
              key={v}
              type="button"
              className="chip sm"
              aria-pressed
              onClick={() => onChange(value.filter((x) => x !== v))}
            >
              {decorate ? decorate(v) : v} <span className="x">✕</span>
            </button>
          ))}
        </div>
      )}
      <input
        className="in"
        value={draft}
        placeholder={placeholder ?? 'Type to add'}
        onChange={(e) => {
          const v = e.target.value;
          if (v.endsWith(',')) add(v.slice(0, -1));
          else setDraft(v);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add(draft);
          }
        }}
        onBlur={() => draft.trim() && add(draft)}
      />
      {shown.length > 0 && (
        <div className="hscroll">
          {shown.slice(0, 24).map((s) => (
            <button key={s} type="button" className="chip sm" onClick={() => add(s)}>
              {decorate ? decorate(s) : s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Stat({ v, l, d }: { v: ReactNode; l: string; d?: ReactNode }) {
  return (
    <div className="stat">
      <div className="v">{v}</div>
      <div className="l">{l}</div>
      {d ? <div className="d">{d}</div> : null}
    </div>
  );
}

export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('fg', className)}>
      <label className="lbl">{label}</label>
      {children}
    </div>
  );
}

/** Two taps to delete: the first arms it, the second confirms. */
export function ConfirmButton({
  children,
  confirm,
  onConfirm,
  className,
}: {
  children: ReactNode;
  confirm: string;
  onConfirm: () => void;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      className={cx('btn ghost danger', className)}
      onClick={() => (armed ? onConfirm() : setArmed(true))}
    >
      <Icon name="trash" size={16} />
      {armed ? confirm : children}
    </button>
  );
}

/**
 * A sheet that rises from the bottom on phones (drag the handle down to dismiss, up to
 * expand) and opens as a centered dialog on wider screens.
 */
export function Sheet({
  title,
  sub,
  onClose,
  children,
  footer,
}: {
  title: ReactNode;
  sub?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const titleId = useId();
  const drag = useRef<{ y: number; t: number } | null>(null);
  const [dy, setDy] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const grab = {
    onPointerDown: (e: React.PointerEvent) => {
      if (window.matchMedia('(min-width: 640px)').matches) return;
      if ((e.target as HTMLElement).closest('button')) return;
      drag.current = { y: e.clientY, t: performance.now() };
      setDragging(true);
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        /* best-effort */
      }
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (!drag.current) return;
      const d = e.clientY - drag.current.y;
      setDy(d > 0 ? d : -Math.sqrt(-d) * 4);
    },
    onPointerUp: (e: React.PointerEvent) => {
      if (!drag.current) return;
      const d = e.clientY - drag.current.y;
      const speed = d / Math.max(1, performance.now() - drag.current.t);
      drag.current = null;
      setDragging(false);
      setDy(0);
      if (d > 120 || speed > 0.6) {
        if (expanded && d < 260 && speed <= 0.6) setExpanded(false);
        else onClose();
      } else if (d < -40) setExpanded(true);
    },
    onPointerCancel: () => {
      drag.current = null;
      setDragging(false);
      setDy(0);
    },
  };

  return (
    <div className="ov">
      <div
        className="scrim"
        style={{ opacity: dy > 0 ? Math.max(0.2, 1 - dy / 500) : 1 }}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cx('sheet', expanded && 'expanded')}
        style={{
          transform: dy ? `translateY(${dy}px)` : undefined,
          transition: dragging ? 'none' : 'transform .22s ease, height .22s ease',
        }}
      >
        <div className="sh-grab" {...grab}>
          <div className="handle" />
          <div className="sh-head">
            <div style={{ minWidth: 0 }}>
              <h2 id={titleId}>{title}</h2>
              {sub ? <div className="sub">{sub}</div> : null}
            </div>
            <button type="button" className="xbtn" onClick={onClose} aria-label="Close">
              <Icon name="x" />
            </button>
          </div>
        </div>
        <div className="sh-body">{children}</div>
        {footer ? <div className="sh-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  icon,
  action,
}: {
  title: ReactNode;
  icon?: IconName;
  action?: ReactNode;
}) {
  return (
    <header className="page-h">
      <h1>
        {icon && <Icon name={icon} size={26} />}
        {title}
      </h1>
      {action}
    </header>
  );
}

/** An on/off switch. */
export function Switch({
  on,
  onChange,
  label,
  disabled,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      className={cx('switch', on && 'on')}
      onClick={() => onChange(!on)}
    >
      <span />
    </button>
  );
}

/**
 * An "i" button with more detail in a popover: shown while a mouse hovers it, or kept open
 * by a tap or click until you tap elsewhere or press Escape.
 */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const [pinned, setPinned] = useState(false);
  const [hover, setHover] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();
  const open = pinned || hover;
  useEffect(() => {
    if (!open) return;
    const close = () => {
      setPinned(false);
      setHover(false);
    };
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <span
      ref={ref}
      className="infotip"
      onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        className={cx(open && 'on')}
        onClick={() => setPinned((p) => !p)}
      >
        <Icon name="info" size={16} />
      </button>
      {open && (
        // The top padding bridges the gap, so a mouse can move from the icon into it.
        <span id={id} role="note" className="infotip-pop">
          <span>{children}</span>
        </span>
      )}
    </span>
  );
}

type SlideToggleProps<T extends string> = {
  /** [value, label], or [value, label, tone]: a chosen option with a tone is tinted by it. */
  options: readonly (readonly [T, ReactNode] | readonly [T, ReactNode, Tone | undefined])[];
  label: string;
  className?: string;
} & (
  | { value: T | null | undefined; onChange: (v: T) => void; allowClear?: false }
  /** Tapping the chosen option again clears it; no thumb shows while nothing is chosen. */
  | { value: T | null | undefined; onChange: (v: T | null) => void; allowClear: true }
);

/**
 * A few options as one sliding toggle: the thumb slides to the chosen one. Options share the
 * width equally; one whose label needs more room grows to fit it, and when they can't all fit
 * the toggle scrolls sideways. The thumb is measured from the chosen option. An option with a
 * tone (good, warn, bad, blue) tints the thumb and its label when chosen; others use the accent.
 */
export function SlideToggle<T extends string>(props: SlideToggleProps<T>) {
  const { options, label, className } = props;
  const index = options.findIndex(([v]) => v === props.value);
  const n = options.length;
  const tone = index >= 0 ? options[index]![2] : undefined;
  const track = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const el = track.current;
    if (!el) return;
    const measure = () => {
      const b = index >= 0 ? el.querySelectorAll<HTMLElement>(':scope > button')[index] : undefined;
      setThumb((t) =>
        !b
          ? null
          : t && t.left === b.offsetLeft && t.width === b.offsetWidth
            ? t
            : { left: b.offsetLeft, width: b.offsetWidth },
      );
      // Keep the chosen option in view when the toggle scrolls.
      if (b && el.scrollWidth > el.clientWidth) {
        if (b.offsetLeft < el.scrollLeft) el.scrollLeft = b.offsetLeft - 4;
        else if (b.offsetLeft + b.offsetWidth > el.scrollLeft + el.clientWidth)
          el.scrollLeft = b.offsetLeft + b.offsetWidth - el.clientWidth + 4;
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    for (const c of el.querySelectorAll(':scope > button')) ro.observe(c);
    return () => ro.disconnect();
  }, [index, n]);
  const pick = (v: T) => {
    if (props.allowClear) props.onChange(v === props.value ? null : v);
    else props.onChange(v);
  };
  return (
    <div
      ref={track}
      role="tablist"
      aria-label={label}
      className={cx('slide', className)}
      style={{ gridTemplateColumns: `repeat(${n}, minmax(max-content, 1fr))` }}
    >
      {thumb && (
        <span
          aria-hidden="true"
          className={cx('slide-thumb', tone && 't-' + tone)}
          style={{ width: thumb.width, transform: `translateX(${thumb.left}px)` }}
        />
      )}
      {options.map(([v, text], i) => (
        <button
          key={v}
          type="button"
          role="tab"
          className={i === index && tone ? 't-' + tone : undefined}
          aria-selected={i === index}
          onClick={() => pick(v)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/** The filter icon button that opens a list's filters, with how many are set. */
export function FilterButton({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      className={cx('filter-btn', count > 0 && 'on')}
      onClick={onClick}
      aria-label={count ? `Filters, ${count} set` : 'Filters'}
    >
      <Icon name="filter" size={18} />
      {count > 0 && <span className="badge">{count}</span>}
    </button>
  );
}

/** The filters drawer: a sheet with sections, Clear and Done. */
export function FilterSheet({
  onClose,
  onClear,
  count,
  children,
}: {
  onClose: () => void;
  onClear: () => void;
  count: number;
  children: ReactNode;
}) {
  return (
    <Sheet
      title="Filters"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn left" onClick={onClear} disabled={!count}>
            Clear
          </button>
          <button type="button" className="btn primary" onClick={onClose}>
            Done
          </button>
        </>
      }
    >
      <div className="filters">{children}</div>
    </Sheet>
  );
}

/** One titled group of choices inside the filters drawer. */
export function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="fgroup">
      <div className="lbl">{title}</div>
      {children}
    </section>
  );
}
