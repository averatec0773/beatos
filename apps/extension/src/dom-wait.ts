export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll for the first element matching `selector` under `root`. Resolves the
 * element, or null if `timeoutMs` elapses. Used to wait for Ant portals/modals
 * that render asynchronously after a click.
 */
export async function waitFor(
  selector: string,
  opts: { timeoutMs?: number; root?: ParentNode } = {},
): Promise<Element | null> {
  const { timeoutMs = 2000, root = document } = opts;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const el = root.querySelector(selector);
    if (el) return el;
    if (Date.now() >= deadline) return null;
    await sleep(50);
  }
}
