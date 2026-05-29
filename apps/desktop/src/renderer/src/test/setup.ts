import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => cleanup());

const noop = (): Promise<any> => Promise.resolve(null);

(window as any).beatos = {
  getApiBase: () => Promise.resolve("http://127.0.0.1:5555"),
  openFolderDialog: noop,
  openFileDialog: noop,
  revealInFinder: noop,
  quitApp: noop,
  getHomePath: () => Promise.resolve("/Users/test"),
  getDbPath: () => Promise.resolve("/tmp/test.db"),
  getRepoRoot: () => Promise.resolve("/tmp/test-repo"),
  setDbPath: () => Promise.resolve({ restartRequired: true }),
  pickFolder: () => Promise.resolve(null),
};

global.fetch = vi.fn();

// EventSource mock for SSE-using hooks under jsdom.
class MockEventSource {
  url: string;
  listeners: Record<string, ((ev: MessageEvent) => void)[]> = {};
  onerror: ((ev: Event) => void) | null = null;
  constructor(url: string) {
    this.url = url;
    (window as any).__lastEventSource = this;
  }
  addEventListener(type: string, cb: (ev: MessageEvent) => void) {
    (this.listeners[type] ??= []).push(cb);
  }
  removeEventListener(type: string, cb: (ev: MessageEvent) => void) {
    this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== cb);
  }
  dispatch(type: string, data: string) {
    (this.listeners[type] ?? []).forEach((cb) => cb({ data } as MessageEvent));
  }
  close() {
    (window as any).__lastEventSource = null;
  }
}
(global as any).EventSource = MockEventSource;
