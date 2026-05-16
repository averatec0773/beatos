import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    isPackaged: false,
    getAppPath: () => "/tmp/fake-app/apps/desktop",
  },
}));

vi.mock("electron-log/main", () => ({
  default: {
    transports: {
      file: { resolvePathFn: null as ((...args: unknown[]) => string) | null, maxSize: 0, level: "info" },
      console: { level: "info" },
    },
    initialize: vi.fn(),
    info: vi.fn(),
  },
}));

describe("configureLogger", () => {
  it("writes to ./logs/main.log in dev", async () => {
    const { configureLogger } = await import("../logger");
    const log = (await import("electron-log/main")).default;
    configureLogger();
    expect(log.transports.file.resolvePathFn).toBeTypeOf("function");
    const resolved = log.transports.file.resolvePathFn!();
    expect(resolved).toMatch(/\/tmp\/fake-app\/apps\/desktop\/logs\/main\.log$/);
  });
});
