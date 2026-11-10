// Worker entry. OAuthProvider sits in front so AI assistants can connect over MCP:
//   /mcp            → MCP server (needs an OAuth token)
//   /authorize      → consent page (approve with the Ratio password)
//   /oauth/*, /.well-known/* → handled by the provider
//   /api/*          → the app's REST API (cookie session)
import { OAuthProvider } from '@cloudflare/workers-oauth-provider';
import { app } from './app';
import { handleAuthorize } from './consent';
import { mcpApiHandler } from './mcp';
import { uploadPage } from './uploads';
import { checkIn, checkInOnRequest, type CheckInOptions } from './kit/telemetry';
import { runNotifications } from './notifications';
import { buildFlags } from '../shared/kit/build';
import { version } from '../../package.json';

/** Tables whose row counts are sent in the anonymous daily check-in (counts only). */
export const USAGE_TABLES = ['roasters', 'beans', 'brews', 'images'];

const defaultHandler = {
  fetch(
    request: Request,
    env: Cloudflare.Env,
    ctx: ExecutionContext,
  ): Response | Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === '/authorize') return handleAuthorize(request, env);
    if (path.startsWith('/upload/')) return uploadPage.fetch(request, env, ctx);
    return app.fetch(request, env, ctx);
  },
};

// The public URL isn't known until deploy, so build one provider per origin the Worker is reached on.
const providers = new Map<string, OAuthProvider<Cloudflare.Env>>();
function providerFor(origin: string) {
  let p = providers.get(origin);
  if (!p) {
    p = new OAuthProvider<Cloudflare.Env>({
      apiRoute: '/mcp',
      apiHandler: mcpApiHandler,
      defaultHandler,
      authorizeEndpoint: '/authorize',
      tokenEndpoint: '/oauth/token',
      clientRegistrationEndpoint: '/oauth/register',
      scopesSupported: ['coffee'],
      requiredScopes: ['coffee'],
      resourceMetadata: { resource: `${origin}/mcp`, authorization_servers: [origin] },
      clientIdMetadataDocumentEnabled: true,
    });
    providers.set(origin, p);
  }
  return p;
}

/** OAuth needs HTTPS (or localhost). Plain http elsewhere only happens in local dev on a LAN. */
function oauthCapable(url: URL): boolean {
  return url.protocol === 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
}

/** The anonymous daily check-in's settings (counts only; see src/worker/kit/telemetry.ts). */
const usage = (env: Cloudflare.Env): CheckInOptions => ({
  app: 'ratio',
  version,
  tables: USAGE_TABLES,
  buckets: [env.IMAGES],
  build: buildFlags(),
});

export default {
  fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    // Check in the first time the app is opened each day (no cost after that).
    checkInOnRequest(ctx, request, env.DB, usage(env));
    const url = new URL(request.url);
    if (!oauthCapable(url)) {
      // e.g. testing from a phone at http://192.168.x.x:5199: the app works, assistant connections don't.
      if (
        url.pathname.startsWith('/mcp') ||
        url.pathname.startsWith('/oauth/') ||
        url.pathname.startsWith('/.well-known/')
      ) {
        return Response.json(
          { error: 'https_required', message: 'Connecting assistants needs HTTPS.' },
          { status: 503 },
        );
      }
      return defaultHandler.fetch(request, env, ctx);
    }
    return providerFor(url.origin).fetch(request, env, ctx);
  },
  // Hourly: the check-in (at most once a day, and not at all if it's turned off), and
  // notifications (each device's 8 a.m., by its own time zone; each sent once).
  scheduled(_controller: ScheduledController, env: Cloudflare.Env, ctx: ExecutionContext) {
    ctx.waitUntil(checkIn(env.DB, usage(env)));
    ctx.waitUntil(runNotifications(env.DB));
  },
} satisfies ExportedHandler<Cloudflare.Env>;
