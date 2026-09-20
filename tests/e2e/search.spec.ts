import { expect, test } from "@playwright/test";
import { createConversation } from "./helpers";

test.describe("semantic search (real Ollama embeddings)", () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await createConversation(page, {
      title: "Sourdough starter",
      transcript: `User: my sourdough starter smells like acetone, is it dead?
Assistant: No — that smell means it is hungry. Feed it 1:1:1 flour and water twice a day for a few days.`,
    });
    await createConversation(page, {
      title: "Postgres indexes",
      transcript: `User: when should I use a GIN index instead of a btree in postgres?
Assistant: GIN is for composite values like jsonb, arrays and full-text search; btree for scalar equality and ranges.`,
    });
    await page.close();
  });

  test("ranks the semantically related conversation first", async ({ page }) => {
    await page.goto("/search?q=bread+fermentation+smells+weird");
    const groups = page.locator("main ul > li > div.glass");
    await expect(groups.first()).toContainText("Sourdough starter");
    await expect(groups.first()).toContainText(/0\.[4-9]\d/);

    await page.goto("/search?q=indexing+json+columns+in+a+database");
    await expect(groups.first()).toContainText("Postgres indexes");
    await expect(groups.first()).toContainText("GIN");
  });

  test("hits link to the message anchor inside the conversation", async ({ page }) => {
    await page.goto("/search?q=feeding+a+hungry+sourdough+starter");
    // Message hits are nested inside each conversation group (the group title also links to an anchor).
    const hit = page.locator("main li li a[href*='#m-']").first();
    await expect(hit).toContainText(/hungry|acetone/);
    await hit.click();
    await expect(page).toHaveURL(/\/c\/[0-9a-f-]{36}#m-/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sourdough starter");
  });

  test("search form on the home page submits to /search", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder(/Search everything/).fill("gin vs btree");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page).toHaveURL(/\/search\?q=gin\+vs\+btree/);
    await expect(page.getByText(/matching messages in \d+ conversations/)).toBeVisible();
  });

  test("unrelated query is filtered by the similarity floor", async ({ page }) => {
    await page.goto("/search?q=quarterly+revenue+of+a+shoe+company+in+1987");
    await expect(page.getByText(/matching messages/)).toBeVisible();
    const count = await page.locator("main li li a[href*='#m-']").count();
    expect(count).toBeLessThanOrEqual(2);
  });
});
