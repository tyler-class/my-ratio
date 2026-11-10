import { isCurrency } from './currency';
// Request bodies. Shared so the client and Worker agree on shapes.
import { z } from 'zod';
import {
  BUY_AGAIN_KEYS,
  EXTRACTION_KEYS,
  STATUS_KEYS,
  STRENGTH_KEYS,
  normalizeStatus,
} from './lookups';

/** Optional text: blank becomes null, so clearing a field in a form clears it in the database. */
const text = (max = 2000) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((v) => (v == null || v.trim() === '' ? null : v.trim()));
const name = (max = 200) => z.string().trim().min(1, 'Required').max(max);
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .nullish()
  .transform((v) => v ?? null);
const num = (min: number, max: number) =>
  z
    .number()
    .min(min)
    .max(max)
    .nullish()
    .transform((v) => v ?? null);
const status = z.preprocess(normalizeStatus, z.enum(STATUS_KEYS));
const tags = z
  .array(z.string().trim().min(1).max(100))
  .max(30)
  .transform((a) => [...new Set(a)]);

export const loginInput = z.object({ password: z.string().min(1).max(500) });

export const settingsPatch = z
  .object({
    methods: z.array(name(60)).max(30),
    grinders: z.array(name(60)).max(30),
    temp_unit: z.enum(['F', 'C']),
    currency: z
      .string()
      .transform((v) => v.trim().toUpperCase())
      .refine(isCurrency, 'Use a currency code like USD, EUR or JPY'),
    time_zone: z.string().min(1).max(64),
    insights_layout: z
      .array(
        z.object({
          id: z.string().min(1).max(40),
          size: z.enum(['half', 'full']),
          hidden: z.boolean(),
        }),
      )
      .max(40),
    telemetry: z.boolean(),
    updates_set_up: z.boolean(),
  })
  .partial();

export const roasterInput = z.object({
  name: name(),
  location: text(200),
  website: text(500),
  notes: text(),
});
export const roasterPatch = roasterInput.partial();

// No .default() here: .partial() keeps defaults, which would reset fields on every PATCH.
const beanFields = z.object({
  name: name(),
  roaster_id: z.string().nullish(),
  status,
  roasted_on: day,
  received_on: day,
  rest_until: day,
  thawed_on: day,
  finished_on: day,
  tasting_notes: text(500),
  roaster_notes: text(),
  origins: tags,
  varieties: tags,
  region: text(300),
  process: text(100),
  process_notes: text(300),
  altitude: text(100),
  bag_g: num(0, 100_000),
  cost: num(0, 100_000),
  notes: text(),
  buy_again: z.enum(BUY_AGAIN_KEYS).nullish(),
});
export const beanInput = beanFields.extend({
  status: status.default('resting'),
  origins: tags.default([]),
  varieties: tags.default([]),
});
export const beanPatch = beanFields.partial();

export const brewInput = z.object({
  bean_id: z.string().min(1, 'Pick a bean'),
  brewed_at: z.iso.datetime({ offset: true }).optional(),
  method: text(60),
  grinder: text(60),
  grind: num(-1000, 10_000),
  dose_g: num(0, 10_000),
  water_ml: num(0, 100_000),
  water_temp_c: num(-50, 150),
  recipe_notes: text(),
  rating: num(0, 10),
  extraction: z.enum(EXTRACTION_KEYS).nullish(),
  strength: z.enum(STRENGTH_KEYS).nullish(),
  tasting_notes: text(),
  next_time: text(500),
  rating_skipped: z.boolean().optional(),
});
export const brewPatch = brewInput.partial();

export type RoasterInput = z.input<typeof roasterInput>;
export type BeanInput = z.input<typeof beanInput>;
export type BrewInput = z.input<typeof brewInput>;
export type SettingsPatch = z.input<typeof settingsPatch>;
