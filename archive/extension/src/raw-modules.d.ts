// Vite/vitest `?raw` imports return the file contents as a string. Ambient
// (script-context) declaration so tests can load HTML/JSON fixtures without
// pulling node's `fs` types into the browser-typed extension source.
declare module "*?raw" {
  const content: string;
  export default content;
}
