// Service worker: performs the actual cross-origin fetches to the BeatOS fixed
// inject port. host_permissions let these bypass the page's CSP. It only fetches
// when the content script asks (message-driven) and NEVER submits anything.

const BASE = "http://127.0.0.1:48923";
const PLATFORM = "netease";

interface PollResult {
  staged: boolean;
  export?: unknown;
  formMap?: unknown;
}

async function fetchPending(): Promise<PollResult> {
  try {
    const r = await fetch(`${BASE}/api/inject/pending?platform=${PLATFORM}`);
    if (!r.ok) return { staged: false };
    const pending = await r.json();
    if (!pending.staged) return { staged: false };
    const fmRes = await fetch(`${BASE}/api/inject/form-map/${PLATFORM}`);
    if (!fmRes.ok) return { staged: false };
    return { staged: true, export: pending.export, formMap: await fmRes.json() };
  } catch {
    return { staged: false }; // BeatOS not running / port unavailable
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "beatos-poll") {
    void fetchPending().then(sendResponse);
    return true; // keep the channel open for the async sendResponse
  }
  return false;
});
