// A board of panels the owner arranges: drag to reorder, half or full width, hide/show.
// Order is live while dragging (the grid reflows; the dragged card follows the pointer
// as an overlay). Half-width panels pack two to a row; the grid fills gaps densely.
// On touch a drag starts after a short press, so a swipe over a grip still scrolls.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  closestCenter,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragOverEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import type { InsightsPanel } from '@shared/types';
import { Icon, type IconName } from './Icon';
import { useToast } from './Toast';
import { cx, Fold } from './ui';

export interface PanelDef {
  id: string;
  title: string;
  icon: IconName;
  sub?: ReactNode;
  size: 'half' | 'full';
  body: ReactNode;
}

/** Saved layout merged with the panels that exist: unknown ids dropped, new ones appended. */
function resolveLayout(defs: PanelDef[], saved: InsightsPanel[]): InsightsPanel[] {
  const known = new Set(defs.map((d) => d.id));
  const out = saved.filter((p) => known.has(p.id));
  const seen = new Set(out.map((p) => p.id));
  for (const d of defs) if (!seen.has(d.id)) out.push({ id: d.id, size: d.size, hidden: false });
  return out;
}

/** True (and restarts the clock) when at least 120 ms passed since the last reorder. */
function settled(last: { current: number }) {
  const t = performance.now();
  if (t - last.current < 120) return false;
  last.current = t;
  return true;
}

// Pointer first (stable with mixed sizes), nearest center as the fallback for keyboard.
const collide: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : closestCenter(args);
};

export function PanelBoard({
  defs,
  saved,
  onSave,
}: {
  defs: PanelDef[];
  saved: InsightsPanel[];
  /** Resolves to undefined when saving failed. */
  onSave: (layout: InsightsPanel[]) => Promise<unknown>;
}) {
  const toast = useToast();
  // Local copy after the first change, so the screen never waits on the network.
  const [local, setLocal] = useState<InsightsPanel[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const lastMove = useRef(0);
  // The order before a drag, to put back if the drag is cancelled or saving fails.
  const before = useRef<InsightsPanel[] | null>(null);
  const layout = resolveLayout(defs, local ?? saved);
  // The board as it is now, for an Undo pressed a few renders later.
  const latest = useRef(layout);
  useEffect(() => {
    latest.current = layout;
  });
  const byId = new Map(defs.map((d) => [d.id, d]));
  const shown = layout.filter((p) => !p.hidden);
  const hidden = layout.filter((p) => p.hidden);

  /** Shows a change now and saves it; if saving fails, the board goes back to `prev`. */
  const commit = (next: InsightsPanel[], prev: InsightsPanel[] = layout) => {
    setLocal(next);
    void onSave(next).then((ok) => {
      if (ok === undefined) setLocal(prev);
    });
  };
  const patch = (id: string, p: Partial<InsightsPanel>) =>
    commit(layout.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const hide = (id: string) => {
    patch(id, { hidden: true });
    toast({
      text: `Hid ${byId.get(id)?.title ?? 'panel'}`,
      action: {
        label: 'Undo',
        run: () => {
          const cur = latest.current;
          commit(
            cur.map((x) => (x.id === id ? { ...x, hidden: false } : x)),
            cur,
          );
        },
      },
    });
  };

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onOver = ({ active, over }: DragOverEvent) => {
    if (!over || active.id === over.id) return;
    // Swapping panels of different sizes moves things under the pointer; a short pause
    // keeps it from flipping back and forth.
    if (!settled(lastMove)) return;
    const cur = local ?? layout;
    const from = cur.findIndex((p) => p.id === active.id);
    const to = cur.findIndex((p) => p.id === over.id);
    if (from < 0 || to < 0) return;
    setLocal(arrayMove(cur, from, to));
  };

  const active = activeId ? byId.get(activeId) : null;
  const activeSize = layout.find((p) => p.id === activeId)?.size;

  return (
    <div>
      <DndContext
        sensors={sensors}
        collisionDetection={collide}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={({ active: a }) => {
          before.current = layout;
          setLocal(layout);
          setActiveId(String(a.id));
        }}
        onDragOver={onOver}
        onDragEnd={() => {
          setActiveId(null);
          const prev = before.current ?? layout;
          before.current = null;
          if (local) commit(resolveLayout(defs, local), prev);
        }}
        onDragCancel={() => {
          setActiveId(null);
          if (before.current) setLocal(before.current);
          before.current = null;
        }}
      >
        <SortableContext items={shown.map((p) => p.id)} strategy={rectSortingStrategy}>
          <div className="pn-wrap">
            <div className="pn-grid">
              {shown.map((p) => {
                const d = byId.get(p.id)!;
                return (
                  <SortablePanel
                    key={p.id}
                    def={d}
                    size={p.size}
                    dragging={activeId === p.id}
                    onSize={() => patch(p.id, { size: p.size === 'full' ? 'half' : 'full' })}
                    onHide={() => hide(p.id)}
                  />
                );
              })}
            </div>
          </div>
        </SortableContext>
        <DragOverlay dropAnimation={null}>
          {active && activeSize ? (
            <Panel def={active} size={activeSize} overlay>
              {active.body}
            </Panel>
          ) : null}
        </DragOverlay>
      </DndContext>

      {hidden.length > 0 && (
        <Fold
          id="insights-hidden"
          className="pn-hidden"
          icon="eyeOff"
          title={`Hidden panels (${hidden.length})`}
        >
          <div className="card flat">
            {hidden.map((p) => (
              <div className="pn-hid-row" key={p.id}>
                <span>{byId.get(p.id)!.title}</span>
                <button
                  type="button"
                  className="pn-tool"
                  aria-label={`Show ${byId.get(p.id)!.title}`}
                  title="Show"
                  onClick={() => {
                    // Back at the end of the board, where it is easy to find.
                    const rest = layout.filter((x) => x.id !== p.id);
                    commit([...rest, { ...p, hidden: false }]);
                  }}
                >
                  <Icon name="eye" size={18} />
                </button>
              </div>
            ))}
          </div>
        </Fold>
      )}
    </div>
  );
}

function SortablePanel({
  def,
  size,
  dragging,
  onSize,
  onHide,
}: {
  def: PanelDef;
  size: 'half' | 'full';
  dragging: boolean;
  onSize: () => void;
  onHide: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef } = useSortable({ id: def.id });
  return (
    <Panel
      def={def}
      size={size}
      nodeRef={setNodeRef}
      placeholder={dragging}
      grip={
        <button
          type="button"
          className="pn-grip"
          // A sideways drag here moves the panel, not to the next tab.
          data-no-tab-swipe
          aria-label={`Move ${def.title}`}
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
        >
          <Icon name="grip" size={18} />
        </button>
      }
      tools={
        <>
          <button
            type="button"
            className="pn-tool pn-size"
            onClick={onSize}
            title={size === 'full' ? 'Half width' : 'Full width'}
            aria-label={
              size === 'full' ? `Make ${def.title} half width` : `Make ${def.title} full width`
            }
          >
            <Icon name={size === 'full' ? 'colHalf' : 'colFull'} size={18} />
          </button>
          <button
            type="button"
            className="pn-tool"
            onClick={onHide}
            title="Hide"
            aria-label={`Hide ${def.title}`}
          >
            <Icon name="eye" size={18} />
          </button>
        </>
      }
    >
      {def.body}
    </Panel>
  );
}

function Panel({
  def,
  size,
  children,
  nodeRef,
  grip,
  tools,
  placeholder,
  overlay,
}: {
  def: PanelDef;
  size: 'half' | 'full';
  children: ReactNode;
  nodeRef?: (el: HTMLElement | null) => void;
  grip?: ReactNode;
  tools?: ReactNode;
  placeholder?: boolean;
  overlay?: boolean;
}) {
  return (
    <section
      ref={nodeRef}
      className={cx('card pn', placeholder && 'pn-ph', overlay && 'pn-overlay')}
      data-size={size}
      data-panel={def.id}
    >
      <header className="pn-h">
        {grip ?? (
          <span className="pn-grip">
            <Icon name="grip" size={18} />
          </span>
        )}
        <div className="pn-t">
          <h3>
            <Icon name={def.icon} size={17} />
            {def.title}
          </h3>
          {def.sub ? <div className="sub">{def.sub}</div> : null}
        </div>
        {tools && <div className="pn-tools">{tools}</div>}
      </header>
      {children}
    </section>
  );
}
