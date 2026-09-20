import { expect, test } from "@playwright/test";

test.describe("app shell", () => {
  test("home renders with an empty store and a ready Ollama", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Your AI memory, on your disk" })).toBeVisible();
    await expect(page.getByText("Embeddings · Ollama")).toBeVisible();
    await expect(page.getByText("ready", { exact: true })).toBeVisible();
    await expect(page.getByText("Nothing stored yet", { exact: false }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Create your first conversation" })).toBeVisible();
  });

  test("sidebar navigation links work", async ({ page }) => {
    await page.goto("/");
    const sidebar = page.getByRole("complementary");
    await sidebar.getByRole("link", { name: "New" }).click();
    await expect(page).toHaveURL(/\/new$/);
    await sidebar.getByRole("link", { name: "Import" }).click();
    await expect(page).toHaveURL(/\/import$/);
    await sidebar.getByRole("link", { name: "Search" }).click();
    await expect(page).toHaveURL(/\/search$/);
  });

  test("theme toggle switches dark mode", async ({ page }) => {
    await page.goto("/");
    const html = page.locator("html");
    const before = (await html.getAttribute("class")) ?? "";
    await page.getByRole("button", { name: "Toggle theme" }).click();
    await expect
      .poll(async () => ((await html.getAttribute("class")) ?? "").includes("dark"))
      .toBe(!before.includes("dark"));
  });

  test("unknown conversation returns 404", async ({ page }) => {
    const res = await page.goto("/c/does-not-exist");
    expect(res?.status()).toBe(404);
  });

  test("chat API validates its input", async ({ request }) => {
    const bad = await request.post("/api/chat", { data: { prompt: "hi" } });
    expect(bad.status()).toBe(400);
    const missing = await request.post("/api/chat", {
      data: { conversationId: "nope", provider: "claude", prompt: "hi" },
    });
    expect(missing.status()).toBe(404);
    const badProvider = await request.post("/api/chat", {
      data: { conversationId: "nope", provider: "gpt", prompt: "hi" },
    });
    expect(badProvider.status()).toBe(400);
  });
});
