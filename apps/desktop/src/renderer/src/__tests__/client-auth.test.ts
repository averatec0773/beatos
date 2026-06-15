import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "@/api/client";

describe("client attaches the local API token", () => {
  beforeEach(() => {
    client._resetBaseForTests();
    (window as any).beatos = {
      getApiBase: () => Promise.resolve("http://127.0.0.1:5000"),
      getApiToken: vi.fn().mockResolvedValue("secret-token"),
    };
  });

  afterEach(() => vi.restoreAllMocks());

  it("sends Authorization: Bearer on a mutating request when a token is present", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    global.fetch = fetchMock;
    await client.apiPut("/api/app_settings/agent_permission_mode", { value: "confirm" });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret-token");
  });

  it("omits Authorization when no token is configured (web mode)", async () => {
    (window as any).beatos.getApiToken = vi.fn().mockResolvedValue(null);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    global.fetch = fetchMock;
    await client.apiPut("/x", { a: 1 });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});
