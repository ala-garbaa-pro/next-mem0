import { expect, test } from "@playwright/test";
import { createConversation, messages, selectOption } from "./helpers";

/**
 * These drive the real `claude` and `codex` CLIs installed on this machine,
 * so they need those to be logged in. Each turn can take 10–60s.
 */
test.describe("chat with CLI", () => {
  test.setTimeout(240_000);

  test("claude: streams a reply, saves the turn, then resumes the session", async ({ page }) => {
    await createConversation(page, { title: "CLI smoke" });

    const box = page.getByPlaceholder(/^Ask Claude Code/);
    await expect(page.getByText("Starts a new CLI session")).toBeVisible();
    await box.fill("Reply with exactly one short sentence: what is a vector database?");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
    await expect(page.getByText("Turn saved")).toBeVisible({ timeout: 120_000 });
    await expect(messages(page)).toHaveCount(2);
    await expect(messages(page).nth(0)).toContainText("what is a vector database?");
    await expect(messages(page).nth(1)).toContainText(/vector/i);

    // Session id is now stored and the next turn resumes it.
    await expect(page.locator("header")).toContainText(/session [0-9a-f]{8}/);
    await expect(page.getByText("Resumes the CLI session")).toBeVisible();

    await box.fill("Answer with one word only: was my previous question about databases or about cooking?");
    await box.press("Control+Enter");
    await expect(page.getByText("Turn saved")).toBeVisible({ timeout: 120_000 });
    await expect(messages(page)).toHaveCount(4);
    await expect(messages(page).nth(3)).toContainText(/database/i);
  });

  test("codex: replies and saves the turn", async ({ page }) => {
    await createConversation(page, { title: "Codex smoke" });
    await selectOption(page, "Claude Code", "Codex");
    await expect(page.getByPlaceholder(/^Ask Codex/)).toBeVisible();

    await page.getByPlaceholder(/^Ask Codex/).fill("Reply with exactly one short sentence: what is cosine similarity?");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("Turn saved")).toBeVisible({ timeout: 180_000 });
    await expect(messages(page)).toHaveCount(2);
    await expect(messages(page).nth(1)).toContainText(/cosine|angle|vector/i);
    await expect(page.locator("header")).toContainText("Codex");
  });

  test("stop cancels the turn and nothing is saved", async ({ page }) => {
    await createConversation(page, { title: "Cancelled" });
    await page.getByPlaceholder(/^Ask Claude Code/).fill("Write a 2000 word essay about the history of databases.");
    await page.getByRole("button", { name: "Send" }).click();
    await page.getByRole("button", { name: "Stop" }).click();
    await expect(page.getByText("Cancelled — nothing was saved")).toBeVisible();
    // Prompt is handed back for retry.
    await expect(page.getByPlaceholder(/^Ask Claude Code/)).toHaveValue(/2000 word essay/);
    await page.reload();
    await expect(page.getByText("No messages yet")).toBeVisible();
  });
});
