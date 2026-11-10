// Thin JSON client for the Worker API.

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();
export function onUnauthorized(fn: Listener) {
  unauthorizedListeners.add(fn);
  return () => {
    unauthorizedListeners.delete(fn);
  };
}

function parseBody(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: method === 'GET' ? {} : { 'Content-Type': 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
    });
  } catch {
    throw new ApiError(
      0,
      'offline',
      'You seem to be offline. Try again when you have a connection.',
    );
  }
  const text = await res.text();
  const data: unknown = parseBody(text);
  if (!res.ok) {
    const err = (data ?? {}) as { error?: string; message?: string };
    // /session's own 401 is the signed-out answer, not a session that just expired.
    if (res.status === 401 && path !== '/login' && path !== '/session')
      unauthorizedListeners.forEach((fn) => fn());
    throw new ApiError(
      res.status,
      err.error ?? 'error',
      err.message ?? `Request failed (${res.status}).`,
    );
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
};

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong.';
}

/** Sends an image file as the raw request body. */
export async function uploadImage<T>(
  path: string,
  blob: Blob,
  meta: { filename?: string; width?: number; height?: number },
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': blob.type,
        ...(meta.filename ? { 'X-Filename': encodeURIComponent(meta.filename) } : {}),
        ...(meta.width ? { 'X-Image-Width': String(meta.width) } : {}),
        ...(meta.height ? { 'X-Image-Height': String(meta.height) } : {}),
      },
      body: blob,
    });
  } catch {
    throw new ApiError(
      0,
      'offline',
      'You seem to be offline. Try again when you have a connection.',
    );
  }
  const data = parseBody(await res.text()) as { error?: string; message?: string } | null;
  if (!res.ok) {
    if (res.status === 401) unauthorizedListeners.forEach((fn) => fn());
    throw new ApiError(res.status, data?.error ?? 'error', data?.message ?? 'Upload failed.');
  }
  return data as T;
}

export const imageUrl = (id: string) => `/api/images/${id}`;
