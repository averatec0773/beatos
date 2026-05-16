export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface AssetProtocolDeps {
  apiPort: () => number | null;
  fetchImpl?: FetchLike;
}

const COVER_DEFAULT_MIME = "image/jpeg";
const AUDIO_DEFAULT_MIME = "audio/mpeg";

export async function handleAssetRequest(
  request: Request,
  deps: AssetProtocolDeps
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const assetId = url.pathname.replace(/^\//, "");
    const port = deps.apiPort();
    if (port == null) return new Response(null, { status: 503 });

    let upstreamPath: string;
    let defaultMime: string;
    if (url.host === "cover") {
      upstreamPath = `/api/assets/cover/${assetId}`;
      defaultMime = COVER_DEFAULT_MIME;
    } else if (url.host === "audio") {
      upstreamPath = `/api/assets/audio/${assetId}`;
      defaultMime = AUDIO_DEFAULT_MIME;
    } else {
      return new Response(null, { status: 404 });
    }

    const headers: HeadersInit = {};
    const range = request.headers.get("range");
    if (range) headers["range"] = range;

    const f: FetchLike = deps.fetchImpl ?? ((url, init) => fetch(url, init));
    const upstream = await f(`http://127.0.0.1:${port}${upstreamPath}`, { headers });
    if (!upstream.ok && upstream.status !== 206) {
      return new Response(null, { status: upstream.status });
    }

    const respHeaders: Record<string, string> = {
      "content-type": upstream.headers.get("content-type") ?? defaultMime,
    };
    for (const passthrough of ["content-range", "accept-ranges", "content-length"]) {
      const v = upstream.headers.get(passthrough);
      if (v) respHeaders[passthrough] = v;
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: respHeaders,
    });
  } catch (e) {
    console.warn("[protocol:beatos-asset] error", e);
    return new Response(null, { status: 500 });
  }
}
