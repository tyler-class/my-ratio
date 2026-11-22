import type { BeanStatus } from '@shared/lookups';
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { fmtN } from '@shared/logic/units';
import type { Tone } from '@shared/lookups';
import { useFolded } from '../lib/view';
import { Icon, isCeramic, type IconName } from './Icon';

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
  // A value typed in earlier shows as its own chip, chosen.
  const all = value && !options.includes(value) ? [...options, value] : options;
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const done = useRef(false);
  const commit = () => {
    if (done.current) return;
    done.current = true;
    const v = draft.trim();
    setTyping(false);
    setDraft('');
    if (v && v !== value) onChange(v);
  };
  return (
    <div className="seg">
      {all.map((o) => (
        <button
          key={o}
          type="button"
          className={cx('chip', small && 'sm')}
          aria-pressed={value === o}
          onClick={() => onChange(value === o ? '' : o)}
        >
          {o}
        </button>
      ))}
      {typing ? (
        <input
          className="in chip-in"
          style={{ maxWidth: 220 }}
          autoFocus
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Escape') {
              done.current = true;
              setTyping(false);
              setDraft('');
            }
          }}
          onBlur={commit}
        />
      ) : (
        <button
          type="button"
          className={cx('chip new', small && 'sm')}
          onClick={() => {
            done.current = false;
            setTyping(true);
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
  /** A line icon before the group's label. */
  icon?: IconName;
  /** Or a badge before it (a bag status's coloured blob). */
  badge?: ReactNode;
  /** A class for the group's heading (a bag status: st-resting colours it). */
  className?: string;
  /** `sub` follows the label, not bold (a bean's roaster after its name). */
  options: { value: string; label: string; sub?: string }[];
}

/** Calls `onClose` when `open` goes from true to false. */
function useClosed(open: boolean, onClose?: () => void) {
  const was = useRef(open);
  const cb = useRef(onClose);
  useEffect(() => {
    cb.current = onClose;
  });
  useEffect(() => {
    if (was.current && !open) cb.current?.();
    was.current = open;
  }, [open]);
}

/**
 * Pick several from a long list: the field shows the chosen ones as pills (× removes one); open,
 * a search box filters the list, each tap adds or removes one, and a name that isn't listed can
 * be added. Closes on a tap outside or Escape.
 */
/**
 * When a dropdown opens, scroll the page (or the sheet it's in) just enough to show all of it:
 * nothing hidden under the phone's tab bar, where a tap would land on the bar instead.
 * (.sel-list's scroll margins keep it clear of the bar.)
 */
function useRevealList(open: boolean, list: React.RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    if (open) list.current?.scrollIntoView({ block: 'nearest' });
  }, [open, list]);
}

export function MultiSelect({
  value,
  options,
  onChange,
  decorate = (o) => o,
  placeholder = '',
  label,
  startOpen = false,
  single = false,
  onClose,
}: {
  value: string[];
  options: string[];
  onChange: (v: string[]) => void;
  decorate?: (o: string) => string;
  placeholder?: string;
  label: string;
  startOpen?: boolean;
  /** Just one: picking replaces it and closes the list (tap it again to clear). */
  single?: boolean;
  /** The list closed (a tap outside, Escape, or a single pick). */
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(startOpen);
  useClosed(open, onClose);
  const [q, setQ] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const listEl = useRef<HTMLDivElement>(null);
  useRevealList(open, listEl);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);
  const toggle = (o: string) => {
    if (single) {
      onChange(value.includes(o) ? [] : [o]);
      setOpen(false);
      return;
    }
    onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o]);
  };
  const all = [...value.filter((v) => !options.includes(v)), ...options];
  const needle = q.trim().toLowerCase();
  const shown = needle ? all.filter((o) => o.toLowerCase().includes(needle)) : all;
  const exact = all.some((o) => o.toLowerCase() === needle);
  return (
    <div className="sel msel" ref={root}>
      <div
        className={cx('in msel-field', open && 'open')}
        role="button"
        tabIndex={0}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((x) => !x)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {value.length ? (
          value.map((v) => (
            <span className="msel-pill" key={v}>
              {decorate(v)}
              <button
                type="button"
                aria-label={`Remove ${v}`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(v);
                }}
              >
                ×
              </button>
            </span>
          ))
        ) : (
          <span className="msel-ph">{placeholder}</span>
        )}
        <Icon name="chev" size={16} />
      </div>
      {open && (
        <div
          ref={listEl}
          className="sel-list msel-list"
          role="listbox"
          aria-multiselectable={!single}
          aria-label={label}
        >
          <input
            ref={search}
            className="in msel-q"
            autoFocus
            value={q}
            placeholder="Search or add new"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                // Close the list, not the sheet it's in.
                e.nativeEvent.stopPropagation();
                setOpen(false);
              }
              if (e.key === 'Enter') {
                e.preventDefault();
                // The top match; a new value only when nothing matches.
                const hit = shown.find((o) => o.toLowerCase() === needle) ?? shown[0];
                if (hit) toggle(hit);
                else if (needle) toggle(q.trim());
                setQ('');
              }
            }}
          />
          {/* Only the options scroll: the search box and Add new stay put, over nothing. */}
          <div className="msel-opts">
            {shown.map((o) => (
              <button
                key={o}
                type="button"
                role="option"
                aria-selected={value.includes(o)}
                className="sel-opt"
                onClick={() => toggle(o)}
              >
                <span>{decorate(o)}</span>
                {value.includes(o) && <Icon name="check" size={16} />}
              </button>
            ))}
          </div>
          {/* Pinned at the bottom: adds what's typed, or (nothing typed yet) goes to the search
              box to type a new one. */}
          {!exact && (
            <button
              type="button"
              className="sel-opt msel-add"
              onClick={() => {
                if (!needle) return search.current?.focus();
                toggle(q.trim());
                setQ('');
              }}
            >
              <Icon name="plus" size={16} />
              <span>{needle ? `Add “${q.trim()}”` : 'Add new'}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** A styled dropdown: a field-like button that opens a list below it. */
export function Select({
  value,
  onChange,
  groups,
  placeholder = '',
  startOpen = false,
  onClose,
}: {
  value: string;
  onChange: (v: string) => void;
  groups: SelectGroup[];
  placeholder?: string;
  /** Open the list straight away (editing a field in place). */
  startOpen?: boolean;
  /** The list closed. */
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(startOpen);
  useClosed(open, onClose);
  const [hi, setHi] = useState(-1);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const listId = useId();
  useRevealList(open, list);
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
        <span className="sel-val">
          {current ? (
            current.sub ? (
              <span className="sel-two">
                <b>{current.label}</b>
                <span className="sel-sub">{current.sub}</span>
              </span>
            ) : (
              current.label
            )
          ) : (
            placeholder
          )}
        </span>
        <Icon name="chevDown" size={16} />
      </button>
      {open && (
        <div className="sel-list" role="listbox" id={listId} ref={list}>
          {groups.map((g, gi) =>
            g.options.length ? (
              <div key={g.label ?? gi} role="group" aria-label={g.label}>
                {g.label && (
                  <div className={cx('sel-grp', g.className)}>
                    {g.badge ?? (g.icon && <Icon name={g.icon} size={14} />)}
                    {g.label}
                  </div>
                )}
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
                      <span>
                        {o.sub ? (
                          <span className="sel-two">
                            <b>{o.label}</b>
                            <span className="sel-sub">{o.sub}</span>
                          </span>
                        ) : (
                          o.label
                        )}
                      </span>
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
        placeholder={placeholder}
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
  action,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  /** A small text button at the right of the label's line (e.g. Open Bean). */
  action?: ReactNode;
}) {
  return (
    <div className={cx('fg', className)}>
      {action ? (
        <div className="lbl-row">
          <label className="lbl">{label}</label>
          {action}
        </div>
      ) : (
        <label className="lbl">{label}</label>
      )}
      {children}
    </div>
  );
}

/**
 * A delete button. With `ask` (deleting a bag, roaster or brew), it asks first in a small pop-up
 * over everything: the question, an optional line under it, Cancel and Delete. Without it, two
 * taps: the first arms it, the second confirms.
 */
export function ConfirmButton({
  children,
  confirm,
  onConfirm,
  className,
  ask,
  detail,
}: {
  children: ReactNode;
  /** The armed button's text (two-tap mode). */
  confirm?: string;
  onConfirm: () => void;
  className?: string;
  /** The pop-up's question ("Delete Colombia?"). */
  ask?: string;
  /** A line under the question ("Its 6 brews go too."). */
  detail?: string;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed || ask) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed, ask]);
  return (
    <>
      <button
        type="button"
        className={cx('btn ghost danger', className)}
        onClick={() => (armed && !ask ? onConfirm() : setArmed(true))}
      >
        <Icon name="trash" size={16} />
        {armed && !ask ? confirm : children}
      </button>
      {ask && armed && (
        <ConfirmDialog
          question={ask}
          detail={detail}
          action={children}
          onCancel={() => setArmed(false)}
          onConfirm={() => {
            setArmed(false);
            onConfirm();
          }}
        />
      )}
    </>
  );
}

/** "Are you sure?" over everything (sheets included): Cancel, or the red action. */
function ConfirmDialog({
  question,
  detail,
  action,
  onCancel,
  onConfirm,
}: {
  question: string;
  detail?: string;
  action: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const id = useId();
  useEffect(() => {
    // Escape closes this pop-up only, not the sheet under it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      onCancel();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onCancel]);
  return createPortal(
    <div className="cdlg-ov">
      <div className="cdlg-scrim" onClick={onCancel} />
      <div role="alertdialog" aria-modal="true" aria-labelledby={id} className="cdlg">
        <h2 id={id}>{question}</h2>
        {detail && <p className="sub">{detail}</p>}
        <div className="cdlg-acts">
          <button type="button" className="btn" autoFocus onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn danger-solid" onClick={onConfirm}>
            <Icon name="trash" size={16} />
            {action}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * A sheet that rises from the bottom on phones (drag the handle down to dismiss, up to
 * expand) and opens as a centered dialog on wider screens. Nothing done inside it shrinks it:
 * once it has grown (a longer tab, more fields), it keeps that height while it's open. A `full`
 * sheet (a bag) is always fully open, one height only.
 */
export function Sheet({
  title,
  sub,
  onClose,
  children,
  footer,
  full,
}: {
  title: ReactNode;
  sub?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  full?: boolean;
}) {
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);
  // The tallest it has been while open: it never shrinks back below that.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || full || typeof ResizeObserver === 'undefined') return;
    let tallest = 0;
    const ro = new ResizeObserver(() => {
      const h = el.getBoundingClientRect().height;
      if (h > tallest + 0.5) {
        tallest = h;
        el.style.setProperty('--sheet-min', `${h}px`);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [full]);
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
      } else if (d < -40 && !full) setExpanded(true);
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
        ref={box}
        className={cx('sheet', (expanded || full) && 'expanded', full && 'full')}
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
  options: readonly (
    readonly [T, ReactNode] | readonly [T, ReactNode, Tone | `st-${BeanStatus}` | undefined]
  )[];
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
 * tone (good, warn, bad, blue, gray, orange) tints the thumb and its label when chosen; others use the accent.
 * A bag status as the tone (st-drinking …) uses that status's own colours, as on Home's timeline.
 */
/** A titled group of fields in a form, on its own card. */
export function FormSection({
  icon,
  title,
  children,
}: {
  icon: IconName;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="form-sec">
      <h3>
        <Icon name={icon} size={17} />
        {title}
      </h3>
      {children}
    </section>
  );
}

/** Irregular clay blobs behind the status steps (one shape per step, like the tab bar icons). */
export const STEP_BLOBS = [
  'M63.0 32.0C62.8 33.7 62.3 35.5 61.6 37.2C61.0 38.8 60.0 40.4 59.1 41.8C58.1 43.3 57.0 44.6 56.0 45.8C54.9 47.1 53.8 48.2 52.7 49.4C51.7 50.6 50.6 51.7 49.5 52.9C48.4 54.0 47.3 55.2 46.0 56.2C44.7 57.3 43.3 58.3 41.8 59.0C40.3 59.8 38.7 60.4 37.0 60.7C35.4 61.0 33.6 61.1 32.0 61.0C30.3 60.8 28.6 60.5 27.0 60.0C25.4 59.6 23.9 59.0 22.3 58.4C20.8 57.8 19.3 57.2 17.8 56.5C16.3 55.8 14.8 55.1 13.3 54.2C11.9 53.3 10.4 52.3 9.1 51.2C7.8 50.0 6.5 48.7 5.5 47.2C4.5 45.8 3.7 44.1 3.2 42.4C2.7 40.7 2.4 38.9 2.3 37.2C2.2 35.4 2.4 33.7 2.6 32.0C2.8 30.3 3.2 28.6 3.6 27.0C4.0 25.3 4.5 23.7 5.1 22.2C5.7 20.6 6.3 19.1 7.1 17.6C7.8 16.1 8.7 14.6 9.8 13.3C10.8 12.0 12.0 10.8 13.3 9.7C14.6 8.6 16.0 7.7 17.5 7.0C19.0 6.2 20.6 5.7 22.2 5.2C23.8 4.8 25.5 4.5 27.1 4.3C28.7 4.1 30.3 4.0 32.0 4.0C33.6 4.0 35.2 4.2 36.8 4.4C38.4 4.7 40.0 5.0 41.6 5.5C43.1 6.0 44.7 6.6 46.2 7.3C47.7 8.1 49.1 8.9 50.5 9.9C51.9 10.8 53.2 11.9 54.4 13.1C55.7 14.3 56.9 15.5 58.0 16.9C59.1 18.3 60.1 19.8 60.9 21.4C61.7 23.0 62.3 24.8 62.7 26.5C63.0 28.3 63.1 30.2 63.0 32.0Z',
  'M62.9 32.0C62.7 33.7 62.4 35.5 61.8 37.2C61.3 38.9 60.6 40.6 59.8 42.1C59.0 43.6 58.1 45.1 57.1 46.4C56.0 47.8 54.9 49.1 53.8 50.3C52.6 51.4 51.3 52.5 50.0 53.5C48.7 54.4 47.3 55.3 45.9 56.1C44.5 56.8 43.0 57.5 41.5 58.1C39.9 58.6 38.4 59.1 36.8 59.5C35.2 59.9 33.6 60.2 32.0 60.4C30.3 60.5 28.6 60.6 26.9 60.4C25.3 60.3 23.5 60.0 22.0 59.4C20.4 58.9 18.8 58.1 17.4 57.2C16.0 56.3 14.6 55.2 13.5 54.0C12.3 52.8 11.3 51.5 10.3 50.1C9.3 48.8 8.4 47.4 7.6 46.0C6.7 44.6 5.8 43.2 5.0 41.7C4.2 40.3 3.4 38.7 2.8 37.1C2.1 35.5 1.5 33.7 1.2 32.0C1.0 30.2 0.9 28.3 1.1 26.5C1.3 24.7 1.9 22.9 2.7 21.3C3.5 19.7 4.6 18.2 5.8 16.8C7.0 15.5 8.4 14.4 9.8 13.3C11.1 12.3 12.6 11.4 14.0 10.6C15.4 9.7 16.8 8.9 18.2 8.1C19.6 7.4 21.0 6.6 22.5 5.9C24.0 5.3 25.5 4.6 27.1 4.2C28.6 3.8 30.3 3.5 32.0 3.5C33.6 3.5 35.3 3.7 36.9 4.0C38.5 4.3 40.1 4.9 41.6 5.6C43.1 6.2 44.5 7.0 45.9 7.8C47.3 8.7 48.6 9.5 50.0 10.5C51.3 11.4 52.7 12.4 54.0 13.5C55.3 14.6 56.6 15.7 57.7 17.1C58.8 18.4 59.9 19.9 60.7 21.5C61.5 23.1 62.2 24.8 62.5 26.6C62.9 28.3 63.0 30.2 62.9 32.0Z',
  'M60.4 32.0C60.7 33.6 60.9 35.3 60.8 37.0C60.7 38.7 60.4 40.5 59.8 42.1C59.3 43.7 58.5 45.3 57.7 46.8C56.8 48.3 55.7 49.7 54.6 50.9C53.4 52.2 52.1 53.4 50.8 54.4C49.5 55.5 48.1 56.5 46.6 57.4C45.2 58.2 43.6 59.0 42.0 59.6C40.4 60.2 38.8 60.7 37.1 61.1C35.4 61.4 33.7 61.6 32.0 61.6C30.2 61.6 28.5 61.4 26.8 61.1C25.1 60.8 23.4 60.4 21.8 59.8C20.2 59.2 18.6 58.4 17.2 57.6C15.7 56.7 14.3 55.7 13.0 54.5C11.8 53.4 10.6 52.1 9.6 50.7C8.7 49.3 7.8 47.8 7.2 46.3C6.5 44.7 6.1 43.1 5.7 41.5C5.3 39.9 5.1 38.3 4.9 36.7C4.8 35.1 4.7 33.5 4.7 32.0C4.7 30.4 4.7 28.8 4.8 27.2C5.0 25.6 5.1 23.9 5.5 22.3C5.8 20.7 6.3 19.1 6.9 17.5C7.6 16.0 8.4 14.4 9.4 13.0C10.4 11.7 11.6 10.4 12.9 9.2C14.1 8.1 15.6 7.1 17.1 6.2C18.5 5.3 20.1 4.5 21.7 3.8C23.3 3.2 25.0 2.6 26.7 2.2C28.4 1.8 30.2 1.5 32.0 1.4C33.7 1.3 35.6 1.3 37.3 1.7C39.0 2.0 40.8 2.6 42.4 3.3C44.0 4.1 45.5 5.2 46.8 6.3C48.1 7.5 49.2 8.9 50.2 10.2C51.2 11.6 52.0 13.0 52.8 14.4C53.6 15.8 54.3 17.2 55.0 18.6C55.7 20.0 56.4 21.4 57.1 22.8C57.8 24.2 58.5 25.7 59.0 27.2C59.6 28.7 60.1 30.3 60.4 32.0Z',
  'M62.6 32.0C62.7 33.7 62.6 35.6 62.3 37.3C61.9 39.0 61.3 40.8 60.5 42.3C59.7 43.9 58.6 45.4 57.5 46.7C56.3 48.0 55.0 49.2 53.7 50.2C52.4 51.3 51.0 52.2 49.7 53.1C48.3 54.0 47.0 54.8 45.6 55.6C44.2 56.3 42.8 57.1 41.3 57.7C39.9 58.3 38.3 58.9 36.8 59.4C35.2 59.8 33.6 60.1 32.0 60.2C30.3 60.3 28.6 60.2 27.0 60.0C25.4 59.8 23.8 59.3 22.2 58.8C20.6 58.3 19.1 57.6 17.6 56.9C16.0 56.2 14.6 55.3 13.1 54.4C11.7 53.5 10.2 52.5 8.9 51.3C7.6 50.1 6.2 48.8 5.2 47.4C4.2 46.0 3.2 44.3 2.6 42.6C2.0 41.0 1.6 39.1 1.5 37.3C1.4 35.5 1.7 33.7 2.0 32.0C2.4 30.2 3.1 28.6 3.7 27.0C4.4 25.4 5.2 23.9 6.0 22.5C6.7 21.1 7.5 19.7 8.4 18.3C9.2 17.0 10.0 15.6 10.9 14.3C11.8 12.9 12.7 11.6 13.8 10.3C14.9 9.1 16.1 7.9 17.5 6.9C18.8 5.9 20.3 5.0 21.9 4.3C23.5 3.7 25.2 3.2 26.8 3.0C28.5 2.7 30.3 2.7 32.0 2.8C33.6 2.9 35.3 3.2 37.0 3.6C38.6 4.0 40.2 4.5 41.7 5.2C43.2 5.8 44.7 6.5 46.2 7.4C47.6 8.2 49.0 9.1 50.2 10.2C51.5 11.2 52.8 12.3 53.9 13.5C55.0 14.8 56.1 16.1 57.1 17.4C58.1 18.8 59.0 20.3 59.7 21.8C60.5 23.4 61.2 25.0 61.7 26.7C62.2 28.4 62.5 30.2 62.6 32.0Z',
  'M60.8 32.0C60.8 33.6 60.8 35.3 60.6 37.0C60.4 38.7 60.1 40.4 59.7 42.1C59.3 43.7 58.8 45.4 58.1 47.1C57.4 48.7 56.6 50.3 55.6 51.8C54.6 53.3 53.4 54.7 52.0 55.9C50.7 57.0 49.1 58.0 47.4 58.7C45.8 59.4 43.9 59.8 42.1 59.9C40.4 60.1 38.6 59.9 36.9 59.7C35.2 59.6 33.5 59.1 32.0 58.8C30.4 58.4 28.9 58.0 27.4 57.7C25.9 57.4 24.4 57.1 22.9 56.8C21.3 56.5 19.7 56.3 18.1 55.9C16.5 55.5 14.8 55.0 13.3 54.2C11.8 53.4 10.2 52.4 9.0 51.3C7.7 50.1 6.6 48.6 5.7 47.1C4.9 45.6 4.3 43.9 3.9 42.2C3.4 40.5 3.2 38.7 3.1 37.0C3.0 35.3 3.0 33.6 3.0 32.0C3.1 30.3 3.2 28.6 3.4 26.9C3.6 25.2 3.9 23.6 4.4 21.9C4.8 20.3 5.4 18.6 6.2 17.1C7.0 15.6 8.0 14.1 9.2 12.8C10.3 11.6 11.6 10.4 13.0 9.4C14.4 8.4 15.9 7.6 17.4 6.8C19.0 6.1 20.6 5.5 22.1 5.0C23.7 4.5 25.3 4.1 27.0 3.7C28.6 3.4 30.3 3.2 32.0 3.2C33.6 3.1 35.3 3.2 37.0 3.4C38.6 3.7 40.3 4.2 41.8 4.8C43.4 5.4 44.9 6.2 46.3 7.1C47.7 8.0 49.0 9.1 50.2 10.2C51.4 11.3 52.5 12.5 53.6 13.8C54.6 15.1 55.6 16.4 56.4 17.8C57.2 19.2 58.0 20.7 58.6 22.2C59.3 23.8 59.8 25.4 60.1 27.0C60.5 28.6 60.7 30.3 60.8 32.0Z',
];

/**
 * A path of steps (a bag's status: Ordered → … → Finished): each an icon on a clay blob, joined
 * by a line that's brown up to the current step. The current step is a solid brown blob with a
 * bold label. Tap a step to move there.
 */
export function StatusPath<T extends string>({
  label,
  value,
  options,
  onChange,
  from,
  art,
}: {
  label: string;
  value: T | null | undefined;
  options: readonly (readonly [T, string, IconName?])[];
  onChange: (v: T) => void;
  /** Where it was before an unsaved change: that step is marked too, so the change shows. */
  from?: T | null;
  /** The current step's own art, drawn on its blob (a bag's status: StatusArt). */
  art?: (v: T, blob: string) => ReactNode;
}) {
  const at = options.findIndex(([v]) => v === value);
  const was = from && from !== value ? from : null;
  return (
    <div
      className="spath"
      role="radiogroup"
      aria-label={label}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map(([v, text, icon], i) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={i === at}
          data-step={v}
          className={cx('spath-step', at >= 0 && i < at && 'done', v === was && 'was')}
          onClick={() => onChange(v)}
        >
          <span className="spath-blob">
            {art && i === at ? (
              art(v, STEP_BLOBS[i % STEP_BLOBS.length]!)
            ) : (
              <>
                <svg className="spath-shape" viewBox="0 0 64 64" aria-hidden="true">
                  <path d={STEP_BLOBS[i % STEP_BLOBS.length]} />
                </svg>
                {icon && <Icon name={icon} size={20} />}
              </>
            )}
          </span>
          <span className="spath-label">{text}</span>
        </button>
      ))}
    </div>
  );
}

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

/**
 * A section that folds open and shut: the whole header row toggles it, the chevron turns
 * over, and the body slides. Whether it is open is remembered on this device.
 */
export function Fold({
  id,
  title,
  icon,
  className,
  children,
}: {
  id: string;
  title: ReactNode;
  icon?: IconName;
  className?: string;
  children: ReactNode;
}) {
  const [open, toggle] = useFolded(id);
  const bodyId = useId();
  return (
    <div className={cx('fold', open && 'open', className)}>
      <button
        type="button"
        className="fold-h"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={toggle}
      >
        {icon && <Icon name={icon} size={16} />}
        <span className="fold-t">{title}</span>
        <Icon name="chevDown" size={16} className="fold-chev" />
      </button>
      <div className="fold-b" id={bodyId} inert={!open}>
        <div>{children}</div>
      </div>
    </div>
  );
}

/** Nothing to show: an icon in a soft circle, a headline and one line. */
export function Empty({
  icon,
  title,
  children,
  className,
}: {
  icon: IconName;
  title: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('empty', className)}>
      {isCeramic(icon) ? (
        <Icon name={icon} size={38} className="empty-ceramic" />
      ) : (
        <span className="empty-ic">
          <Icon name={icon} size={22} />
        </span>
      )}
      <div className="empty-t">{title}</div>
      {children ? <div className="empty-l">{children}</div> : null}
    </div>
  );
}

/**
 * A row of tags that shows the first few and folds the rest into a "+N" pill. The pill shows
 * them in a pop-out: while a mouse hovers it, or after a tap until you tap elsewhere.
 */
export function TagRow({
  tags,
  max = 3,
  tone = 'acc',
}: {
  tags: string[];
  max?: number;
  tone?: string;
}) {
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
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  // One extra would take the pill's own room: show it instead.
  const cut = tags.length > max + 1 ? max : tags.length;
  const rest = tags.slice(cut);
  return (
    <div className="tags">
      {tags.slice(0, cut).map((t) => (
        <span className={cx('tag', tone)} key={t}>
          {t}
        </span>
      ))}
      {rest.length > 0 && (
        <span
          ref={ref}
          className="tag-more"
          onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(true)}
          onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(false)}
          // Inside a tappable card: the pill opens its pop-out, not the card.
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="tag"
            aria-label={`${rest.length} more: ${rest.join(', ')}`}
            aria-expanded={open}
            aria-controls={id}
            onClick={() => setPinned((p) => !p)}
          >
            +{rest.length}
          </button>
          {open && (
            <span id={id} role="note" className="tag-pop">
              <span className="tags">
                {rest.map((t) => (
                  <span className={cx('tag', tone)} key={t}>
                    {t}
                  </span>
                ))}
              </span>
            </span>
          )}
        </span>
      )}
    </div>
  );
}

/** A notes field that grows with its text instead of needing a manual resize. */
export function NotesField(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || CSS.supports('field-sizing', 'content')) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [props.value]);
  return <textarea ref={ref} {...props} className={cx('in', props.className)} />;
}
