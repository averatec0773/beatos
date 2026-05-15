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
  getLastLibrary: () => Promise.resolve(null),
  setLastLibrary: noop,
};

global.fetch = vi.fn();
