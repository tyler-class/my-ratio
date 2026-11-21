import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ImageRef } from '@shared/types';
import { api, errorMessage, imageUrl, uploadImage } from '../lib/api';
import { prepareImage } from '../lib/image';
import { useActions } from '../lib/queries';
import { useToast } from './Toast';
import { Icon } from './Icon';

/**
 * Photos of a bag, or a roaster's logo (single: a new upload replaces the old one).
 * Files go to R2 under the record's key; the list refreshes from the server afterwards.
 * Several photos: drag one to reorder (after a short press on touch); the first is the main one,
 * shown on the bag's card.
 */
export function Photos({
  owner,
  ownerId,
  images,
  single,
}: {
  owner: 'beans' | 'roasters';
  ownerId: string;
  images: ImageRef[];
  single?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const { refresh } = useActions();
  const [viewing, setViewing] = useState<ImageRef | null>(null);
  // The order while dragging and until the server's list catches up.
  const [order, setOrder] = useState<string[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const justDragged = useRef(false);
  const byId = new Map(images.map((i) => [i.id, i]));
  const shown =
    order && order.length === images.length && order.every((id) => byId.has(id))
      ? order.map((id) => byId.get(id)!)
      : images;
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const saveOrder = async (ids: string[]) => {
    setOrder(ids);
    try {
      await api.patch(`/${owner}/${ownerId}/images/order`, { ids });
      await refresh();
    } catch (e) {
      setOrder(null); // back to the saved order
      toast({ text: errorMessage(e), tone: 'bad' });
    }
  };

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files).slice(0, single ? 1 : 10)) {
        const p = await prepareImage(f);
        await uploadImage(`/${owner}/${ownerId}/images`, p.blob, p);
      }
      if (single) for (const old of images) await api.del(`/images/${old.id}`);
      await refresh();
    } catch (e) {
      toast({ text: errorMessage(e), tone: 'bad' });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  async function remove(id: string) {
    try {
      await api.del(`/images/${id}`);
      await refresh();
    } catch (e) {
      toast({ text: errorMessage(e), tone: 'bad' });
    }
  }

  return (
    <div className="photos">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={({ active }) => {
          justDragged.current = true;
          setDragId(String(active.id));
        }}
        onDragEnd={({ active, over }) => {
          setDragId(null);
          // The click that ends a drag isn't a tap to view.
          setTimeout(() => (justDragged.current = false), 0);
          if (!over || active.id === over.id) return;
          const ids = shown.map((i) => i.id);
          void saveOrder(
            arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))),
          );
        }}
        onDragCancel={() => {
          setDragId(null);
          justDragged.current = false;
        }}
      >
        <SortableContext
          items={shown.map((i) => i.id)}
          strategy={horizontalListSortingStrategy}
          disabled={single || shown.length < 2}
        >
          {shown.map((img, i) => (
            <SortablePhoto
              key={img.id}
              img={img}
              single={single}
              main={!single && shown.length > 1 && i === 0}
              placeholder={dragId === img.id}
              onOpen={() => !justDragged.current && setViewing(img)}
              onRemove={() => remove(img.id)}
            />
          ))}
        </SortableContext>
        <DragOverlay dropAnimation={null}>
          {dragId && byId.get(dragId) ? (
            <div className="photo lifted">
              <img src={imageUrl(dragId)} alt="" />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      {(!single || images.length === 0 || busy) && (
        <button
          type="button"
          className="add-photo"
          style={single ? { height: 96 } : undefined}
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          <Icon name="camera" size={22} />
          {busy ? 'Uploading…' : single ? 'Add logo' : 'Add photo'}
        </button>
      )}
      {single && images.length > 0 && !busy && (
        <button type="button" className="btn sm" onClick={() => input.current?.click()}>
          Replace
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple={!single}
        hidden
        onChange={(e) => add(e.target.files)}
      />
      {viewing && <PhotoViewer img={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

export function Thumb({ img, className = 'thumb' }: { img?: ImageRef; className?: string }) {
  if (!img) return null;
  return <img className={className} src={imageUrl(img.id)} alt="" loading="lazy" />;
}

/** One photo in the strip: tap to view it larger, drag to move it, × to remove it. */
function SortablePhoto({
  img,
  single,
  main,
  placeholder,
  onOpen,
  onRemove,
}: {
  img: ImageRef;
  single?: boolean;
  main: boolean;
  placeholder: boolean;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: img.id,
  });
  return (
    <div
      ref={setNodeRef}
      className={`photo${placeholder ? ' slot' : ''}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <button
        type="button"
        className="photo-open"
        aria-label={
          main ? 'View photo (main photo; drag to reorder)' : 'View photo (drag to reorder)'
        }
        {...attributes}
        {...listeners}
        onClick={onOpen}
        onContextMenu={(e) => e.preventDefault()}
      >
        <img
          src={imageUrl(img.id)}
          alt=""
          loading="lazy"
          draggable={false}
          width={img.width ?? undefined}
          height={img.height ?? undefined}
          style={single ? { height: 96, background: '#fff', objectFit: 'contain' } : undefined}
        />
      </button>
      {main && <span className="photo-main">Main</span>}
      <button type="button" className="photo-rm" aria-label="Remove photo" onClick={onRemove}>
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}

const MAX_ZOOM = 5;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * A photo, larger, in a pop-out (not full screen) with × to close. Pinch, double-tap or
 * ctrl-scroll zooms the photo and a drag moves it around; the app itself doesn't zoom.
 */
export function PhotoViewer({ img, onClose }: { img: ImageRef; onClose: () => void }) {
  const stage = useRef<HTMLDivElement>(null);
  const pic = useRef<HTMLImageElement>(null);
  const [view, setView] = useState({ s: 1, x: 0, y: 0 });
  const [moving, setMoving] = useState(false);
  // The latest view, for the gesture handlers (kept beside the state, which draws it).
  const cur = useRef(view);
  const put = (v: typeof view) => {
    cur.current = v;
    setView(v);
  };
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{
    d: number;
    mx: number;
    my: number;
    s: number;
    x: number;
    y: number;
  } | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);

  useEffect(() => {
    // Escape closes the pop-out only, not the sheet under it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  /** A point relative to the middle of the stage (the zoom's origin). */
  const rel = (x: number, y: number) => {
    const r = stage.current!.getBoundingClientRect();
    return { x: x - (r.left + r.width / 2), y: y - (r.top + r.height / 2) };
  };
  /** Keep the photo covering the stage while zoomed: it can't be dragged off. */
  const fit = (s: number, x: number, y: number) => {
    if (s <= 1.01) return { s: 1, x: 0, y: 0 };
    const st = stage.current!.getBoundingClientRect();
    const w = (pic.current?.offsetWidth ?? 0) * s;
    const h = (pic.current?.offsetHeight ?? 0) * s;
    const mx = Math.max(0, (w - st.width) / 2);
    const my = Math.max(0, (h - st.height) / 2);
    return { s, x: clamp(x, -mx, mx), y: clamp(y, -my, my) };
  };
  /** Zoom to s, keeping the photo's point under p (stage-relative) where it is. */
  const zoomAt = (s: number, p: { x: number; y: number }, from = cur.current) => {
    const ns = clamp(s, 1, MAX_ZOOM);
    const k = ns / from.s;
    return fit(ns, p.x - (p.x - from.x) * k, p.y - (p.y - from.y) * k);
  };

  const startPinch = () => {
    const [a, b] = [...pts.current.values()];
    if (!a || !b) return;
    const m = rel((a.x + b.x) / 2, (a.y + b.y) / 2);
    pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: m.x, my: m.y, ...cur.current };
  };

  const onDown = (e: React.PointerEvent) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* best-effort */
    }
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setMoving(true);
    if (pts.current.size === 2) startPinch();
  };
  const onMove = (e: React.PointerEvent) => {
    const prev = pts.current.get(e.pointerId);
    if (!prev) return;
    const next = { x: e.clientX, y: e.clientY };
    pts.current.set(e.pointerId, next);
    const p = pinch.current;
    if (pts.current.size >= 2 && p) {
      const [a, b] = [...pts.current.values()];
      const m = rel((a!.x + b!.x) / 2, (a!.y + b!.y) / 2);
      const ns = clamp((p.s * Math.hypot(a!.x - b!.x, a!.y - b!.y)) / p.d, 1, MAX_ZOOM);
      const k = ns / p.s;
      // The point first under the fingers stays under them as they spread and move.
      put(fit(ns, m.x - (p.mx - p.x) * k, m.y - (p.my - p.y) * k));
    } else if (cur.current.s > 1) {
      const v = cur.current;
      put(fit(v.s, v.x + next.x - prev.x, v.y + next.y - prev.y));
    }
  };
  const onUp = (e: React.PointerEvent) => {
    const had = pts.current.size;
    pts.current.delete(e.pointerId);
    if (pts.current.size < 2) pinch.current = null;
    if (pts.current.size === 0) setMoving(false);
    if (had !== 1 || e.type !== 'pointerup') return;
    // Double-tap: zoom in there, or back out.
    const now = performance.now();
    const t = lastTap.current;
    if (t && now - t.t < 300 && Math.hypot(e.clientX - t.x, e.clientY - t.y) < 30) {
      lastTap.current = null;
      put(cur.current.s > 1 ? { s: 1, x: 0, y: 0 } : zoomAt(2.5, rel(e.clientX, e.clientY)));
    } else lastTap.current = { t: now, x: e.clientX, y: e.clientY };
  };
  // A trackpad pinch arrives as ctrl + wheel: zoom the photo, not the page (so not passive).
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    // (rel, zoomAt and put read only refs and a state setter, so the first ones serve.)
    const h = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      put(zoomAt(cur.current.s * Math.exp(-e.deltaY / 100), rel(e.clientX, e.clientY)));
    };
    el.addEventListener('wheel', h, { passive: false });
    return () => el.removeEventListener('wheel', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div className="pv-ov">
      <div className="pv-scrim" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Photo" className="pv">
        <div
          ref={stage}
          className="pv-stage"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          <img
            ref={pic}
            src={imageUrl(img.id)}
            alt=""
            draggable={false}
            className={moving ? 'moving' : undefined}
            style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` }}
          />
        </div>
        <button type="button" className="pv-x" aria-label="Close" autoFocus onClick={onClose}>
          <Icon name="x" size={18} />
        </button>
      </div>
    </div>,
    document.body,
  );
}
