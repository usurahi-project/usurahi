import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import App from "./App.jsx";

function mockStatus(overrides = {}) {
  return {
    generated_at: "2026-05-24T03:00:00.000Z",
    school_name: "薄氷",
    autopilot: { running: true, pid: 1234, last_log_line: "巡回中" },
    library: {
      pending_count: 2,
      done_history_count: 8,
      failed_history_count: 1,
      latest_failed: null,
      last_maintenance: "整頓済み",
    },
    noticeboard: { total_posts: 3, open_posts: 1, latest_open_posts: [] },
    meeting: {
      active: true,
      id: "meeting-1",
      phase: "implementing",
      phase_label: "実装中",
      owner: "eru",
      owner_label: "える",
      waiting_for: "nagato",
      waiting_for_label: "長門",
      ball_holder: "nagato",
      ball_holder_label: "長門",
      next_action: "dashboardの表示契約を確認する",
      request: "部室ビューを観測しやすくする",
      conclusion: "",
      updated_at: "2026-05-24T03:00:00.000Z",
      completion_checks: [
        { id: "contract", label: "表示契約", done: true },
        { id: "mobile", label: "モバイル確認", done: false },
      ],
    },
    school_watch: { last_checked_at: "2026-05-24T03:00:00.000Z", age_minutes: 12, source_errors: [] },
    school_cycle: { tasks: [{ id: "library", last_run_at: "2026-05-24T03:00:00.000Z", age_minutes: 12, last_error: "" }] },
    links: { vault_dashboard_html: "", vault_dashboard_dir: "職員室/dashboard" },
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("App", () => {
  it("renders the fetched clubroom state and highlights the current ball holder", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockStatus(),
    });

    render(<App />);

    expect(await screen.findByRole("heading", { name: "実装中" })).toBeInTheDocument();
    expect(screen.getByText("ボール: 長門")).toBeInTheDocument();
    expect(screen.getByText("dashboardの表示契約を確認する")).toBeInTheDocument();
    expect(screen.getByText("部室ビューを観測しやすくする")).toBeInTheDocument();
    expect(screen.getByText("1/2")).toBeInTheDocument();
    expect(document.querySelector(".check.done")).toHaveTextContent("表示契約");

    const nagatoCard = screen.getByText("長門").closest(".member");
    expect(nagatoCard).toHaveClass("member-hot");
    expect(within(nagatoCard).getByText("可否判断・実装")).toBeInTheDocument();
    expect(screen.getByText("稼働中")).toBeInTheDocument();
  });

  it("shows an error banner and keeps the clubroom in standby when status loading fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
    });

    render(<App />);

    expect(await screen.findByText("状態を読めない")).toBeInTheDocument();
    expect(screen.getByText("HTTP 500")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "部会はまだ始まっていない" })).toBeInTheDocument();
    expect(screen.getByText("待機中")).toBeInTheDocument();
  });
});
