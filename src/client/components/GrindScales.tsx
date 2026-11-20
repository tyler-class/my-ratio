// Settings → Equipment: each grinder's grind scale. A known grinder uses its maker's dial by
// default and can be switched to a custom scale; a grinder the owner added has no default, just
// its own scale (1 to 10, one decimal, until edited): numbers A to B with N steps between,
// stepless, or a write-in.
import { useState } from 'react';
import {
  DEFAULT_SCALE,
  describeScale,
  formatGrind,
  GRINDER_PRESETS,
  byName,
  isScale,
  middleOf,
  presetFor,
  scaleFor,
  stepGrind,
  STEPLESS_BETWEEN,
  type GrindScale,
  type StepScale,
} from '@shared/grind';
import { parseNum } from '../lib/format';
import { Icon } from './Icon';
import { MultiSelect, SlideToggle } from './ui';
import { useToast } from './Toast';

export function GrindScales({
  grinders,
  scales,
  onSave,
}: {
  grinders: string[];
  scales: Record<string, GrindScale>;
  onSave: (p: { grinders?: string[]; grind_scales?: Record<string, GrindScale> }) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const toast = useToast();
  // Only grinders still listed keep a saved scale.
  const kept = (list: string[], drop?: string) =>
    Object.fromEntries(Object.entries(scales).filter(([k]) => k !== drop && list.includes(k)));
  const save = (name: string, sc: GrindScale | null) => {
    const next = kept(grinders, name);
    if (sc) next[name] = sc;
    onSave({ grind_scales: next });
  };
  const add = (name: string) => {
    const n = name.trim();
    if (!n || grinders.includes(n)) return;
    // Added closed: open it to change its scale.
    onSave({ grinders: byName([...grinders, n]) });
  };
  const remove = (name: string) => {
    const before = { grinders, grind_scales: scales };
    const list = grinders.filter((x) => x !== name);
    onSave({ grinders: list, grind_scales: kept(list) });
    if (open === name) setOpen(null);
    toast({ text: `Removed ${name}`, action: { label: 'Undo', run: () => onSave(before) } });
  };
  return (
    <div className="gs">
      {byName(grinders).map((g) => {
        const sc = scaleFor(g, scales);
        const preset = presetFor(g);
        const own = !!scales[g];
        const isOpen = open === g;
        return (
          <div className={`gs-row${isOpen ? ' open' : ''}`} key={g}>
            <button
              type="button"
              className="gs-h"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : g)}
            >
              <span className="gs-t">
                <span className="gs-n">
                  {g}
                  {preset && (
                    <span className={`gs-tag${own ? ' custom' : ''}`}>
                      {own ? 'Custom' : 'Default'}
                    </span>
                  )}
                </span>
                <span className="gs-d">{describeScale(sc)}</span>
              </span>
              <Icon name="chevDown" size={16} className="gs-chev" />
            </button>
            {/* The editor opens inside the grinder's own card, under a divider. */}
            <div className="gs-b" inert={!isOpen}>
              <div>
                <div className="gs-rule" />
                <div className="gs-ed">
                  {preset && (
                    <div className="fg">
                      <SlideToggle
                        label={`${g} scale`}
                        className="fit"
                        value={own ? 'custom' : 'default'}
                        options={[
                          ['default', 'Default'],
                          ['custom', 'Custom'],
                        ]}
                        // Custom starts from the default and is edited from there.
                        onChange={(v) => save(g, v === 'custom' ? preset.scale : null)}
                      />
                    </div>
                  )}
                  {preset && !own ? (
                    <div className="gs-def">
                      <b>{preset.note}</b>
                      <span>{example(preset.scale)}</span>
                    </div>
                  ) : (
                    <ScaleEditor
                      key={JSON.stringify(sc)}
                      scale={sc}
                      onChange={(next) => save(g, next)}
                    />
                  )}
                  <button type="button" className="btn sm gs-rm" onClick={() => remove(g)}>
                    <Icon name="trash" size={13} /> Remove grinder
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
      {/* Known grinders come with their dial; any other name is added as a custom one. */}
      <div className="gs-add">
        <MultiSelect
          single
          key={grinders.length}
          label="Add a grinder"
          placeholder="+ Add a grinder"
          value={[]}
          options={byName(GRINDER_PRESETS.map((p) => p.name).filter((n) => !grinders.includes(n)))}
          onChange={(v) => v[0] && add(v[0])}
        />
      </div>
    </div>
  );
}

type Dial = 'steps' | 'stepless' | 'text';
const DIALS = [
  ['steps', 'Numbers'],
  ['stepless', 'Stepless'],
  ['text', 'Write-in'],
] as const;
const dialOf = (s: GrindScale): Dial =>
  s.kind === 'text' ? 'text' : s.between === STEPLESS_BETWEEN ? 'stepless' : 'steps';

function ScaleEditor({
  scale,
  onChange,
}: {
  scale: GrindScale;
  onChange: (s: GrindScale) => void;
}) {
  // Switching to numbers from a write-in starts from 1 to 10, one decimal.
  const steps: StepScale = scale.kind === 'steps' ? scale : DEFAULT_SCALE;
  const [min, setMin] = useState(String(steps.min));
  const [max, setMax] = useState(String(steps.max));
  const [between, setBetween] = useState(String(steps.between));
  const commit = (p: Partial<StepScale>) => {
    const next: StepScale = { ...steps, ...p };
    if (isScale(next)) onChange(next);
    else {
      // Not a valid scale: put the fields back.
      setMin(String(steps.min));
      setMax(String(steps.max));
      setBetween(String(steps.between));
    }
  };
  const dial = dialOf(scale);
  const whole = (v: string) => {
    const n = parseNum(v);
    return n == null ? NaN : Math.round(n);
  };
  return (
    <>
      <div className="fg">
        <label className="lbl">Dial</label>
        <SlideToggle
          label="Dial"
          className="fit"
          value={dial}
          options={DIALS}
          onChange={(v) => {
            if (v === 'text') onChange({ kind: 'text' });
            else if (v === 'stepless') commit({ between: STEPLESS_BETWEEN });
            // Numbers: whole numbers to start with; add steps between below.
            else commit({ between: 0 });
          }}
        />
      </div>
      {dial !== 'text' && (
        <div className="two fg">
          <div>
            <label className="lbl">From</label>
            <input
              className="in"
              inputMode="numeric"
              value={min}
              onChange={(e) => setMin(e.target.value)}
              onBlur={() => commit({ min: whole(min) })}
            />
          </div>
          <div>
            <label className="lbl">To</label>
            <input
              className="in"
              inputMode="numeric"
              value={max}
              onChange={(e) => setMax(e.target.value)}
              onBlur={() => commit({ max: whole(max) })}
            />
          </div>
        </div>
      )}
      {dial === 'steps' && (
        <div className="fg">
          <label className="lbl">Steps between numbers</label>
          <input
            className="in gs-between"
            inputMode="numeric"
            value={between}
            onChange={(e) => setBetween(e.target.value.replace(/[^\d]/g, '').slice(0, 2))}
            onBlur={() => commit({ between: whole(between) })}
          />
        </div>
      )}
      <div className="sub gs-ex">{example(scale)}</div>
    </>
  );
}

/** A few settings in a row, as they'll be written: "4, 4.1, 4.2, 5". */
function example(s: GrindScale): string {
  if (s.kind !== 'steps') return 'Type each setting as you write it, like 1.3.2.';
  const from = Math.max(s.min, Math.min(s.max - 1, middleOf(s)));
  const out: number[] = [from];
  while (out.length < Math.max(4, Math.min(s.between + 2, 5)) && out[out.length - 1]! < s.max)
    out.push(stepGrind(out[out.length - 1]!, 1, s));
  return `For example ${out.map((v) => formatGrind(v, s)).join(', ')} …`;
}
