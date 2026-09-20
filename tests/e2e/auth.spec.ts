import { expect, test } from "@playwright/test";
import { TEST_USER } from "../../playwright.config";

test.describe("auth", () => {
  test.describe("signed out", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("pages redirect to sign-in and APIs answer 401", async ({ page, request }) => {
      await page.goto("/");
      await expect(page).toHaveURL(/\/sign-in$/);
      await page.goto("/search?q=x");
      await expect(page).toHaveURL(/\/sign-in$/);

      for (const path of ["/api/import", "/api/backup"]) {
        const res = await request.get(path);
        expect(res.status(), path).toBe(401);
      }
      const chat = await request.post("/api/chat", { data: { conversationId: "x", provider: "claude", prompt: "hi" } });
      expect(chat.status()).toBe(401);
    });

    test("wrong password shows an error, right one signs in", async ({ page }) => {
      await page.goto("/sign-in");
      await page.getByLabel("Email").fill(TEST_USER.email);
      await page.getByLabel("Password").fill("not-the-password");
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(page.getByRole("alert").filter({ hasText: /./ })).toContainText(/invalid/i);

      await page.getByLabel("Password").fill(TEST_USER.password);
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByRole("complementary")).toContainText(TEST_USER.email);

      // Sign out from this context's own session (the shared one in auth.json stays valid).
      await page.getByRole("button", { name: "Sign out" }).click();
      await expect(page).toHaveURL(/\/sign-in$/);
      await page.goto("/");
      await expect(page).toHaveURL(/\/sign-in$/);
    });

    test("a second account only sees its own conversations", async ({ page }) => {
      await page.goto("/sign-up");
      await page.getByLabel("Name").fill("Other");
      await page.getByLabel("Email").fill(`other-${Date.now()}@next-mem0.test`);
      await page.getByLabel("Password").fill("another strong password");
      await page.getByRole("button", { name: "Create account" }).click();
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByRole("complementary")).toContainText("0");
      await expect(page.getByText("Nothing stored yet", { exact: false }).first()).toBeVisible();
    });
  });

  test("auth pages bounce a signed-in user home", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page).toHaveURL(/\/$/);
    await page.goto("/sign-up");
    await expect(page).toHaveURL(/\/$/);
  });
});
