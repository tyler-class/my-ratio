// One-time photo upload links. An assistant can't pass a photo from the chat to a tool, so
// it hands out a link instead: open it on the phone, take or pick a photo, and it lands on
// the bean or roaster. The token in the link is the only credential; it lasts 30 minutes
// and allows a handful of uploads.
import { Hono } from 'hono';
import { z } from 'zod';
import { first, nowIso } from './db';
import { MAX_IMAGE_BYTES, storeImage, TABLE, type OwnerType } from './routes/images';
import { ApiError, body, type AppEnv } from './routes/util';

export const LINK_MINUTES = 30;
export const LINK_MAX_UPLOADS = 10;

const enc = new TextEncoder();
async function hash(token: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(token));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function newToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...b))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ---------- API (signed in, or internal for MCP) ----------

export const uploadLinks = new Hono<AppEnv>();

const linkInput = z.object({
  owner_type: z.enum(['bean', 'roaster']),
  owner_id: z.string().min(1),
  replace: z.boolean().optional(),
});

uploadLinks.post('/upload-links', async (c) => {
  const { owner_type, owner_id, replace } = await body(c, linkInput);
  const owner = await first<{ name: string }>(
    c.env.DB,
    `SELECT name FROM ${TABLE[owner_type]} WHERE id = ?`,
    owner_id,
  );
  if (!owner)
    throw new ApiError(
      404,
      'not_found',
      `${owner_type === 'bean' ? 'Bean' : 'Roaster'} not found.`,
    );
  const token = newToken();
  const expires = new Date(Date.now() + LINK_MINUTES * 60_000).toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM upload_links WHERE expires_at < ?').bind(nowIso()),
    c.env.DB.prepare(
      'INSERT INTO upload_links (token_hash, owner_type, owner_id, replace_existing, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).bind(await hash(token), owner_type, owner_id, replace ? 1 : 0, expires, nowIso()),
  ]);
  const origin = new URL(c.req.url).origin;
  return c.json({ url: `${origin}/upload/${token}`, expires_at: expires, for: owner.name }, 201);
});

// ---------- public page ----------

interface Link {
  owner_type: OwnerType;
  owner_id: string;
  replace_existing: number;
  uploads: number;
  expires_at: string;
  name: string | null;
}

async function findLink(db: D1Database, token: string): Promise<Link | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const l = await first<Link>(
    db,
    `SELECT l.*, COALESCE(b.name, r.name) AS name FROM upload_links l
     LEFT JOIN beans b ON l.owner_type = 'bean' AND b.id = l.owner_id
     LEFT JOIN roasters r ON l.owner_type = 'roaster' AND r.id = l.owner_id
     WHERE l.token_hash = ?`,
    await hash(token),
  );
  if (!l || l.expires_at < nowIso() || l.uploads >= LINK_MAX_UPLOADS || !l.name) return null;
  return l;
}

const esc = (v: string) => v.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

function page(nonce: string, title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>${esc(title)} · Ratio</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style nonce="${nonce}">
:root{--bg:#f5eee3;--surface:#fffcf8;--ink:#2a1b11;--soft:#7b6552;--line:#e3d5bf;--accent:#a4542a;--accent-ink:#fff7ee;--tint:#f3dfca;--bad:#b2453a;--good:#58804a;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#150f0b;--surface:#201711;--ink:#f4e9db;--soft:#b7a28d;--line:#3b2c20;--accent:#e0914f;--accent-ink:#1b0f07;--tint:#3d2818;--bad:#e07d6e;--good:#92b87f;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink);font:16px/1.5 -apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif;padding:24px max(16px,env(safe-area-inset-left))}
main{width:100%;max-width:400px;display:flex;flex-direction:column;gap:16px}
h1{font:600 26px/1.2 "Iowan Old Style",Palatino,Georgia,serif;margin:0}
p{margin:0;color:var(--soft)}
.btn{display:flex;align-items:center;justify-content:center;gap:8px;min-height:52px;border-radius:14px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font:600 17px system-ui;cursor:pointer}
.btn.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
.btn[aria-disabled=true]{opacity:.5;pointer-events:none}
input{display:none}
#shots{display:flex;gap:8px;flex-wrap:wrap}#shots img{width:96px;height:96px;object-fit:cover;border-radius:12px;border:1px solid var(--line)}
#msg.bad{color:var(--bad)}#msg.good{color:var(--good)}
.mark{width:44px;height:44px;border-radius:12px}
</style></head><body><main>
<img class="mark" src="/favicon.svg" alt="">
${body}
</main></body></html>`;
}

function html(body: string, nonce: string, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': `default-src 'none'; img-src 'self' blob:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; connect-src 'self'; frame-ancestors 'none'`,
    },
  });
}

export const uploadPage = new Hono<{ Bindings: Cloudflare.Env }>();

uploadPage.get('/upload/:token', async (c) => {
  const nonce = newToken();
  const link = await findLink(c.env.DB, c.req.param('token'));
  if (!link)
    return html(
      page(
        nonce,
        'Link expired',
        '<h1>This link has expired</h1><p>Ask your assistant for a new photo link.</p>',
      ),
      nonce,
      404,
    );
  const what = link.owner_type === 'bean' ? 'bag photo' : 'logo';
  const replace = link.replace_existing ? '<p>This replaces the current logo.</p>' : '';
  return html(
    page(
      nonce,
      `Add a ${what}`,
      `<h1>Add a ${what}</h1>
<p>For <strong>${esc(link.name!)}</strong>. Take a photo or pick one from your library.</p>${replace}
<label class="btn primary" id="pick">Choose photo<input id="file" type="file" accept="image/*" ${link.owner_type === 'bean' ? 'multiple' : ''}></label>
<div id="shots"></div><p id="msg" role="status"></p>
<script nonce="${nonce}">
const MAX=${link.owner_type === 'bean' ? 1600 : 800};
const file=document.getElementById('file'),msg=document.getElementById('msg'),shots=document.getElementById('shots'),pick=document.getElementById('pick');
async function shrink(f){
  const bmp=await createImageBitmap(f,{imageOrientation:'from-image'});
  const s=Math.min(1,MAX/Math.max(bmp.width,bmp.height));
  const w=Math.round(bmp.width*s),h=Math.round(bmp.height*s);
  const cv=document.createElement('canvas');cv.width=w;cv.height=h;cv.getContext('2d').drawImage(bmp,0,0,w,h);bmp.close();
  const png=/png|webp|gif/.test(f.type);
  const blob=await new Promise(r=>cv.toBlob(r,png?'image/png':'image/jpeg',.85));
  return {blob,w,h};
}
file.addEventListener('change',async()=>{
  const fs=[...file.files];file.value='';if(!fs.length)return;
  pick.setAttribute('aria-disabled','true');msg.className='';
  let ok=0;
  for(const f of fs){
    msg.textContent='Uploading '+(ok+1)+' of '+fs.length+'…';
    try{
      const {blob,w,h}=await shrink(f);
      const r=await fetch(location.pathname,{method:'POST',headers:{'Content-Type':blob.type,'X-Image-Width':w,'X-Image-Height':h,'X-Filename':encodeURIComponent(f.name)},body:blob});
      const j=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(j.message||'Upload failed.');
      const img=document.createElement('img');img.src=URL.createObjectURL(blob);img.alt='';shots.append(img);ok++;
    }catch(e){msg.className='bad';msg.textContent=e.message||'Upload failed.';pick.removeAttribute('aria-disabled');return}
  }
  msg.className='good';msg.textContent=ok===1?'Added. You can close this page.':'Added '+ok+' photos. You can close this page.';
  pick.removeAttribute('aria-disabled');pick.firstChild.textContent='Add another';
});
</script>`,
    ),
    nonce,
  );
});

uploadPage.post('/upload/:token', async (c) => {
  const origin = c.req.header('Origin');
  if (origin && new URL(origin).host !== new URL(c.req.url).host)
    return c.json({ message: 'Cross-site request blocked.' }, 403);
  const link = await findLink(c.env.DB, c.req.param('token'));
  if (!link) return c.json({ message: 'This link has expired. Ask for a new one.' }, 404);
  if (Number(c.req.header('Content-Length') ?? 0) > MAX_IMAGE_BYTES)
    return c.json({ message: 'That image is too big (15 MB max).' }, 413);
  // Count the upload first, so parallel requests can't exceed the limit.
  const claimed = await c.env.DB.prepare(
    'UPDATE upload_links SET uploads = uploads + 1 WHERE token_hash = ? AND uploads < ?',
  )
    .bind(await hash(c.req.param('token')), LINK_MAX_UPLOADS)
    .run();
  if (!claimed.meta.changes) return c.json({ message: 'This link has been used up.' }, 410);
  const int = (h: string) => {
    const x = Number.parseInt(c.req.header(h) ?? '', 10);
    return Number.isFinite(x) && x > 0 && x < 100_000 ? x : null;
  };
  try {
    const name = c.req.header('X-Filename');
    const img = await storeImage(c.env, {
      owner: link.owner_type,
      ownerId: link.owner_id,
      bytes: await c.req.arrayBuffer(),
      filename: name ? decodeURIComponent(name) : null,
      width: int('X-Image-Width'),
      height: int('X-Image-Height'),
      replace: !!link.replace_existing,
    });
    return c.json(img, 201);
  } catch (e) {
    if (e instanceof ApiError) return c.json({ message: e.message }, e.status);
    throw e;
  }
});
