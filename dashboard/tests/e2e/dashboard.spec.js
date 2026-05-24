import { expect, test } from "@playwright/test";

const status = {
  generated_at: "2026-05-24T03:00:00.000Z",
  school_name: "薄氷",
  autopilot: { running: true, pid: 1234, last_log_line: "巡回中" },
  library: {
    pending_count: 1,
    done_history_count: 8,
    failed_history_count: 0,
    latest_failed: null,
    last_maintenance: "整頓済み",
  },
  noticeboard: { total_posts: 2, open_posts: 0, latest_open_posts: [] },
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
    next_action: "春の学校テーマを画面で確認する",
    request: "部室ビューを観測しやすくする",
    conclusion: "",
    updated_at: "2026-05-24T03:00:00.000Z",
    completion_checks: [
      { id: "theme", label: "春色", done: true },
      { id: "layout", label: "横溢れなし", done: false },
    ],
  },
  school_watch: { last_checked_at: "2026-05-24T03:00:00.000Z", age_minutes: 12, source_errors: [] },
  school_cycle: { tasks: [] },
  links: { vault_dashboard_html: "", vault_dashboard_dir: "職員室/dashboard" },
};

test.beforeEach(async ({ page }) => {
  await page.route("**/school-status.json", async (route) => {
    await route.fulfill({ json: status });
  });
});

test("renders clubroom state from school status", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "実装中" })).toBeVisible();
  await expect(page.getByText("ボール: 長門")).toBeVisible();
  await expect(page.getByText("春の学校テーマを画面で確認する")).toBeVisible();
  await expect(page.locator(".member-hot")).toContainText("長門");
  await expect(page.locator(".check.done")).toContainText("春色");
});

test("keeps dashboard within the viewport", async ({ page }) => {
  await page.goto("/");

  const overflow = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.width);
});
