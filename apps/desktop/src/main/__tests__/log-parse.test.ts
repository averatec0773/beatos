import { describe, expect, it } from "vitest";
import { parseUvicornLevel } from "../log-parse";

describe("parseUvicornLevel", () => {
  it("maps INFO: to info", () => {
    expect(parseUvicornLevel("INFO:     Started server", "error")).toBe("info");
  });
  it("maps WARNING: to warn", () => {
    expect(parseUvicornLevel("WARNING:  deprecated config", "error")).toBe("warn");
  });
  it("maps ERROR: to error", () => {
    expect(parseUvicornLevel("ERROR:    OperationalError", "info")).toBe("error");
  });
  it("maps CRITICAL: to error", () => {
    expect(parseUvicornLevel("CRITICAL: fatal", "info")).toBe("error");
  });
  it("maps DEBUG: to debug", () => {
    expect(parseUvicornLevel("DEBUG:    spam", "error")).toBe("debug");
  });
  it("uses fallback when line does not start with level", () => {
    expect(parseUvicornLevel("Traceback (most recent call last):", "error")).toBe("error");
    expect(parseUvicornLevel("plain log line", "info")).toBe("info");
  });
});
