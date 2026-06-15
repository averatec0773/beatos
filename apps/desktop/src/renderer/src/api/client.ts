import { platform } from "@/platform";

let cachedBase: string | null = null;
// undefined = not yet resolved; null = resolved, no token (web mode).
let cachedToken: string | null | undefined;

async function base(): Promise<string> {
  if (cachedBase) return cachedBase;
  cachedBase = await platform.getApiBase();
  return cachedBase;
}

async function authToken(): Promise<string | null> {
  if (cachedToken !== undefined) return cachedToken;
  try {
    cachedToken = await platform.getApiToken();
  } catch {
    cachedToken = null; // bridge absent / unavailable → behave as web mode
  }
  return cachedToken;
}

/** Headers for a JSON-body request, with the local API token when present. */
async function writeHeaders(): Promise<Record<string, string>> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const t = await authToken();
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

/** Auth-only headers (no body) for GET/DELETE. */
async function authHeaders(): Promise<Record<string, string>> {
  const t = await authToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message: string) {
    // If body contains a FastAPI {detail} field, append it for clarity
    const detail =
      body && typeof body === "object" && "detail" in (body as Record<string, unknown>)
        ? String((body as { detail: unknown }).detail)
        : null;
    super(detail ? `${message} — ${detail}` : message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

async function parseBody(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function safeFetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (err) {
    if (err instanceof TypeError) {
      cachedBase = null;
    }
    throw err;
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await safeFetch(`${await base()}${path}`, { headers: await authHeaders() });
  if (!res.ok)
    throw new ApiError(res.status, await parseBody(res), `GET ${path} failed: ${res.status}`);
  return res.json();
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await safeFetch(`${await base()}${path}`, {
    method: "POST",
    headers: await writeHeaders(),
    body: body == null ? undefined : JSON.stringify(body),
  });
  if (!res.ok)
    throw new ApiError(res.status, await parseBody(res), `POST ${path} failed: ${res.status}`);
  return res.json();
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const res = await safeFetch(`${await base()}${path}`, {
    method: "PUT",
    headers: await writeHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok)
    throw new ApiError(res.status, await parseBody(res), `PUT ${path} failed: ${res.status}`);
  return res.json();
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await safeFetch(`${await base()}${path}`, {
    method: "PATCH",
    headers: await writeHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok)
    throw new ApiError(res.status, await parseBody(res), `PATCH ${path} failed: ${res.status}`);
  return res.json();
}

export async function apiDelete(path: string): Promise<void> {
  const res = await safeFetch(`${await base()}${path}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
  if (!res.ok && res.status !== 204)
    throw new ApiError(res.status, await parseBody(res), `DELETE ${path} failed: ${res.status}`);
}

export function _resetBaseForTests(): void {
  cachedBase = null;
  cachedToken = undefined;
}
