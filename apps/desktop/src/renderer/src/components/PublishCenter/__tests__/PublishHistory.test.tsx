import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PublishHistorySection } from "@/components/PublishCenter/PublishHistorySection";
import * as client from "@/api/client";
import type { PublishAttempt, PublishFieldReport } from "@/api/publish-history";

function attempt(over: Partial<PublishAttempt> = {}): PublishAttempt {
  return {
    id: 1,
    job_id: "j1",
    track_id: 7,
    track_title: "Midnight Drive",
    platform: "netease",
    account: "studio@x",
    mode: "engine",
    dry_run: false,
    outcome: "success",
    stage: "done",
    message: "",
    listing_url: "https://music.example/1",
    hidden: false,
    created_at: new Date(Date.now() - 60_000).toISOString(),
    finished_at: new Date().toISOString(),
    counts: { filled: 8, skipped: 2, needs_user: 1, failed: 1 },
    ...over,
  };
}

const FIELDS: PublishFieldReport[] = [
  {
    page: "upload",
    field_key: "title",
    label: "Song title",
    outcome: "filled",
    source: "track.title",
    value: "Midnight Drive",
    reason: "",
    duration_ms: 120,
    updated_at: "2026-07-30T10:00:00+00:00",
  },
  {
    page: "meta",
    field_key: "isrc",
    label: "ISRC",
    outcome: "needs-user",
    source: "manual",
    value: "",
    reason: "platform requires a verified ISRC",
    duration_ms: null,
    updated_at: "2026-07-30T10:00:05+00:00",
  },
  {
    page: "meta",
    field_key: "lyrics",
    label: "Lyrics",
    outcome: "failed",
    source: "track.lyrics",
    value: "",
    reason: "editor rejected the paste",
    duration_ms: 30,
    updated_at: "2026-07-30T10:00:07+00:00",
  },
];

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

interface RouteOpts {
  attempts?: PublishAttempt[];
  fields?: PublishFieldReport[];
  listStatus?: number;
  hideStatus?: number;
}

function mockApi(opts: RouteOpts = {}): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    if (/\/api\/publish\/history\/\d+\/hide/.test(url)) {
      return jsonRes({ ok: true }, opts.hideStatus ?? 200);
    }
    if (/\/api\/publish\/history\/\d+$/.test(url)) {
      return jsonRes({ attempt: attempt(), field_reports: opts.fields ?? FIELDS });
    }
    if (url.includes("/api/publish/history")) {
      if (opts.listStatus && opts.listStatus >= 400)
        return jsonRes({ detail: "nope" }, opts.listStatus);
      return jsonRes({ attempts: opts.attempts ?? [attempt()] });
    }
    void init;
    return jsonRes({}, 404);
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe("PublishHistorySection", () => {
  beforeEach(() => {
    client._resetBaseForTests();
    (window as any).beatos.getApiToken = () => Promise.resolve("secret-token");
  });

  it("lists attempts with their honest outcome labels", async () => {
    mockApi({
      attempts: [
        attempt({ id: 1, outcome: "success", track_title: "Midnight Drive" }),
        attempt({ id: 2, outcome: "dry_run", track_title: "Dry One", listing_url: null }),
        attempt({ id: 3, outcome: "expired", track_title: "Timed Out", listing_url: null }),
        attempt({
          id: 4,
          outcome: "failed",
          message: "login expired",
          track_title: "Broken",
          listing_url: null,
        }),
        attempt({ id: 5, outcome: "", track_title: "In Flight", listing_url: null }),
      ],
    });
    render(<PublishHistorySection />);

    expect(await screen.findByText("Midnight Drive")).toBeInTheDocument();
    expect(screen.getByText(/Published/)).toBeInTheDocument();
    expect(screen.getByText(/Dry run/)).toBeInTheDocument();
    expect(screen.getByText(/Window closed/)).toBeInTheDocument();
    expect(screen.getByText(/Failed — login expired/)).toBeInTheDocument();
    expect(screen.getByText(/Still running/)).toBeInTheDocument();
    // Mode badge + listing link.
    expect(screen.getAllByText("Engine").length).toBe(5);
    expect(screen.getByRole("link", { name: /View listing/ })).toHaveAttribute(
      "href",
      "https://music.example/1",
    );
  });

  it("renders the empty state when there is no history", async () => {
    mockApi({ attempts: [] });
    render(<PublishHistorySection />);
    expect(await screen.findByText(/No publish attempts recorded yet/)).toBeInTheDocument();
  });

  it("renders an honest error state with a retry that re-fetches", async () => {
    const fetchMock = mockApi({ listStatus: 500 });
    render(<PublishHistorySection />);
    expect(await screen.findByText(/Couldn't load publish history/)).toBeInTheDocument();

    mockApi({ attempts: [attempt()] });
    await userEvent.click(screen.getByRole("button", { name: /Retry/ }));
    expect(await screen.findByText("Midnight Drive")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalled();
  });

  it("expands an attempt and lists the field report, flagging needs-user and failed", async () => {
    const fetchMock = mockApi();
    render(<PublishHistorySection />);
    await screen.findByText("Midnight Drive");

    await userEvent.click(screen.getByRole("button", { name: /Show field report/ }));

    expect(await screen.findByText("ISRC")).toBeInTheDocument();
    expect(screen.getByText("Needs you")).toBeInTheDocument();
    expect(screen.getByText("Lyrics")).toBeInTheDocument();
    expect(screen.getByText(/platform requires a verified ISRC/)).toBeInTheDocument();
    expect(screen.getByText(/From: track.title/)).toBeInTheDocument();
    expect(screen.getByText(/Value: Midnight Drive/)).toBeInTheDocument();
    expect(screen.getByText(/8 filled · 2 skipped · 1 need you · 1 failed/)).toBeInTheDocument();

    // Attention rows sort to the top so "what did I have to fix?" is one glance.
    const items = screen.getAllByRole("listitem");
    expect(within(items[0]).getByText("ISRC")).toBeInTheDocument();
    expect(within(items[1]).getByText("Lyrics")).toBeInTheDocument();

    const detailCall = fetchMock.mock.calls.find((c) => /history\/1$/.test(String(c[0])));
    expect(detailCall).toBeTruthy();
  });

  it("hide posts to the hide endpoint with the API token and drops the row", async () => {
    const fetchMock = mockApi();
    render(<PublishHistorySection />);
    await screen.findByText("Midnight Drive");

    await userEvent.click(screen.getByRole("button", { name: /Hide from history/ }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => String(c[0]).includes("/history/1/hide"));
      expect(call).toBeTruthy();
      const init = call![1] as RequestInit;
      expect(init.method).toBe("POST");
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret-token");
      expect(JSON.parse(String(init.body))).toEqual({ hidden: true });
    });
    expect(screen.queryByText("Midnight Drive")).not.toBeInTheDocument();
  });

  it("show-hidden re-fetches with include_hidden and marks hidden rows", async () => {
    const fetchMock = mockApi({ attempts: [] });
    render(<PublishHistorySection />);
    await screen.findByText(/No publish attempts recorded yet/);

    mockApi({ attempts: [attempt({ hidden: true })] });
    await userEvent.click(screen.getByRole("button", { name: /Show hidden/ }));

    expect(await screen.findByText("Hidden")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Show in history again/ })).toBeInTheDocument();
    const urls = (global.fetch as any).mock.calls.map((c: any[]) => String(c[0]));
    expect(urls.some((u: string) => u.includes("include_hidden=true"))).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
  });
});
