/// <reference types="vite/client" />

import type { BeatosAPI } from "../../preload";

declare global {
  interface Window {
    beatos: BeatosAPI;
  }
}
