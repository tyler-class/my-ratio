import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { EXAMPLE_PROMPTS, MCP_PROMPTS } from '@shared/examples';
import { ORIGIN, PASSWORD, session } from './helpers';

const REDIRECT = 'https://client.example/callback';
const PIXEL =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

async function pkce() {
  const verifier = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(
    /[+/=]/g,
    '',
  );
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return { verifier, challenge };
}

function cookies(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}

async function connect(password = PASSWORD) {
  const reg = await SELF.fetch(`${ORIGIN}/oauth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Test Assistant',
      redirect_uris: [REDIRECT],
      token_endpoint_auth_method: 'none',
    }),
  });
  expect(reg.status).toBe(201);
  const client = (await reg.json()) as { client_id: string };
  const { verifier, challenge } = await pkce();
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: client.client_id,
    redirect_uri: REDIRECT,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: 'xyz',
    scope: 'coffee',
    resource: `${ORIGIN}/mcp`,
  });
  const page = await SELF.fetch(`${ORIGIN}/authorize?${q}`);
  expect(page.status).toBe(200);
  // A form-action CSP would block the browser from following the redirect back to the client.
  expect(page.headers.get('Content-Security-Policy') ?? '').not.toMatch(/form-action/);
  const html = await page.text();
  expect(html).toContain('Let Test Assistant use Ratio?');
  expect(html).toContain('client.example');
  const handle = /name="handle" value="([^"]+)"/.exec(html)![1]!;
  const form = (pw: string) =>
    new URLSearchParams({
      handle,
      decision: 'approve',
      password: pw,
      client_name: 'Test Assistant',
      redirect_host: 'client.example',
    });
  const post = (pw: string) =>
    SELF.fetch(`${ORIGIN}/authorize`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: cookies(page),
        'CF-Connecting-IP': '198.18.0.9',
      },
      body: form(pw),
    });
  if (password !== PASSWORD) return { res: await post(password) };
  const wrong = await post('nope');
  expect(wrong.status).toBe(401);
  expect(await wrong.text()).toContain('That password is not right.');
  const ok = await post(PASSWORD);
  expect(ok.status).toBe(302);
  const loc = new URL(ok.headers.get('Location')!);
  expect(loc.origin + loc.pathname).toBe(REDIRECT);
  expect(loc.searchParams.get('state')).toBe('xyz');
  const tok = await SELF.fetch(`${ORIGIN}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: loc.searchParams.get('code')!,
      code_verifier: verifier,
      redirect_uri: REDIRECT,
      client_id: client.client_id,
      resource: `${ORIGIN}/mcp`,
    }),
  });
  expect(tok.status).toBe(200);
  return { token: ((await tok.json()) as { access_token: string }).access_token };
}

let rpcId = 0;
async function rpc(token: string, method: string, params: unknown = {}) {
  const res = await SELF.fetch(`${ORIGIN}/mcp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2025-06-18',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
  });
  const body = await res.text();
  const json = body.startsWith('{') ? body : (/^data: (.*)$/m.exec(body)?.[1] ?? body);
  return {
    status: res.status,
    data: JSON.parse(json) as {
      result?: { content?: { text: string }[]; tools?: { name: string }[]; isError?: boolean };
      error?: unknown;
    },
  };
}

interface Result {
  result?: { content?: { text: string }[]; tools?: { name: string }[]; isError?: boolean };
}
async function tool<T = unknown>(token: string, name: string, args: unknown = {}) {
  const r = await rpc(token, 'tools/call', { name, arguments: args });
  const res = (r.data as Result).result!;
  const text = res.content![0]!.text;
  if (res.isError) return { error: text, data: null as T };
  return {
    error: null,
    data: (text.startsWith('{') || text.startsWith('[') ? JSON.parse(text) : text) as T,
  };
}

describe('MCP', () => {
  it('advertises OAuth and rejects requests without a token', async () => {
    const res = await SELF.fetch(`${ORIGIN}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toMatch(/resource_metadata=/);
    const meta = (await (
      await SELF.fetch(`${ORIGIN}/.well-known/oauth-protected-resource/mcp`)
    ).json()) as { resource: string; authorization_servers: string[] };
    expect(meta.resource).toBe(`${ORIGIN}/mcp`);
    expect(meta.authorization_servers).toEqual([ORIGIN]);
  });

  it('connects with the password and reads, logs and updates the coffee log', async () => {
    const api = await session();
    await api.patch('/settings', {
      time_zone: 'America/New_York',
      temp_unit: 'F',
      grinders: ['Fellow Ode'],
    });
    const { token } = await connect();
    const t = token!;

    const init = await rpc(t, 'initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'test', version: '1' },
    });
    expect(init.status).toBe(200);
    const instructions = (init.data.result as { instructions?: string } | undefined)?.instructions;
    expect(instructions).toContain('call get_started');
    expect(instructions).toContain(EXAMPLE_PROMPTS[0]!.prompt);
    const tools = await rpc(t, 'tools/list');
    expect(tools.data.result!.tools!.map((x) => x.name)).toEqual(
      expect.arrayContaining([
        'coffee_overview',
        'get_started',
        'find_beans',
        'get_bean',
        'list_brews',
        'get_brew',
        'log_brew',
        'update_brew',
        'delete_brew',
        'add_bean',
        'update_bean',
        'list_roasters',
        'save_roaster',
        'coffee_insights',
        'photo_upload_link',
        'add_photo',
      ]),
    );

    // A new bag from a roaster that doesn't exist yet.
    const added = await tool<{ added: { id: string; roaster: string }; notes: string[] }>(
      t,
      'add_bean',
      {
        name: 'Kenya Gachatha AA',
        roaster: 'Sey Coffee',
        status: 'drinking',
        bag_g: 250,
        cost: 26,
        origins: ['Kenya'],
      },
    );
    expect(added.error).toBeNull();
    expect(added.data.added.roaster).toBe('Sey Coffee');
    expect(added.data.notes.join(' ')).toMatch(/Added roaster/);

    // First brew: full recipe, temperature in °F.
    const first = await tool<{ logged: { num: number; ratio: string; water_temp: string } }>(
      t,
      'log_brew',
      {
        bean: 'gachatha',
        method: 'V60',
        grind: 6.2,
        dose_g: 20,
        ratio: 16,
        water_temp: 201,
        next_time: 'Grind finer',
      },
    );
    expect(first.error).toBeNull();
    expect(first.data.logged).toMatchObject({ ratio: '1:16', water_temp: '201°F' });

    // Second brew names nothing but the rating: bean, recipe and temp carry over.
    const second = await tool<{
      logged: {
        num: number;
        bean: string;
        grind: number;
        dose_g: number;
        water_ml: number;
        rating: number;
      };
      copied_from: string;
      reminder: string;
    }>(t, 'log_brew', { rating: 8, extraction: 'under', tasting_notes: 'Bright, a bit sour' });
    expect(second.error).toBeNull();
    expect(second.data.logged).toMatchObject({
      bean: 'Kenya Gachatha AA',
      grind: 6.2,
      dose_g: 20,
      water_ml: 320,
      rating: 8,
    });
    expect(second.data.logged.num).toBe(first.data.logged.num + 1);
    expect(second.data.reminder).toContain('Grind finer');

    // Rate the first one by number, then fix the last one.
    const rated = await tool<{ updated: { rating: number } }>(t, 'update_brew', {
      brew: `#${first.data.logged.num}`,
      rating: 7.5,
    });
    expect(rated.data.updated.rating).toBe(7.5);
    const fixed = await tool<{ updated: { grind: number; when: string } }>(t, 'update_brew', {
      brew: 'last',
      grind: 6,
      brewed_at: '2026-11-04 07:15',
    });
    expect(fixed.data.updated.grind).toBe(6);
    expect(fixed.data.updated.when).toContain('7:15');

    const brews = await tool<{ count: number; avg_rating: number }>(t, 'list_brews', {
      bean: 'kenya',
    });
    expect(brews.data).toMatchObject({ count: 2, avg_rating: 7.8 });

    const detail = await tool<{ used_g: number; remaining_g: number; dial_in: unknown[] }>(
      t,
      'get_bean',
      { bean: 'Sey Kenya' },
    );
    expect(detail.data).toMatchObject({ used_g: 40, remaining_g: 210 });

    const over = await tool<{
      drinking: { name: string }[];
      equipment: { grinders: string[] };
      units: { temperature: string };
    }>(t, 'coffee_overview');
    expect(over.data.drinking.map((b) => b.name)).toContain('Kenya Gachatha AA');
    expect(over.data.units.temperature).toBe('°F');

    const done = await tool<{
      updated: { status: string; finished_on: string; buy_again: string };
    }>(t, 'update_bean', {
      bean: 'gachatha',
      status: 'finished',
      buy_again: 'definitely',
    });
    expect(done.data.updated).toMatchObject({ status: 'finished', buy_again: 'Definitely' });
    expect(done.data.updated.finished_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const ins = await tool<{ order_again_shortlist: { bean: string }[] }>(t, 'coffee_insights', {
      group_by: 'origin',
      min_brews: 1,
    });
    expect(ins.data.order_again_shortlist.map((b) => b.bean)).toContain('Kenya Gachatha AA');

    // Photos: a link to tap on the phone, or an image from data.
    const link = await tool<{ link: string; for: string }>(t, 'photo_upload_link', {
      bean: 'gachatha',
    });
    expect(link.error).toBeNull();
    expect(link.data.for).toBe('bag photo for Kenya Gachatha AA');
    const up = await SELF.fetch(link.data.link.replace(/^https:\/\/[^/]+/, ORIGIN), {
      method: 'POST',
      headers: { Origin: ORIGIN, 'Content-Type': 'image/png' },
      body: Uint8Array.from(atob(PIXEL), (ch) => ch.charCodeAt(0)),
    });
    expect(up.status).toBe(201);
    const logo = await tool<{ added: string; images_now: number }>(t, 'add_photo', {
      roaster: 'sey',
      base64: PIXEL,
    });
    expect(logo.data).toMatchObject({ added: 'Logo for Sey Coffee', images_now: 1 });
    const both = await tool(t, 'add_photo', { bean: 'gachatha', roaster: 'sey', base64: PIXEL });
    expect(both.error).toMatch(/either bean or roaster/);

    // Mistakes come back as readable tool errors.
    const unknown = await tool(t, 'get_bean', { bean: 'nonexistent coffee' });
    expect(unknown.error).toMatch(/No bean matches/);
    const risky = await tool(t, 'delete_brew', { brew: 'last' });
    expect(risky.error).toMatch(/brew number/);
    const del = await tool<string>(t, 'delete_brew', { brew: String(second.data.logged.num) });
    expect(del.data).toMatch(/Deleted brew/);

    // Orientation: the log's state, the shared examples and the ready-made prompts.
    const start = await tool<string>(t, 'get_started');
    expect(start.data).toContain('brews logged');
    expect(start.data).toContain('finished');
    for (const e of EXAMPLE_PROMPTS) expect(start.data).toContain(e.prompt);
    for (const pr of MCP_PROMPTS) expect(start.data).toContain(pr.name);

    const prompts = (await rpc(t, 'prompts/list')).data.result as unknown as {
      prompts: { name: string; title: string }[];
    };
    expect(prompts.prompts.map((x) => x.name).sort()).toEqual(
      MCP_PROMPTS.map((x) => x.name).sort(),
    );
    const got = await rpc(t, 'prompts/get', {
      name: 'dial_in',
      arguments: { bean: 'the gachatha' },
    });
    expect(JSON.stringify(got.data.result)).toContain('the gachatha');
    const review = await rpc(t, 'prompts/get', {
      name: 'weekly_review',
      arguments: { days: '14' },
    });
    expect(JSON.stringify(review.data.result)).toContain('last 14 days');

    // The app lists the connection and can revoke it.
    const conns = (await api.get<{ connections: { name: string }[] }>('/connections')).data;
    expect(conns.connections.map((c) => c.name)).toContain('Test Assistant');
    expect((await api.post('/connections/revoke-all')).status).toBe(200);
    expect((await rpc(t, 'tools/list')).status).toBe(401);
  });

  it('does not issue a token for a wrong password', async () => {
    const { res } = await connect('wrong');
    expect(res!.status).toBe(401);
  });
});
