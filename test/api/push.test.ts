// Push notifications in workerd: the Selfhost Kit's crypto (RFC 8291 / RFC 8292), its timing and
// once-a-day log, the /api/push routes, and Ratio's notifications end to end.
import { SELF } from 'cloudflare:test';
import { env } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  atOrAfterLocalHour,
  b64url,
  encryptPayload,
  fromB64url,
  listDevices,
  localDate,
  runPushJob,
  saveDevice,
  vapidAuth,
  vapidKeys,
  type PushDevice,
} from '../../src/worker/kit/push';
import { LOW_SINCE_KEY, runNotifications } from '../../src/worker/notifications';
import type { Bean } from '../../src/shared/types';
import { ORIGIN, session } from './helpers';

const txt = new TextDecoder();
const u8 = (s: string) => new Uint8Array(new TextEncoder().encode(s));

// ---- A receiving browser: its keys, and decrypting what it's sent (RFC 8291 §3) ----

async function browser() {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair;
  const pub = new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer);
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return { pair, p256dh: b64url(pub), auth: b64url(auth) };
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, n: number) {
  const k = await crypto.subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, [
    'deriveBits',
  ]);
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: info as BufferSource },
      k,
      n * 8,
    ),
  );
}

async function decrypt(b: Awaited<ReturnType<typeof browser>>, body: Uint8Array) {
  const salt = body.slice(0, 16);
  const rs = new DataView(body.buffer, body.byteOffset).getUint32(16);
  expect(rs).toBe(4096);
  const idlen = body[20]!;
  const asPublic = body.slice(21, 21 + idlen);
  const asKey = await crypto.subtle.importKey(
    'raw',
    asPublic,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const ecdh = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: asKey } as unknown as Parameters<SubtleCrypto['deriveBits']>[0],
      b.pair.privateKey,
      256,
    ),
  );
  const ua = fromB64url(b.p256dh);
  const info = new Uint8Array([...u8('WebPush: info\0'), ...ua, ...asPublic]);
  const ikm = await hkdf(fromB64url(b.auth), ecdh, info, 32);
  const cek = await hkdf(salt, ikm, u8('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, u8('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, body.slice(21 + idlen)),
  );
  expect(plain[plain.length - 1]).toBe(2); // last-record delimiter
  return JSON.parse(txt.decode(plain.slice(0, -1))) as Record<string, unknown>;
}

/** A fake push service: records each request, answers with `status`. */
function pushService(status = 201) {
  const got: { url: string; headers: Headers; body: Uint8Array }[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    got.push({
      url: String(url),
      headers: new Headers(init.headers),
      body: new Uint8Array(init.body as Uint8Array),
    });
    return new Response(null, { status });
  }) as unknown as typeof fetch;
  return { got, fetcher };
}

async function device(tz: string, prefs: Record<string, boolean> = {}) {
  const b = await browser();
  const d = await saveDevice(env.DB, {
    subscription: {
      endpoint: `https://push.example.test/${crypto.randomUUID()}`,
      keys: { p256dh: b.p256dh, auth: b.auth },
    },
    tz,
    prefs: { enabled: true, ...prefs },
  });
  return { b, d };
}

async function clearDevices() {
  for (const d of await listDevices(env.DB))
    await env.DB.prepare('DELETE FROM selfhost_push_devices WHERE id = ?').bind(d.id).run();
  await env.DB.prepare('DELETE FROM selfhost_push_sent').run();
}

afterEach(() => vi.restoreAllMocks());

describe('RFC 8291 payload encryption', () => {
  it('matches the RFC 8291 Appendix A example byte for byte', async () => {
    const body = await encryptPayload(
      u8('When I grow up, I want to be a watermelon'),
      'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
      'BTBZMqHH6r4Tts7J_aSIgg',
      {
        senderPrivate: fromB64url('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw'),
        senderPublic: fromB64url(
          'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
        ),
        salt: fromB64url('DGv6ra1nlYgDCS1FRnbzlw'),
      },
    );
    expect(b64url(body)).toBe(
      'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml' +
        'mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT' +
        'pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
    );
  });

  it('round-trips with fresh keys, and a browser can decrypt it', async () => {
    const b = await browser();
    const body = await encryptPayload(u8('{"title":"Hi"}'), b.p256dh, b.auth);
    expect(await decrypt(b, body)).toEqual({ title: 'Hi' });
  });

  it('rejects bad keys', async () => {
    await expect(encryptPayload(u8('x'), b64url(new Uint8Array(10)), 'AAAA')).rejects.toThrow();
  });
});

describe('VAPID (RFC 8292)', () => {
  it('makes keys once, stores them, and signs a JWT the public key verifies', async () => {
    const keys = await vapidKeys(env.DB);
    expect(await vapidKeys(env.DB)).toEqual(keys);
    expect(fromB64url(keys.publicKey)).toHaveLength(65);

    const now = Date.UTC(2027, 0, 1, 12);
    const header = await vapidAuth(
      keys,
      'https://web.push.apple.com/abc/def',
      'https://ratio.example.com',
      now,
    );
    const m = /^vapid t=([^,]+), k=(.+)$/.exec(header)!;
    expect(m[2]).toBe(keys.publicKey);
    const [h, c, s] = m[1]!.split('.');
    expect(JSON.parse(txt.decode(fromB64url(h!)))).toEqual({ typ: 'JWT', alg: 'ES256' });
    expect(JSON.parse(txt.decode(fromB64url(c!)))).toEqual({
      aud: 'https://web.push.apple.com',
      exp: now / 1000 + 12 * 3600,
      sub: 'https://ratio.example.com',
    });
    const pub = await crypto.subtle.importKey(
      'raw',
      fromB64url(keys.publicKey),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    const sig = fromB64url(s!);
    expect(sig).toHaveLength(64);
    expect(
      await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, sig, u8(`${h}.${c}`)),
    ).toBe(true);
  });
});

describe('local time', () => {
  const at = (iso: string) => new Date(iso);
  it('8 a.m. in each zone, across DST changes', () => {
    const NY = 'America/New_York';
    // 2027-03-14: clocks go forward in New York (EST → EDT).
    expect(atOrAfterLocalHour(at('2027-03-13T12:59Z'), NY, 8)).toBe(false); // 7:59 EST
    expect(atOrAfterLocalHour(at('2027-03-13T13:00Z'), NY, 8)).toBe(true); // 8:00 EST
    expect(atOrAfterLocalHour(at('2027-03-14T11:59Z'), NY, 8)).toBe(false); // 7:59 EDT
    expect(atOrAfterLocalHour(at('2027-03-14T12:00Z'), NY, 8)).toBe(true); // 8:00 EDT
    // 2027-10-31: clocks go back in London (BST → GMT).
    const LON = 'Europe/London';
    expect(atOrAfterLocalHour(at('2027-10-30T07:00Z'), LON, 8)).toBe(true); // 8:00 BST
    expect(atOrAfterLocalHour(at('2027-10-31T07:41Z'), LON, 8)).toBe(false); // 7:41 GMT
    expect(atOrAfterLocalHour(at('2027-10-31T08:41Z'), LON, 8)).toBe(true);
    // Half-hour zones: the :41 cron is 8:11 in India.
    expect(atOrAfterLocalHour(at('2027-06-01T02:41Z'), 'Asia/Kolkata', 8)).toBe(true);
    expect(atOrAfterLocalHour(at('2027-06-01T02:00Z'), 'Asia/Kolkata', 8)).toBe(false);
    // Not after `until`.
    expect(atOrAfterLocalHour(at('2027-06-01T21:30Z'), 'UTC', 8, 21)).toBe(false);
  });
  it('the local date, which can differ from UTC', () => {
    expect(localDate(at('2027-06-01T20:00Z'), 'Pacific/Auckland')).toBe('2027-06-02');
    expect(localDate(at('2027-06-01T02:00Z'), 'America/Los_Angeles')).toBe('2027-05-31');
    expect(localDate(at('2027-06-01T02:00Z'), 'Not/AZone')).toBe('2027-06-01'); // falls back to UTC
  });
});

describe('the notification run', () => {
  it('sends on the first hourly run at or after 8 a.m. local, once a day, in every zone', async () => {
    await clearDevices();
    const zones = [
      'America/New_York',
      'Europe/London',
      'Asia/Kolkata',
      'Pacific/Auckland',
      'America/Los_Angeles',
    ];
    for (const tz of zones) await device(tz);
    const sentAt: Record<string, string[]> = {};
    const svc = pushService();
    // Two days of the :41 cron, across New York's spring-forward night.
    for (let h = 0; h < 48; h++) {
      const now = new Date(Date.UTC(2027, 2, 13, h, 41));
      await runPushJob(env.DB, {
        now,
        fetcher: svc.fetcher,
        build: (d) => [
          { kind: 'daily', key: 'today', message: { title: 'x', body: d.tz, url: '/' } },
        ],
      });
      for (const r of svc.got.splice(0)) {
        const d = (await listDevices(env.DB)).find((x) => x.endpoint === r.url)!;
        (sentAt[d.tz] ??= []).push(
          new Intl.DateTimeFormat('en-GB', {
            timeZone: d.tz,
            dateStyle: 'short',
            timeStyle: 'short',
          }).format(now),
        );
      }
    }
    // The run starts at 00:41 UTC on the 13th, which is already past 8 a.m. on the 12th in the
    // Americas and mid-afternoon on the 13th in Auckland: those days get one late send too.
    expect(sentAt).toEqual({
      'America/New_York': ['12/03/2027, 19:41', '13/03/2027, 08:41', '14/03/2027, 08:41'],
      'Europe/London': ['13/03/2027, 08:41', '14/03/2027, 08:41'],
      'Asia/Kolkata': ['13/03/2027, 08:11', '14/03/2027, 08:11'],
      'Pacific/Auckland': ['13/03/2027, 13:41', '14/03/2027, 08:41', '15/03/2027, 08:41'],
      'America/Los_Angeles': ['12/03/2027, 16:41', '13/03/2027, 08:41', '14/03/2027, 08:41'],
    });
  });

  it('skips switched-off kinds and devices, retries failures, and drops gone devices', async () => {
    await clearDevices();
    const on = await device('UTC', { a: true, b: false });
    await device('UTC', { enabled: false });
    const build = () => [
      { kind: 'a', key: 'k', message: { title: 'A', body: '', url: '/' } },
      { kind: 'b', key: 'k', message: { title: 'B', body: '', url: '/' } },
    ];
    const now = new Date('2027-06-01T09:41Z');
    const failing = pushService(500);
    expect(await runPushJob(env.DB, { now, build, fetcher: failing.fetcher })).toEqual({
      sent: 0,
      failed: 1,
      gone: 0,
    });
    const ok = pushService();
    const r = await runPushJob(env.DB, { now, build, fetcher: ok.fetcher, badge: () => 4 });
    expect(r).toEqual({ sent: 1, failed: 0, gone: 0 });
    expect(await decrypt(on.b, ok.got[0]!.body)).toMatchObject({ title: 'A', badge: 4 });
    expect(ok.got[0]!.headers.get('Content-Encoding')).toBe('aes128gcm');
    expect(ok.got[0]!.headers.get('TTL')).toBe('86400');
    expect(ok.got[0]!.headers.get('Authorization')).toMatch(/^vapid t=.+, k=/);
    // Already sent today.
    expect((await runPushJob(env.DB, { now, build, fetcher: ok.fetcher })).sent).toBe(0);
    // The next day, the push service says the subscription is gone: the device goes.
    const gone = pushService(410);
    const next = new Date('2027-06-02T09:41Z');
    expect((await runPushJob(env.DB, { now: next, build, fetcher: gone.fetcher })).gone).toBe(1);
    expect((await listDevices(env.DB)).map((d) => d.prefs.enabled)).toEqual([false]);
  });

  it('sends “Beans running low” once per drop, at 8 a.m. on the device’s clock', async () => {
    await clearDevices();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM brews'),
      env.DB.prepare('DELETE FROM beans'),
      env.DB.prepare('DELETE FROM settings WHERE key = ?').bind(LOW_SINCE_KEY),
    ]);
    const api = await session();
    // A finished bag with a 20 g brew on each of the 28 days before June 3 (UTC).
    const old = (
      await api.post<Bean>('/beans', { name: 'Old bag', status: 'finished', bag_g: 560 })
    ).data;
    for (let d = 1; d <= 28; d++)
      await api.post('/brews', {
        bean_id: old.id,
        dose_g: 20,
        brewed_at: new Date(Date.UTC(2031, 5, 3 - d, 7)).toISOString(),
      });
    const open = (
      await api.post<Bean>('/beans', { name: 'Open bag', status: 'drinking', bag_g: 400 })
    ).data;
    const bag = (g: number) => api.patch(`/beans/${open.id}`, { bag_g: g });
    const since = async () =>
      (
        await env.DB.prepare('SELECT value FROM settings WHERE key = ?')
          .bind(LOW_SINCE_KEY)
          .first<{ value: string }>()
      )?.value ?? null;
    const lis = await device('Europe/Lisbon');
    const svc = pushService();
    const run = (iso: string) =>
      runNotifications(env.DB, { now: new Date(iso), fetcher: svc.fetcher });
    const bodies = async () => Promise.all(svc.got.splice(0).map((r) => decrypt(lis.b, r.body)));

    // June 3, 8:41 in Lisbon: 400 g at ~19 g a day is 21 days. Not low.
    await run('2031-06-03T07:41Z');
    expect(await bodies()).toEqual([]);
    expect(await since()).toBeNull();

    // Down to 200 g (~10 days). 7:41 in Lisbon: the spell starts, but it's too early to send.
    await bag(200);
    await run('2031-06-03T06:41Z');
    expect(await bodies()).toEqual([]);
    expect(await since()).toBe('2031-06-03');
    // 8:41: sent.
    await run('2031-06-03T07:41Z');
    expect(await bodies()).toEqual([
      {
        title: 'Beans running low',
        body: 'About 10 days of coffee left. Time to order more.',
        url: '/beans',
        tag: 'beans-low',
        icon: '/pwa-192x192.png',
      },
    ]);
    // Still low later that day and the next morning: not again.
    await run('2031-06-03T15:41Z');
    await run('2031-06-04T07:41Z');
    expect(await bodies()).toEqual([]);
    expect(await since()).toBe('2031-06-03');

    // A bigger bag: back above two weeks, the spell ends.
    await bag(400);
    await run('2031-06-05T07:41Z');
    expect(await bodies()).toEqual([]);
    expect(await since()).toBeNull();

    // Drops again: sent again (~12 days now that fewer brews are in the last 28 days).
    await bag(200);
    await run('2031-06-06T07:41Z');
    expect((await bodies()).map((p) => p.body)).toEqual([
      'About 12 days of coffee left. Time to order more.',
    ]);
    expect(await since()).toBe('2031-06-06');

    // A bag on order isn't in hand yet: the spell goes on (already sent, so nothing new).
    await api.post('/beans', { name: 'On the way', status: 'ordered', bag_g: 340 });
    await run('2031-06-07T07:41Z');
    expect(await bodies()).toEqual([]);
    expect(await since()).toBe('2031-06-06');

    // The spell (still running) isn't in backups.
    const exp = await api.get<{ tables: { settings: { key: string }[] } }>('/export');
    expect(exp.data.tables.settings.map((s) => s.key)).not.toContain(LOW_SINCE_KEY);

    // Switched off on this device: nothing.
    await env.DB.prepare('DELETE FROM settings WHERE key = ?').bind(LOW_SINCE_KEY).run();
    await env.DB.prepare("DELETE FROM beans WHERE status = 'ordered'").run();
    await env.DB.prepare('UPDATE selfhost_push_devices SET prefs = ? WHERE id = ?')
      .bind(JSON.stringify({ enabled: true, beans: false }), lis.d.id)
      .run();
    await run('2031-06-08T07:41Z');
    expect(await bodies()).toEqual([]);

    await env.DB.batch([
      env.DB.prepare('DELETE FROM brews'),
      env.DB.prepare('DELETE FROM beans'),
      env.DB.prepare('DELETE FROM settings WHERE key = ?').bind(LOW_SINCE_KEY),
    ]);
  });

  it('sends “Beans running low” at any hour after 8, even with a bag on order', async () => {
    await clearDevices();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM brews'),
      env.DB.prepare('DELETE FROM beans'),
      env.DB.prepare('DELETE FROM settings WHERE key = ?').bind(LOW_SINCE_KEY),
    ]);
    const api = await session();
    const old = (
      await api.post<Bean>('/beans', { name: 'Old bag', status: 'finished', bag_g: 560 })
    ).data;
    for (let d = 1; d <= 28; d++)
      await api.post('/brews', {
        bean_id: old.id,
        dose_g: 20,
        brewed_at: new Date(Date.UTC(2031, 6, 9 - d, 7)).toISOString(),
      });
    await api.post('/beans', { name: 'Open bag', status: 'drinking', bag_g: 150 });
    await api.post('/beans', { name: 'On the way', status: 'ordered', bag_g: 340 });
    const svc = pushService();
    const run = (iso: string) =>
      runNotifications(env.DB, { now: new Date(iso), fetcher: svc.fetcher });
    const utc = await device('UTC');
    // 7:41 local: low, but too early to send.
    await run('2031-07-09T07:41Z');
    expect(svc.got).toHaveLength(0);
    // That device goes; another turns notifications on at 22:00 and the 22:41 run sends it.
    await env.DB.prepare('DELETE FROM selfhost_push_devices WHERE id = ?').bind(utc.d.id).run();
    const late = await device('UTC');
    await run('2031-07-09T22:41Z');
    expect(svc.got.map((r) => r.url)).toEqual([late.d.endpoint]);
    expect(await decrypt(late.b, svc.got[0]!.body)).toMatchObject({ title: 'Beans running low' });

    await env.DB.batch([
      env.DB.prepare('DELETE FROM brews'),
      env.DB.prepare('DELETE FROM beans'),
      env.DB.prepare('DELETE FROM settings WHERE key = ?').bind(LOW_SINCE_KEY),
    ]);
  });
});

describe('Ratio’s once-per-bag and evening notifications', () => {
  it('sends each once, at its hour, linked to the bag or the unrated brews', async () => {
    await clearDevices();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM brews'),
      env.DB.prepare('DELETE FROM beans'),
      env.DB.prepare('DELETE FROM settings WHERE key = ?').bind(LOW_SINCE_KEY),
    ]);
    const api = await session();
    const add = async (b: Record<string, unknown>) => (await api.post<Bean>('/beans', b)).data;
    const kenya = await add({
      name: 'Kenya Gichathaini',
      status: 'resting',
      bag_g: 250,
      received_on: '2031-08-05',
      rest_until: '2031-08-12',
    });
    const guji = await add({
      name: 'Ethiopia Guji',
      status: 'freezing',
      bag_g: 250,
      received_on: '2031-05-13', // 91 days before Aug 12
    });
    const ordered = await add({ name: 'Colombia Pink Bourbon', status: 'ordered', bag_g: 250 });
    await env.DB.prepare('UPDATE beans SET created_at = ? WHERE id = ?')
      .bind('2031-08-04T10:00:00.000Z', ordered.id) // 8 days before Aug 12
      .run();
    const lis = await device('Europe/Lisbon'); // UTC+1 in August
    const svc = pushService();
    const run = (iso: string) =>
      runNotifications(env.DB, { now: new Date(iso), fetcher: svc.fetcher });
    const got = async () =>
      (await Promise.all(svc.got.splice(0).map((r) => decrypt(lis.b, r.body)))).map(
        (p) => `${p.title} | ${p.body} | ${p.url}`,
      );

    // 7:41 in Lisbon: too early.
    await run('2031-08-12T06:41Z');
    expect(await got()).toEqual([]);
    // 8:41: the bag that's ready, the order and the freezer.
    await run('2031-08-12T07:41Z');
    expect(await got()).toEqual([
      `Bag ready to drink | Kenya Gichathaini is ready to drink. | /beans?bean=${kenya.id}`,
      `Order arrived? | Did Colombia Pink Bourbon arrive? Mark it as received. | /beans?bean=${ordered.id}`,
      `Freezer reminder | Ethiopia Guji has been frozen for 3 months. | /beans?bean=${guji.id}`,
    ]);

    // Two brews that morning, one rated. 19:41: not yet; 20:41: the nudge; 22:41: not again.
    for (const rating of [null, 4])
      await api.post('/brews', {
        bean_id: kenya.id,
        dose_g: 20,
        rating,
        brewed_at: '2031-08-12T06:30:00.000Z',
      });
    await run('2031-08-12T18:41Z');
    expect(await got()).toEqual([]);
    await run('2031-08-12T19:41Z');
    expect(await got()).toEqual([
      'Rate your brew | 1 brew today isn’t rated yet. | /journal?rated=unrated',
    ]);
    await run('2031-08-12T21:41Z');
    expect(await got()).toEqual([]);

    // The next days: none of the bags again, while all three still qualify.
    for (const day of ['13', '14', '15', '20']) await run(`2031-08-${day}T19:41Z`);
    expect(await got()).toEqual([]);

    // Open the bag and brew it down: one "almost empty" (the 28th leaves 40 g, 2 brews; sent a day
    // late on the 29th, with 30 g left), then never again.
    await api.patch(`/beans/${kenya.id}`, { status: 'drinking' });
    for (let d = 21; d <= 29; d++)
      await api.post('/brews', {
        bean_id: kenya.id,
        dose_g: 20,
        rating: 4,
        brewed_at: `2031-08-${d}T06:30:00.000Z`,
      });
    await run('2031-08-29T07:41Z');
    expect(await got()).toEqual([
      `Bag almost empty | Kenya Gichathaini has about 2 brews left. | /beans?bean=${kenya.id}`,
    ]);
    await run('2031-08-30T07:41Z');
    expect(await got()).toEqual([]);

    // Each kind has its own switch.
    await env.DB.prepare('UPDATE selfhost_push_devices SET prefs = ? WHERE id = ?')
      .bind(JSON.stringify({ enabled: true, rate: false }), lis.d.id)
      .run();
    const unrated = await api.post('/brews', {
      bean_id: guji.id,
      dose_g: 18,
      brewed_at: '2031-08-31T06:30:00.000Z',
    });
    expect(unrated.status).toBe(201);
    await run('2031-08-31T20:41Z');
    expect(await got()).toEqual([]);
    // Back on: it comes.
    await env.DB.prepare('UPDATE selfhost_push_devices SET prefs = ? WHERE id = ?')
      .bind(JSON.stringify({ enabled: true }), lis.d.id)
      .run();
    await run('2031-08-31T21:41Z');
    expect(await got()).toEqual([
      'Rate your brew | 1 brew today isn’t rated yet. | /journal?rated=unrated',
    ]);

    await env.DB.batch([env.DB.prepare('DELETE FROM brews'), env.DB.prepare('DELETE FROM beans')]);
  });
});

describe('/api/push', () => {
  it('needs a session', async () => {
    const r = await SELF.fetch(`${ORIGIN}/api/push/key`);
    expect(r.status).toBe(401);
    expect(r.status).not.toBe(200);
  });

  it('subscribes this device, keeps its choices, tests, badges and unsubscribes', async () => {
    await clearDevices();
    const api = await session();
    const { data: key } = await api.get<{ key: string }>('/push/key');
    expect(key.key).toBe((await vapidKeys(env.DB)).publicKey);

    const b = await browser();
    const endpoint = `https://push.example.test/${crypto.randomUUID()}`;
    const sub = { endpoint, keys: { p256dh: b.p256dh, auth: b.auth } };
    expect((await api.post('/push/device', { endpoint })).data).toEqual({ device: null });
    expect(
      (await api.post('/push/subscribe', { subscription: { endpoint: 'http://x' } })).status,
    ).toBe(400);
    const s = await api.post<{ device: Pick<PushDevice, 'tz' | 'prefs'> }>('/push/subscribe', {
      subscription: sub,
      tz: 'Europe/Lisbon',
      prefs: { enabled: true, beans: true },
    });
    expect(s.status).toBe(200);
    expect(s.data.device).toMatchObject({
      tz: 'Europe/Lisbon',
      prefs: { enabled: true, beans: true },
    });

    const p = await api.patch<{ device: Pick<PushDevice, 'tz' | 'prefs'> }>('/push/prefs', {
      endpoint,
      prefs: { beans: false, 'bad key!': true, other: 'yes' },
      tz: 'Asia/Tokyo',
    });
    expect(p.data.device).toMatchObject({
      tz: 'Asia/Tokyo',
      prefs: { enabled: true, beans: false },
    });
    expect(Object.keys(p.data.device.prefs)).not.toContain('bad key!');
    expect(Object.keys(p.data.device.prefs)).not.toContain('other');
    // Subscribing again (new keys) keeps the device's choices.
    const again = await api.post<{ device: Pick<PushDevice, 'prefs'> }>('/push/subscribe', {
      subscription: sub,
      prefs: { enabled: true },
    });
    expect(again.data.device.prefs.beans).toBe(false);

    // The test notification goes to the push service, encrypted for this device.
    const sent: { url: string; body: Uint8Array }[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      sent.push({ url: String(input), body: new Uint8Array(init!.body as Uint8Array) });
      return new Response(null, { status: 201 });
    });
    const t = await api.post<{ result: string }>('/push/test', { endpoint });
    expect(t).toEqual({ status: 200, data: { result: 'sent' } });
    expect(sent[0]!.url).toBe(endpoint);
    const test = await decrypt(b, sent[0]!.body);
    expect(test).toMatchObject({ title: 'Ratio notifications are on', url: '/settings' });
    expect(test).not.toHaveProperty('badge'); // Ratio has no app-icon count
    vi.restoreAllMocks();

    expect((await api.post('/push/badge', { endpoint })).data).toEqual({ count: 0 });
    expect((await api.post('/push/unsubscribe', { endpoint })).data).toEqual({ ok: true });
    expect((await api.post('/push/device', { endpoint })).data).toEqual({ device: null });
    expect((await api.post('/push/test', { endpoint })).status).toBe(404);
  });
});
