// MCP server: lets any MCP-capable assistant read the coffee log and log, rate and edit
// brews, bags and roasters in plain language. Tools call the same REST API the app uses
// (validation lives there), marked internal because OAuthProvider already checked the token.
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import {
  BUY_AGAIN,
  BUY_AGAIN_KEYS,
  EXTRACTION,
  EXTRACTION_KEYS,
  LIVE_STATUSES,
  normalizeStatus,
  STATUS_KEYS,
  STRENGTH_KEYS,
  type BeanStatus,
} from '@shared/lookups';
import {
  buildModel,
  grindTable,
  mean,
  streak,
  type BeanView,
  type BrewView,
  type Model,
} from '@shared/logic/model';
import { dayDiff, dayIn, parseLocal, whenIn } from '@shared/logic/tz';
import { r1, ratioOf, tempIn, tempOut } from '@shared/logic/units';
import type { AppState, Bean, Brew, Roaster, Settings } from '@shared/types';
import { EXAMPLE_PROMPTS, MCP_PROMPTS } from '@shared/examples';
import { app } from './app';
import { INTERNAL } from './auth';

type Call = <T>(method: string, path: string, body?: unknown) => Promise<T>;

class ToolError extends Error {}

function apiCaller(origin: string, env: Cloudflare.Env, ctx: ExecutionContext): Call {
  const internalEnv = { ...env, [INTERNAL]: true };
  return async <T>(method: string, path: string, body?: unknown) => {
    const res = await app.fetch(
      new Request(`${origin}/api${path}`, {
        method,
        headers: method === 'GET' ? {} : { 'Content-Type': 'application/json' },
        body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
      }),
      internalEnv,
      ctx,
    );
    const data = (await res.json().catch(() => null)) as T & { message?: string };
    if (!res.ok) throw new ToolError(data?.message ?? `Request failed (${res.status}).`);
    return data;
  };
}

const out = (v: unknown) => ({
  content: [
    { type: 'text' as const, text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) },
  ],
});
const fail = (e: unknown) => ({
  content: [
    {
      type: 'text' as const,
      text: e instanceof Error ? e.message : 'Something went wrong.',
    },
  ],
  isError: true,
});
/** Wraps a tool body so thrown errors come back as tool errors the assistant can read. */
const safe =
  <A>(fn: (a: A) => Promise<unknown>) =>
  async (a: A) => {
    try {
      return out(await fn(a));
    } catch (e) {
      return fail(e);
    }
  };

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Exact id, exact name, then a unique partial match (all words present). */
function pick<T extends { id: string }>(
  list: T[],
  key: string,
  names: (t: T) => string[],
  what: string,
  describe: (t: T) => string,
  prefer?: (t: T) => boolean,
): T {
  const byId = list.find((t) => t.id === key);
  if (byId) return byId;
  const k = norm(key);
  if (!k) throw new ToolError(`Say which ${what}.`);
  const exact = list.filter((t) => names(t).some((n) => norm(n) === k));
  if (exact.length === 1) return exact[0]!;
  const words = k.split(' ');
  const partial = (exact.length ? exact : list).filter((t) => {
    const hay = norm(names(t).join(' '));
    return words.every((w) => hay.includes(w));
  });
  if (partial.length === 1) return partial[0]!;
  if (partial.length > 1 && prefer) {
    const preferred = partial.filter(prefer);
    if (preferred.length === 1) return preferred[0]!;
  }
  const pool = partial.length ? partial : list;
  const options = pool.slice(0, 15).map(describe).join('; ') || 'none yet';
  throw new ToolError(
    partial.length
      ? `“${key}” matches more than one ${what}: ${options}. Be more specific or pass the id.`
      : `No ${what} matches “${key}”. Some options: ${options}.`,
  );
}

const LABEL = {
  extraction: Object.fromEntries(EXTRACTION.map((e) => [e.key, e.long])),
  buy: Object.fromEntries(BUY_AGAIN.map((b) => [b.key, b.label])),
};

interface Ctx {
  state: AppState;
  m: Model;
  s: Settings;
  tz: string;
  today: string;
}

function fmtTemp(c: number | null, s: Settings) {
  const v = tempOut(c, s.temp_unit);
  return v == null ? null : `${v}°${s.temp_unit}`;
}

function brewOut(b: BrewView, c: Ctx, full = false) {
  return {
    id: b.id,
    num: b.num,
    when: whenIn(b.brewed_at, c.tz),
    bean: b.beanName,
    roaster: b.roasterName || null,
    method: b.method,
    grinder: b.grinder,
    grind: b.grind,
    dose_g: b.dose_g,
    water_ml: b.water_ml,
    ratio: b.ratio ? `1:${r1(b.ratio)}` : null,
    water_temp: fmtTemp(b.water_temp_c, c.s),
    rating: b.rating,
    extraction: b.extraction ? LABEL.extraction[b.extraction] : null,
    strength: b.strength,
    tasting_notes: b.tasting_notes,
    next_time: b.next_time,
    ...(full ? { recipe_notes: b.recipe_notes, bean_id: b.bean_id } : {}),
    ...(!full && b.recipe_notes ? { recipe_notes: b.recipe_notes } : {}),
  };
}

function stockLine(b: BeanView, c: Ctx): string {
  if (b.status === 'drinking') {
    const left = b.remaining != null ? Math.floor(b.remaining / c.m.dose7d) : null;
    return b.remaining != null
      ? `${Math.round(b.remaining)} g left${left != null ? ` (~${left} brews at your 7-day average dose)` : ''}`
      : 'open';
  }
  if (b.status === 'resting') {
    if (!b.rest_until) return 'resting';
    const d = dayDiff(c.today, b.rest_until);
    return d > 0 ? `ready in ${d} day${d === 1 ? '' : 's'} (${b.rest_until})` : 'ready to open';
  }
  if (b.status === 'freezing') return `in the freezer${b.bag_g ? `, ${b.bag_g} g` : ''}`;
  if (b.status === 'ordered') return 'on the way';
  return `finished after ${b.brews.length} brews`;
}

function beanOut(b: BeanView, c: Ctx) {
  return {
    id: b.id,
    name: b.name,
    roaster: b.roasterName || null,
    status: b.status,
    stock: stockLine(b, c),
    origins: b.origins,
    process: b.process,
    roasted_on: b.roasted_on,
    days_off_roast: b.roasted_on ? dayDiff(b.roasted_on, c.today) : null,
    roaster_tasting_notes: b.tasting_notes,
    avg_rating: b.avg != null ? r1(b.avg) : null,
    brews: b.brews.length,
    last_brewed: b.last ? whenIn(b.last.brewed_at, c.tz) : null,
    buy_again: b.buy_again ? LABEL.buy[b.buy_again] : null,
  };
}

function beanDetail(b: BeanView, c: Ctx, brewLimit: number) {
  const perCup = b.perG ? b.perG * c.m.avgDose : null;
  return {
    ...beanOut(b, c),
    region: b.region,
    varieties: b.varieties,
    process_notes: b.process_notes,
    altitude: b.altitude,
    received_on: b.received_on,
    rest_until: b.rest_until,
    thawed_on: b.thawed_on,
    finished_on: b.finished_on,
    roaster_notes: b.roaster_notes,
    my_notes: b.notes,
    bag_g: b.bag_g,
    used_g: r1(b.used),
    remaining_g: b.remaining != null ? Math.round(b.remaining) : null,
    cost: b.cost,
    currency: c.s.currency,
    cost_per_cup: perCup != null ? Math.round(perCup * 100) / 100 : null,
    photos: b.images.length,
    dial_in: grindTable(b)
      .slice(0, 6)
      .map((g) => ({ grind: g.grind, avg_rating: r1(g.avg), brews: g.n })),
    best_brew: b.best ? brewOut(b.best, c) : null,
    last_brew: b.last ? brewOut(b.last, c) : null,
    recent_brews: b.brews.slice(0, brewLimit).map((x) => brewOut(x, c)),
  };
}

const GETTING_STARTED = `

When someone asks what you can do with Ratio (or seems unsure where to start), call get_started: it returns their coffee log's current state and example requests to offer. Suggest two or three that fit, phrased for their bags and gear, rather than listing tools. Examples:
${EXAMPLE_PROMPTS.map((e) => `- "${e.prompt}"`).join('\n')}`;

function buildServer(call: Call) {
  const server = new McpServer(
    { name: 'ratio', version: '1.0.0' },
    {
      instructions:
        [
          'Ratio is a personal coffee brewing log: roasters → bags of beans → brews.',
          'Start with coffee_overview to see what is open, recent brews and the owner’s units and equipment.',
          'Beans, roasters and brews can be named loosely: a partial bean name works, and brews can be "last", "#392" or 392.',
          'log_brew copies the recipe from that bag’s last brew unless told otherwise, so "log a brew of the Kenya, 8/10, a bit sour" is one call.',
          'To rate or fix a brew, use update_brew with brew "last" or its number.',
          'Ratings are 0–10 (halves allowed). Temperatures use the owner’s unit shown in coffee_overview.',
          'Times without an offset are the owner’s local time.',
          'To add a photo the owner has (or will take) on their phone, call photo_upload_link and give them the link; a photo seen in the chat cannot be passed to a tool. add_photo takes a public image URL or real base64 bytes.',
        ].join(' ') + GETTING_STARTED,
    },
  );

  async function load(): Promise<Ctx> {
    const state = await call<AppState>('GET', '/state');
    const tz = state.settings.time_zone || 'UTC';
    return { state, m: buildModel(state), s: state.settings, tz, today: dayIn(new Date(), tz) };
  }

  const findBean = (c: Ctx, key: string) =>
    pick(
      c.m.beans,
      key,
      (b) => [b.name, `${b.name} ${b.roasterName}`, `${b.roasterName} ${b.name}`],
      'bean',
      (b) => `${b.name}${b.roasterName ? ` (${b.roasterName})` : ''} [${b.status}, id ${b.id}]`,
      (b) => b.status === 'drinking',
    );

  const findRoaster = (c: Ctx, key: string) =>
    pick(
      c.state.roasters,
      key,
      (r) => [r.name],
      'roaster',
      (r) => `${r.name} [id ${r.id}]`,
    );

  function findBrew(c: Ctx, key: string): BrewView {
    const k = key.trim().toLowerCase();
    if (/^(last|latest|most recent|newest)$/.test(k)) {
      const b = c.m.brews[0];
      if (!b) throw new ToolError('No brews have been logged yet.');
      return b;
    }
    const n = /^#?(\d+)$/.exec(k);
    const hit = n
      ? c.m.brews.find((b) => b.num === Number(n[1]))
      : c.m.brews.find((b) => b.id === key.trim());
    if (!hit) throw new ToolError(`No brew “${key}”. Use list_brews to find brew numbers.`);
    return hit;
  }

  /** The bag you most likely mean when you don't say: the open bag brewed most recently. */
  function defaultBean(c: Ctx): BeanView {
    const open = c.m.beans.filter((b) => b.status === 'drinking');
    if (open.length === 1) return open[0]!;
    const recent = c.m.brews.find((b) => b.bean && b.bean.status === 'drinking')?.bean;
    if (recent) return recent;
    if (c.m.brews[0]?.bean) return c.m.brews[0].bean;
    throw new ToolError('Say which bean. Use find_beans to see the bags.');
  }

  async function roasterIdFor(c: Ctx, name: string | null | undefined, created: string[]) {
    if (name === undefined) return undefined;
    if (name === null || !name.trim()) return null;
    try {
      return findRoaster(c, name).id;
    } catch (e) {
      // Only create one when nothing is even close; ambiguity stays an error.
      if (e instanceof ToolError && /matches more than one/.test(e.message)) throw e;
      const r = await call<Roaster>('POST', '/roasters', { name: name.trim() });
      c.state.roasters.push(r);
      created.push(`Added roaster “${r.name}”.`);
      return r.id;
    }
  }

  const brewedAt = (c: Ctx, v: string | undefined) => {
    if (v === undefined) return undefined;
    const d = parseLocal(v, c.tz);
    if (!d) throw new ToolError('brewed_at must look like 2026-11-04 07:30 or an ISO timestamp.');
    return d.toISOString();
  };

  const temp = (c: Ctx, v: number | null | undefined) =>
    v === undefined ? undefined : tempIn(v, c.s.temp_unit);

  // ---------- read ----------

  server.registerTool(
    'coffee_overview',
    {
      title: 'Coffee overview',
      description:
        'Start here. What is open on the bar (with grams left), what is resting, frozen or on the way, the last few brews, brews still waiting for a rating, headline stats (brews this week, 30-day average rating, stock runway, cost per cup), plus the owner’s methods, grinders, temperature unit, currency and today’s date.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    safe(async () => {
      const c = await load();
      const { m } = c;
      const inDays = (b: BrewView, n: number) => dayDiff(dayIn(b.date, c.tz), c.today) <= n;
      const last30 = m.brews.filter((b) => inDays(b, 29));
      const rated30 = last30.filter((b) => b.rating != null);
      const cups = last30.filter((b) => b.cup != null).map((b) => b.cup!);
      const group = (st: BeanStatus) =>
        m.beans.filter((b) => b.status === st).map((b) => beanOut(b, c));
      return {
        today: c.today,
        time_zone: c.tz,
        units: { temperature: `°${c.s.temp_unit}`, dose: 'g', water: 'mL', currency: c.s.currency },
        equipment: { methods: c.s.methods, grinders: c.s.grinders },
        stats: {
          brews_today: m.brews.filter((b) => dayIn(b.date, c.tz) === c.today).length,
          brews_7_days: m.brews.filter((b) => inDays(b, 6)).length,
          brews_all_time: m.brews.length,
          avg_rating_30_days: rated30.length ? r1(mean(rated30.map((b) => b.rating!))!) : null,
          streak_days: streak(m.brews.map((b) => ({ key: dayIn(b.date, c.tz) }))),
          stock_g: Math.round(m.stock),
          grams_per_day: r1(m.burn),
          runway_days: m.runway != null ? Math.round(m.runway) : null,
          cost_per_cup_30_days: cups.length ? Math.round(mean(cups)! * 100) / 100 : null,
        },
        drinking: group('drinking'),
        resting: group('resting'),
        freezer: group('freezing'),
        ordered: group('ordered'),
        recent_brews: m.brews.slice(0, 6).map((b) => brewOut(b, c)),
        waiting_for_rating: m.brews
          .filter((b) => b.rating == null && !b.rating_skipped && inDays(b, 7))
          .slice(0, 10)
          .map((b) => ({ num: b.num, bean: b.beanName, when: whenIn(b.brewed_at, c.tz) })),
      };
    }),
  );

  server.registerTool(
    'get_started',
    {
      title: 'What can I do here?',
      description:
        'Call when someone asks what you can do with Ratio or how to start. Returns the coffee log’s current state (bags by status, what’s open, brews waiting for a rating, stock) and example requests that fit it, plus the ready-made prompts.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    safe(async () => {
      const c = await load();
      const { m } = c;
      const count = (st: BeanStatus) => m.beans.filter((b) => b.status === st).length;
      const open = m.beans.filter((b) => b.status === 'drinking');
      const ready = m.beans.filter(
        (b) => b.status === 'resting' && (!b.rest_until || dayDiff(c.today, b.rest_until) <= 0),
      );
      const unrated = m.brews.filter(
        (b) => b.rating == null && !b.rating_skipped && dayDiff(dayIn(b.date, c.tz), c.today) <= 7,
      );
      const week = m.brews.filter((b) => dayDiff(dayIn(b.date, c.tz), c.today) <= 6).length;
      const state = m.beans.length
        ? [
            `${m.brews.length} brews logged (${week} in the last 7 days), ${m.beans.length} bags from ${m.roasters.length} roasters.`,
            `Bags: ${count('drinking')} open, ${count('resting')} resting, ${count('freezing')} in the freezer, ${count('ordered')} on order, ${count('finished')} finished.`,
            open.length
              ? `On the bar: ${open.map((b) => `${b.name} (${stockLine(b, c)})`).join('; ')}.`
              : 'Nothing is open right now.',
            ready.length ? `Ready to open: ${ready.map((b) => b.name).join(', ')}.` : '',
            unrated.length
              ? `${unrated.length} brew(s) from the last week are waiting for a rating.`
              : '',
            m.runway != null
              ? `Stock lasts about ${Math.round(m.runway)} days at the current pace.`
              : '',
            `Methods: ${c.s.methods.join(', ') || 'none set'}. Grinders: ${c.s.grinders.join(', ') || 'none set'}.`,
          ]
            .filter(Boolean)
            .join('\n')
        : 'The log is empty. A good first step is adding the bag they are drinking now (add_bean), then logging a brew of it.';
      const examples = EXAMPLE_PROMPTS.map((e) => `- "${e.prompt}" — ${e.why}`).join('\n');
      const prompts = MCP_PROMPTS.map((p) => `- ${p.title} (${p.name}): ${p.does}`).join('\n');
      return `${state}\n\nThings to offer (fill in <…> from the log above, and suggest the two or three that fit best):\n${examples}\n\nReady-made prompts the person can pick in their app’s prompt menu:\n${prompts}`;
    }),
  );

  server.registerTool(
    'find_beans',
    {
      title: 'Find beans',
      description:
        'List bags of coffee, newest activity first. Filter by status (live = anything not finished or on order), free-text query (name, roaster, origin, process, tasting notes) or roaster.',
      inputSchema: z.object({
        query: z.string().optional(),
        status: z
          .enum([...STATUS_KEYS, 'live', 'all'])
          .optional()
          .describe('Default: all'),
        roaster: z.string().optional(),
        limit: z.number().int().min(1).max(200).optional().describe('Default 30'),
      }),
      annotations: { readOnlyHint: true },
    },
    safe(async ({ query, status, roaster, limit }) => {
      const c = await load();
      const r = roaster ? findRoaster(c, roaster) : null;
      const q = query ? norm(query).split(' ') : [];
      const list = c.m.beans
        .filter((b) =>
          !status || status === 'all'
            ? true
            : status === 'live'
              ? LIVE_STATUSES.includes(b.status)
              : b.status === status,
        )
        .filter((b) => !r || b.roaster_id === r.id)
        .filter((b) => {
          if (!q.length) return true;
          const hay = norm(
            [
              b.name,
              b.roasterName,
              b.origins.join(' '),
              b.process ?? '',
              b.region ?? '',
              b.tasting_notes ?? '',
              b.varieties.join(' '),
            ].join(' '),
          );
          return q.every((w) => hay.includes(w));
        })
        .sort(
          (a, b) =>
            (b.last?.date.getTime() ?? b.created.getTime()) -
            (a.last?.date.getTime() ?? a.created.getTime()),
        );
      return {
        count: list.length,
        beans: list.slice(0, limit ?? 30).map((b) => beanOut(b, c)),
      };
    }),
  );

  server.registerTool(
    'get_bean',
    {
      title: 'Get a bean',
      description:
        'Everything about one bag: origin and roast details, grams used and left, price per cup, how each grind setting has rated (dial-in), its best and latest brew including “next time” notes, and recent brews.',
      inputSchema: z.object({
        bean: z.string().describe('Bean name (partial is fine), "name roaster", or id'),
        brews: z
          .number()
          .int()
          .min(0)
          .max(200)
          .optional()
          .describe('Recent brews to include (default 15)'),
      }),
      annotations: { readOnlyHint: true },
    },
    safe(async ({ bean, brews }) => {
      const c = await load();
      return beanDetail(findBean(c, bean), c, brews ?? 15);
    }),
  );

  server.registerTool(
    'list_brews',
    {
      title: 'List brews',
      description:
        'Search the brew journal, newest first. Filter by bean, method, local date range (YYYY-MM-DD, inclusive), rated or unrated, minimum rating, or text in notes.',
      inputSchema: z.object({
        bean: z.string().optional(),
        method: z.string().optional(),
        from: z.string().optional().describe('YYYY-MM-DD'),
        to: z.string().optional().describe('YYYY-MM-DD'),
        rated: z.enum(['rated', 'unrated']).optional(),
        min_rating: z.number().min(0).max(10).optional(),
        query: z.string().optional(),
        limit: z.number().int().min(1).max(300).optional().describe('Default 20'),
      }),
      annotations: { readOnlyHint: true },
    },
    safe(async (a) => {
      const c = await load();
      const b = a.bean ? findBean(c, a.bean) : null;
      const q = a.query ? norm(a.query) : '';
      const list = c.m.brews.filter((x) => {
        const day = dayIn(x.date, c.tz);
        if (b && x.bean_id !== b.id) return false;
        if (a.method && norm(x.method ?? '') !== norm(a.method)) return false;
        if (a.from && day < a.from) return false;
        if (a.to && day > a.to) return false;
        if (a.rated === 'rated' && x.rating == null) return false;
        if (a.rated === 'unrated' && x.rating != null) return false;
        if (a.min_rating != null && (x.rating ?? -1) < a.min_rating) return false;
        if (
          q &&
          !norm(
            [x.beanName, x.roasterName, x.recipe_notes, x.tasting_notes, x.next_time].join(' '),
          ).includes(q)
        )
          return false;
        return true;
      });
      const rated = list.filter((x) => x.rating != null);
      return {
        count: list.length,
        avg_rating: rated.length ? r1(mean(rated.map((x) => x.rating!))!) : null,
        brews: list.slice(0, a.limit ?? 20).map((x) => brewOut(x, c)),
      };
    }),
  );

  server.registerTool(
    'get_brew',
    {
      title: 'Get a brew',
      description: 'One brew in full. brew is "last", a brew number like 392 or #392, or an id.',
      inputSchema: z.object({ brew: z.string() }),
      annotations: { readOnlyHint: true },
    },
    safe(async ({ brew }) => {
      const c = await load();
      return brewOut(findBrew(c, brew), c, true);
    }),
  );

  server.registerTool(
    'list_roasters',
    {
      title: 'List roasters',
      description:
        'Roasters with location, website, notes, how many bags you’ve bought, average rating of their coffee and total spend.',
      inputSchema: z.object({ query: z.string().optional() }),
      annotations: { readOnlyHint: true },
    },
    safe(async ({ query }) => {
      const c = await load();
      const q = query ? norm(query) : '';
      return c.m.roasters
        .filter((r) => !q || norm(`${r.name} ${r.location ?? ''}`).includes(q))
        .map((r) => {
          const beans = c.m.beans.filter((b) => b.roaster_id === r.id);
          const ratings = beans.flatMap((b) => b.rated.map((x) => x.rating!));
          return {
            id: r.id,
            name: r.name,
            location: r.location,
            website: r.website,
            notes: r.notes,
            has_logo: r.images.length > 0,
            bags: beans.length,
            beans: beans.map((b) => `${b.name} (${b.status})`),
            avg_rating: ratings.length ? r1(mean(ratings)!) : null,
            spent: Math.round(beans.reduce((s, b) => s + (b.cost ?? 0), 0) * 100) / 100,
          };
        });
    }),
  );

  server.registerTool(
    'coffee_insights',
    {
      title: 'Coffee insights',
      description:
        'Patterns across the log: average rating grouped by origin, process, roaster, method, grinder or variety; top-rated bags; the order again shortlist (finished bags marked buy again); which brew ratios rate best per method; extraction trend; and spend by roaster. Optionally limit to the last N days.',
      inputSchema: z.object({
        group_by: z
          .enum(['origin', 'process', 'roaster', 'method', 'grinder', 'variety'])
          .optional()
          .describe('Default origin'),
        min_brews: z.number().int().min(1).max(50).optional().describe('Default 3'),
        days: z.number().int().min(1).max(3650).optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    safe(async ({ group_by, min_brews, days }) => {
      const c = await load();
      const dim = group_by ?? 'origin';
      const min = min_brews ?? 3;
      const brews = c.m.brews.filter((b) => !days || dayDiff(dayIn(b.date, c.tz), c.today) < days);
      const rated = brews.filter((b) => b.rating != null);
      const groups = new Map<string, number[]>();
      const add = (k: string | null | undefined, v: number) => {
        if (!k?.trim()) return;
        groups.set(k.trim(), [...(groups.get(k.trim()) ?? []), v]);
      };
      for (const b of rated) {
        const v = b.rating!;
        if (dim === 'origin') b.bean?.origins.forEach((o) => add(o, v));
        else if (dim === 'variety') b.bean?.varieties.forEach((o) => add(o, v));
        else if (dim === 'process') add(b.bean?.process, v);
        else if (dim === 'roaster') add(b.roasterName, v);
        else if (dim === 'method') add(b.method, v);
        else add(b.grinder, v);
      }
      const ranking = [...groups]
        .map(([k, r]) => ({ [dim]: k, avg_rating: r1(mean(r)!), brews: r.length }))
        .filter((g) => g.brews >= min)
        .sort((a, b) => b.avg_rating - a.avg_rating);

      const ratios = new Map<string, Map<string, number[]>>();
      for (const b of rated) {
        if (!b.ratio || !b.method || b.ratio < 1 || b.ratio > 25) continue;
        const k = (Math.round(b.ratio * 2) / 2).toFixed(1);
        if (!ratios.has(b.method)) ratios.set(b.method, new Map());
        const mm = ratios.get(b.method)!;
        mm.set(k, [...(mm.get(k) ?? []), b.rating!]);
      }
      const ratio_sweet_spots = [...ratios].map(([method, mm]) => {
        const rows = [...mm]
          .map(([k, r]) => ({ ratio: `1:${k}`, avg_rating: r1(mean(r)!), brews: r.length }))
          .filter((x) => x.brews >= 3)
          .sort((a, b) => b.avg_rating - a.avg_rating);
        return { method, best: rows.slice(0, 3) };
      });

      const months = new Map<string, Record<string, number>>();
      for (const b of brews) {
        if (!b.extraction) continue;
        const k = dayIn(b.date, c.tz).slice(0, 7);
        const e = months.get(k) ?? {};
        e[b.extraction] = (e[b.extraction] ?? 0) + 1;
        months.set(k, e);
      }
      const spend = new Map<string, { spent: number; grams: number; bags: number }>();
      for (const b of c.m.beans) {
        if (!b.cost || !b.roasterName) continue;
        const s = spend.get(b.roasterName) ?? { spent: 0, grams: 0, bags: 0 };
        s.spent += b.cost;
        s.grams += b.bag_g ?? 0;
        s.bags += 1;
        spend.set(b.roasterName, s);
      }
      return {
        brews_considered: brews.length,
        rated: rated.length,
        avg_rating: rated.length ? r1(mean(rated.map((b) => b.rating!))!) : null,
        [`by_${dim}`]: ranking,
        top_bags: c.m.beans
          .filter((b) => b.rated.length >= 2)
          .sort((a, b) => b.avg! - a.avg!)
          .slice(0, 10)
          .map((b) => ({
            bean: b.name,
            roaster: b.roasterName,
            avg_rating: r1(b.avg!),
            brews: b.rated.length,
          })),
        order_again_shortlist: c.m.beans
          .filter(
            (b) =>
              b.status === 'finished' && (b.buy_again === 'definitely' || b.buy_again === 'yes'),
          )
          .map((b) => ({
            bean: b.name,
            roaster: b.roasterName,
            buy_again: LABEL.buy[b.buy_again!],
            avg_rating: b.avg != null ? r1(b.avg) : null,
            price: b.cost,
            bag_g: b.bag_g,
          })),
        ratio_sweet_spots,
        extraction_by_month: Object.fromEntries([...months].sort().slice(-6)),
        spend_by_roaster: [...spend]
          .map(([roaster, s]) => ({
            roaster,
            spent: Math.round(s.spent * 100) / 100,
            bags: s.bags,
            per_100g: s.grams ? Math.round((s.spent / s.grams) * 10000) / 100 : null,
          }))
          .sort((a, b) => b.spent - a.spent),
      };
    }),
  );

  // ---------- write ----------

  const brewFields = {
    method: z.string().optional().describe('e.g. V60, Espresso; see coffee_overview equipment'),
    grinder: z.string().optional(),
    grind: z.number().optional().describe('Grinder setting'),
    dose_g: z.number().positive().optional(),
    water_ml: z.number().positive().optional(),
    ratio: z
      .number()
      .positive()
      .optional()
      .describe(
        'Water per gram, e.g. 16.67. Used to work out water (or dose) when one is missing.',
      ),
    water_temp: z.number().optional().describe('In the owner’s temperature unit'),
    recipe_notes: z.string().optional().describe('Pour schedule, bloom, total time…'),
    rating: z.number().min(0).max(10).optional(),
    extraction: z.enum(EXTRACTION_KEYS).optional(),
    strength: z.enum(STRENGTH_KEYS).optional().describe('How strong it tasted'),
    tasting_notes: z.string().optional().describe('How it tasted'),
    next_time: z.string().optional().describe('What to change next time'),
    brewed_at: z.string().optional().describe('Local "YYYY-MM-DD HH:mm" or ISO; defaults to now'),
  };

  server.registerTool(
    'log_brew',
    {
      title: 'Log a brew',
      description:
        'Record a brew. Anything not given is copied from the last brew of that bag (method, grinder, grind, dose, ratio, temperature, recipe notes) unless copy_last is false; tasting results are never copied. bean defaults to the open bag brewed most recently. Give dose + ratio, dose + water, or water + ratio. Returns the new brew number.',
      inputSchema: z.object({
        bean: z.string().optional(),
        ...brewFields,
        copy_last: z.boolean().optional().describe('Default true'),
      }),
    },
    safe(async (a) => {
      const c = await load();
      const bean = a.bean ? findBean(c, a.bean) : defaultBean(c);
      const base = a.copy_last === false ? null : (bean.last ?? c.m.brews[0] ?? null);
      const sameBag = base?.bean_id === bean.id;
      let dose = a.dose_g ?? base?.dose_g ?? null;
      let water = a.water_ml ?? null;
      const baseRatio = ratioOf(base?.dose_g ?? null, base?.water_ml ?? null);
      const ratio = a.ratio ?? (a.water_ml != null && a.dose_g != null ? null : baseRatio);
      if (water == null && dose != null && ratio) water = Math.round(dose * ratio * 10) / 10;
      if (a.dose_g == null && a.water_ml != null && a.ratio)
        dose = Math.round((a.water_ml / a.ratio) * 10) / 10;
      if (water == null) water = base?.water_ml ?? null;
      const brew = await call<Brew>('POST', '/brews', {
        bean_id: bean.id,
        brewed_at: brewedAt(c, a.brewed_at),
        method: a.method ?? base?.method ?? c.s.methods[0] ?? null,
        grinder: a.grinder ?? base?.grinder ?? c.s.grinders[0] ?? null,
        // A grind setting from another bag is a guess at best; only carry it within a bag.
        grind: a.grind ?? (sameBag ? base?.grind : null) ?? null,
        dose_g: dose,
        water_ml: water,
        water_temp_c: temp(c, a.water_temp) ?? base?.water_temp_c ?? null,
        recipe_notes: a.recipe_notes ?? (sameBag ? base?.recipe_notes : null) ?? null,
        rating: a.rating ?? null,
        extraction: a.extraction ?? null,
        strength: a.strength ?? null,
        tasting_notes: a.tasting_notes ?? null,
        next_time: a.next_time ?? null,
      });
      const fresh = await load();
      const view = fresh.m.brewMap.get(brew.id)!;
      return {
        logged: brewOut(view, fresh, true),
        copied_from: base && a.copy_last !== false ? `brew #${base.num}` : null,
        reminder: sameBag && base?.next_time ? `Last time’s note: ${base.next_time}` : undefined,
        bag: stockLine(fresh.m.beanMap.get(bean.id)!, fresh),
      };
    }),
  );

  server.registerTool(
    'update_brew',
    {
      title: 'Update or rate a brew',
      description:
        'Change a logged brew: rate it, add tasting notes or a next-time note, fix the recipe, move it to another bean, or change when it was brewed. brew is "last", a number like 392, or an id. Pass null to clear a field.',
      inputSchema: z.object({
        brew: z.string(),
        bean: z.string().optional(),
        method: z.string().nullable().optional(),
        grinder: z.string().nullable().optional(),
        grind: z.number().nullable().optional(),
        dose_g: z.number().positive().nullable().optional(),
        water_ml: z.number().positive().nullable().optional(),
        water_temp: z.number().nullable().optional(),
        recipe_notes: z.string().nullable().optional(),
        rating: z.number().min(0).max(10).nullable().optional(),
        extraction: z.enum(EXTRACTION_KEYS).nullable().optional(),
        strength: z.enum(STRENGTH_KEYS).nullable().optional(),
        tasting_notes: z.string().nullable().optional(),
        next_time: z.string().nullable().optional(),
        brewed_at: z.string().optional(),
      }),
    },
    safe(async ({ brew, bean, water_temp, brewed_at, ...rest }) => {
      const c = await load();
      const b = findBrew(c, brew);
      const patch: Record<string, unknown> = Object.fromEntries(
        Object.entries(rest).filter(([, v]) => v !== undefined),
      );
      if (bean !== undefined) patch.bean_id = findBean(c, bean).id;
      if (water_temp !== undefined) patch.water_temp_c = temp(c, water_temp);
      if (brewed_at !== undefined) patch.brewed_at = brewedAt(c, brewed_at);
      if (!Object.keys(patch).length) throw new ToolError('Nothing to change.');
      await call('PATCH', `/brews/${b.id}`, patch);
      const fresh = await load();
      return { updated: brewOut(fresh.m.brewMap.get(b.id)!, fresh, true) };
    }),
  );

  server.registerTool(
    'delete_brew',
    {
      title: 'Delete a brew',
      description:
        'Permanently delete one brew. brew is a number like 392 or an id (not "last", to avoid mistakes).',
      inputSchema: z.object({ brew: z.string() }),
      annotations: { destructiveHint: true },
    },
    safe(async ({ brew }) => {
      if (/^(last|latest)/i.test(brew.trim()))
        throw new ToolError('Pass the brew number to delete, so the right one goes.');
      const c = await load();
      const b = findBrew(c, brew);
      await call('DELETE', `/brews/${b.id}`);
      return `Deleted brew #${b.num} (${b.beanName}, ${whenIn(b.brewed_at, c.tz)}).`;
    }),
  );

  const beanFields = {
    roaster: z.string().nullable().optional().describe('Roaster name; created if new'),
    status: z.preprocess(normalizeStatus, z.enum(STATUS_KEYS)).optional(),
    roasted_on: z.string().nullable().optional().describe('YYYY-MM-DD'),
    received_on: z.string().nullable().optional(),
    rest_until: z.string().nullable().optional(),
    thawed_on: z.string().nullable().optional(),
    finished_on: z.string().nullable().optional(),
    bag_g: z.number().positive().nullable().optional(),
    cost: z.number().min(0).nullable().optional().describe('Price paid for the bag'),
    origins: z.array(z.string()).optional().describe('Countries'),
    varieties: z.array(z.string()).optional(),
    region: z.string().nullable().optional().describe('Region or farm'),
    process: z.string().nullable().optional().describe('Washed, Natural, Honey, Anaerobic…'),
    process_notes: z.string().nullable().optional(),
    altitude: z.string().nullable().optional(),
    tasting_notes: z
      .string()
      .nullable()
      .optional()
      .describe('The roaster’s tasting notes, comma-separated'),
    roaster_notes: z.string().nullable().optional().describe('Roaster’s description of the coffee'),
    notes: z.string().nullable().optional().describe('Your own notes on this bag'),
    buy_again: z.enum(BUY_AGAIN_KEYS).nullable().optional(),
  };

  server.registerTool(
    'add_bean',
    {
      title: 'Add a bag',
      description:
        'Add a new bag of coffee. Status defaults to resting (arrived today, degassing; set rest_until). Use ordered for coffee on the way, freezing to bank it, drinking once open.',
      inputSchema: z.object({ name: z.string().min(1), ...beanFields }),
    },
    safe(async ({ roaster, ...a }) => {
      const c = await load();
      const notes: string[] = [];
      const roaster_id = await roasterIdFor(c, roaster, notes);
      const b = await call<Bean>('POST', '/beans', { ...a, roaster_id: roaster_id ?? null });
      const fresh = await load();
      return { added: beanDetail(fresh.m.beanMap.get(b.id)!, fresh, 0), notes };
    }),
  );

  server.registerTool(
    'update_bean',
    {
      title: 'Update a bag',
      description:
        'Change a bag: move it along (ordered → resting/freezing → drinking → finished; dates are stamped automatically), say whether you’d buy it again, or edit any detail. Pass null to clear a field.',
      inputSchema: z.object({
        bean: z.string(),
        name: z.string().min(1).optional(),
        ...beanFields,
      }),
    },
    safe(async ({ bean, roaster, ...a }) => {
      const c = await load();
      const b = findBean(c, bean);
      const notes: string[] = [];
      const patch: Record<string, unknown> = Object.fromEntries(
        Object.entries(a).filter(([, v]) => v !== undefined),
      );
      const rid = await roasterIdFor(c, roaster, notes);
      if (rid !== undefined) patch.roaster_id = rid;
      if (!Object.keys(patch).length) throw new ToolError('Nothing to change.');
      await call('PATCH', `/beans/${b.id}`, patch);
      const fresh = await load();
      return { updated: beanDetail(fresh.m.beanMap.get(b.id)!, fresh, 0), notes };
    }),
  );

  server.registerTool(
    'save_roaster',
    {
      title: 'Add or update a roaster',
      description:
        'Create a roaster, or update one when `roaster` names an existing one (by name or id).',
      inputSchema: z.object({
        roaster: z.string().optional().describe('Existing roaster to update'),
        name: z.string().min(1).optional(),
        location: z.string().nullable().optional(),
        website: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      }),
    },
    safe(async ({ roaster, ...a }) => {
      const c = await load();
      const patch = Object.fromEntries(Object.entries(a).filter(([, v]) => v !== undefined));
      if (roaster) {
        const r = findRoaster(c, roaster);
        if (!Object.keys(patch).length) throw new ToolError('Nothing to change.');
        return { updated: await call<Roaster>('PATCH', `/roasters/${r.id}`, patch) };
      }
      if (!a.name) throw new ToolError('Give the new roaster a name.');
      return { added: await call<Roaster>('POST', '/roasters', patch) };
    }),
  );

  // ---------- photos ----------

  const photoTarget = {
    bean: z.string().optional().describe('Bean (bag) to attach the photo to'),
    roaster: z.string().optional().describe('Roaster whose logo this is'),
  };
  function resolveTarget(c: Ctx, a: { bean?: string; roaster?: string }) {
    if (!!a.bean === !!a.roaster) throw new ToolError('Give either bean or roaster.');
    if (a.bean) {
      const b = findBean(c, a.bean);
      return { owner: 'bean' as const, id: b.id, name: b.name, path: `/beans/${b.id}` };
    }
    const r = findRoaster(c, a.roaster!);
    return { owner: 'roaster' as const, id: r.id, name: r.name, path: `/roasters/${r.id}` };
  }

  server.registerTool(
    'photo_upload_link',
    {
      title: 'Get a photo upload link',
      description:
        'Make a one-time link (valid 30 minutes) that opens a page where the owner takes or picks a photo on their phone and it is attached to a bean (bag photo) or a roaster (logo). Use this whenever the owner wants to add a photo they have or are about to take: you cannot pass a photo from the chat into a tool, so give them this link to tap. Roaster logos replace the current logo by default.',
      inputSchema: z.object({
        ...photoTarget,
        replace: z
          .boolean()
          .optional()
          .describe('Replace existing images (default: true for roaster logos, false for bags)'),
      }),
    },
    safe(async (a) => {
      const c = await load();
      const t = resolveTarget(c, a);
      const link = await call<{ url: string; expires_at: string }>('POST', '/upload-links', {
        owner_type: t.owner,
        owner_id: t.id,
        replace: a.replace ?? t.owner === 'roaster',
      });
      return {
        link: link.url,
        for: `${t.owner === 'bean' ? 'bag photo for' : 'logo for'} ${t.name}`,
        expires: whenIn(link.expires_at, c.tz),
        tell_the_owner:
          'Tap the link, then take or choose a photo. It attaches as soon as it uploads.',
      };
    }),
  );

  server.registerTool(
    'add_photo',
    {
      title: 'Add a photo from a URL or data',
      description:
        'Attach an image to a bean (bag photo) or roaster (logo) from a public image URL (for example a roaster’s logo or a product photo on their website), or from base64 image data if you have the actual file bytes. JPEG, PNG, WebP, GIF or AVIF, up to 15 MB. Do not invent base64 for a photo you only saw in the chat — use photo_upload_link for that.',
      inputSchema: z.object({
        ...photoTarget,
        url: z.string().optional().describe('Public http(s) URL of the image'),
        base64: z.string().optional().describe('Image bytes as base64 or a data: URL'),
        filename: z.string().optional(),
        replace: z
          .boolean()
          .optional()
          .describe('Replace existing images (default: true for roaster logos, false for bags)'),
      }),
    },
    safe(async ({ url, base64, filename, replace, ...target }) => {
      if (!!url === !!base64) throw new ToolError('Give either url or base64.');
      const c = await load();
      const t = resolveTarget(c, target);
      const img = await call<{ id: string; width: number | null; height: number | null }>(
        'POST',
        `${t.path}/images/import`,
        { url, base64, filename, replace: replace ?? t.owner === 'roaster' },
      );
      const fresh = await load();
      const count =
        t.owner === 'bean'
          ? fresh.m.beanMap.get(t.id)!.images.length
          : fresh.state.roasters.find((r) => r.id === t.id)!.images.length;
      return {
        added: `${t.owner === 'bean' ? 'Photo' : 'Logo'} for ${t.name}`,
        size: img.width && img.height ? `${img.width}×${img.height}` : null,
        images_now: count,
      };
    }),
  );

  // ---------- prompts ----------

  const ask = (text: string) => ({
    messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }],
  });

  server.registerPrompt(
    'dial_in',
    {
      title: 'Dial in a bag',
      description: 'Read every brew of a bag and suggest the next recipe to try.',
      argsSchema: z.object({
        bean: z.string().describe('The bag, named loosely ("the kenya", "sey gachatha").'),
      }),
    },
    ({ bean }) =>
      ask(`Help me dial in "${bean}" in my Ratio coffee log.

1. get_bean it (with plenty of recent brews) and look at the dial_in table, best_brew and last_brew. Use list_brews for that bean if you need more history.
2. Compare grind, dose, ratio and temperature against rating and the extraction and strength labels. Note what moved the rating and what my "next time" notes said.
3. Suggest one next recipe (method, grinder, grind, dose, water, temperature) with a one-line reason. Change one or two things at a time, not everything.
4. Ask if I want it logged when I brew it. Only call log_brew once I say I brewed it.`),
  );

  server.registerPrompt(
    'rate_backlog',
    {
      title: 'Rate my unrated brews',
      description: 'Walk through recent unrated brews one by one and save the ratings.',
      argsSchema: z.object({
        days: z.string().optional().describe('How many days back to look (default 7).'),
      }),
    },
    ({ days }) =>
      ask(`Help me rate my unrated brews in Ratio from the last ${days || '7'} days.

1. Call coffee_overview for today's date, then list_brews with rated "unrated" and from set to that many days ago.
2. Go through them one at a time, newest first: show the bean, when, and the recipe in one line, then ask for a rating out of 10 and anything else I remember (extraction, strength, tasting notes, what to change next time).
3. Save each answer with update_brew before moving to the next. If I don't remember one, skip it without saving anything.
4. Finish with a one-line summary of what you saved.`),
  );

  server.registerPrompt(
    'what_to_order',
    {
      title: 'What should I order next?',
      description:
        'Suggest coffees from your order again shortlist and the origins and processes you rate highest.',
      argsSchema: z.object({
        notes: z
          .string()
          .optional()
          .describe(
            'Optional: budget, roaster or style you are after ("something fruity under $25").',
          ),
      }),
    },
    ({ notes }) =>
      ask(`Help me decide what coffee to order next from my Ratio log${notes ? `. I'm after: ${notes}` : ''}.

1. Call coffee_overview to see what's open, resting, frozen and on order, and how many days my stock lasts.
2. Call coffee_insights grouped by origin, then by process (min_brews 2), and read the order_again_shortlist and spend_by_roaster.
3. Recommend two or three options: reorders from the shortlist and the kinds of coffee I rate highest, with the roasters I've liked. Say whether I need to order now, given my stock.
4. If I pick one and say I've ordered it, add it with add_bean and status "ordered". Don't add anything before I confirm.`),
  );

  server.registerPrompt(
    'finish_bag',
    {
      title: 'Finish a bag',
      description:
        'Sum up a bag, mark it finished with your buy-again call, and line up the next one.',
      argsSchema: z.object({
        bean: z.string().describe('The bag you just finished, named loosely.'),
      }),
    },
    ({ bean }) =>
      ask(`I just finished "${bean}" in Ratio.

1. get_bean it and sum it up in a few lines: brews, average and best rating, the recipe that worked best, and cost per cup.
2. Ask whether I'd buy it again (definitely, yes, maybe or no), then call update_bean with status "finished" and that buy_again.
3. Call coffee_overview and suggest which bag to open next (resting bags that are ready first, then the freezer). Ask before moving it to drinking with update_bean.`),
  );

  server.registerPrompt(
    'weekly_review',
    {
      title: 'Weekly coffee review',
      description:
        'What you brewed, how it rated, what is ready to open, and how long stock lasts.',
      argsSchema: z.object({
        days: z.string().optional().describe('How many days to review (default 7).'),
      }),
    },
    ({ days }) =>
      ask(`Give me a review of my coffee from the last ${days || '7'} days in Ratio.

1. Call coffee_overview, then list_brews from that many days ago (limit 100), then coffee_insights with that many days.
2. Summarize: how many brews, average rating, the best and worst brew and why, and any pattern in the extraction labels.
3. Say what's ready to open, what's running low, and how many days my stock lasts.
4. End with one concrete thing to try next week. Don't change any data.`),
  );

  return server;
}

/** The OAuthProvider apiHandler for /mcp. Only reached with a valid token. */
export const mcpApiHandler = {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext): Promise<Response> {
    const origin = new URL(request.url).origin;
    const call = apiCaller(origin, env, ctx);
    const handler = createMcpHandler(() => buildServer(call));
    return handler.fetch(request);
  },
};
