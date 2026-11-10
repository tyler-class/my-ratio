import type { BeanStatus, BuyAgain, Extraction, Strength } from './lookups';

export interface ImageRef {
  id: string;
  width: number | null;
  height: number | null;
  content_type: string;
}

export interface Roaster {
  id: string;
  name: string;
  location: string | null;
  website: string | null;
  notes: string | null;
  images: ImageRef[];
  created_at: string;
}

export interface Bean {
  id: string;
  name: string;
  roaster_id: string | null;
  status: BeanStatus;
  roasted_on: string | null;
  received_on: string | null;
  rest_until: string | null;
  thawed_on: string | null;
  finished_on: string | null;
  tasting_notes: string | null;
  roaster_notes: string | null;
  origins: string[];
  varieties: string[];
  region: string | null;
  process: string | null;
  process_notes: string | null;
  altitude: string | null;
  bag_g: number | null;
  cost: number | null;
  notes: string | null;
  buy_again: BuyAgain | null;
  images: ImageRef[];
  created_at: string;
}

export interface Brew {
  id: string;
  num: number;
  bean_id: string | null;
  brewed_at: string;
  method: string | null;
  grinder: string | null;
  grind: number | null;
  dose_g: number | null;
  water_ml: number | null;
  water_temp_c: number | null;
  recipe_notes: string | null;
  rating: number | null;
  extraction: Extraction | null;
  strength: Strength | null;
  tasting_notes: string | null;
  next_time: string | null;
  /** Dismissed from "Waiting for a rating" without rating it. */
  rating_skipped: boolean;
}

export type TempUnit = 'F' | 'C';

export interface Settings {
  methods: string[];
  grinders: string[];
  temp_unit: TempUnit;
  /** ISO 4217 code, like USD. */
  currency: string;
  /** Someone chose the currency (else the app suggests one from the browser's language). */
  currency_set: boolean;
  /** IANA zone the app last reported, so assistants see local dates and times. */
  time_zone: string;
  /** Insights panel order, width and visibility. Unknown or missing panels use defaults. */
  insights_layout: InsightsPanel[];
  /** Send the anonymous daily check-in (counts only). */
  telemetry: boolean;
  /** Someone added the update workflow to this copy's GitHub repo, from Settings → Updates. */
  updates_set_up: boolean;
}

export interface InsightsPanel {
  id: string;
  size: 'half' | 'full';
  hidden: boolean;
}

export interface AppState {
  settings: Settings;
  roasters: Roaster[];
  beans: Bean[];
  brews: Brew[];
}
