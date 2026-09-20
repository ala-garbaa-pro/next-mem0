import { expect, test } from "@playwright/test";
import { messages } from "./helpers";

const chatgptExport = [
  {
    title: "Docker networking",
    create_time: 1_700_000_000,
    current_node: "leaf",
    mapping: {
      root: { id: "root", parent: null, children: ["sys"] },
      sys: { id: "sys", parent: "root", children: ["u1"], message: { author: { role: "system" }, content: { content_type: "text", parts: [""] } } },
      u1: { id: "u1", parent: "sys", children: ["a1", "a1-alt"], message: { author: { role: "user" }, content: { content_type: "text", parts: ["why can't my container reach localhost?"] }, create_time: 1_700_000_001 } },
      "a1-alt": { id: "a1-alt", parent: "u1", children: [], message: { author: { role: "assistant" }, content: { content_type: "text", parts: ["ABANDONED BRANCH — must not be imported"] } } },
      a1: { id: "a1", parent: "u1", children: ["leaf"], message: { author: { role: "assistant" }, content: { content_type: "text", parts: ["Inside the container, localhost is the container itself. Use host.docker.internal."] }, create_time: 1_700_000_002 } },
      leaf: { id: "leaf", parent: "a1", children: [], message: { author: { role: "user" }, content: { content_type: "text", parts: ["thanks!"] } } },
    },
  },
];

const claudeExport = [
  {
    uuid: "c1",
    name: "Sorting stability",
    created_at: "2025-03-01T10:00:00Z",
    chat_messages: [
      { uuid: "m1", sender: "human", text: "is Array.prototype.sort stable in JS?", created_at: "2025-03-01T10:00:00Z" },
      { uuid: "m2", sender: "assistant", text: "", content: [{ type: "text", text: "Yes, since ES2019 it is required to be stable." }], created_at: "2025-03-01T10:00:05Z" },
    ],
  },
];

test.describe("import", () => {
  test("imports ChatGPT and Claude exports in one go", async ({ page }) => {
    await page.goto("/import");
    await page.getByLabel("Export files (.json)").setInputFiles([
      { name: "conversations-chatgpt.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(chatgptExport)) },
      { name: "conversations-claude.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(claudeExport)) },
    ]);
    await page.getByRole("button", { name: "Import" }).click();

    await expect(page.getByText("Imported 2 conversations")).toBeVisible({ timeout: 60_000 });
    const main = page.getByRole("main");
    await expect(main.getByRole("link", { name: "Docker networking" })).toBeVisible();
    await expect(main.getByRole("link", { name: "Sorting stability" })).toBeVisible();

    // ChatGPT: only the active branch, system node dropped, creation time preserved.
    await page.getByRole("main").getByRole("link", { name: "Docker networking" }).click();
    await expect(messages(page)).toHaveCount(3);
    await expect(page.getByRole("main")).not.toContainText("ABANDONED BRANCH");
    await expect(messages(page).nth(1)).toContainText("host.docker.internal");
    await expect(page.locator("header")).toContainText("ChatGPT");
    await expect(page.locator("header")).toContainText("2023");

    // Claude: text pulled from content blocks when `text` is empty.
    await page.getByRole("complementary").getByRole("link", { name: "Sorting stability" }).click();
    await expect(messages(page)).toHaveCount(2);
    await expect(messages(page).nth(1)).toContainText("ES2019");
    await expect(page.locator("header")).toContainText("Claude");
  });

  test("rejects a file that is not JSON", async ({ page }) => {
    await page.goto("/import");
    await page.getByLabel("Export files (.json)").setInputFiles({
      name: "broken.json",
      mimeType: "application/json",
      buffer: Buffer.from("{ not json"),
    });
    await page.getByRole("button", { name: "Import" }).click();
    await expect(page.getByText("File is not valid JSON")).toBeVisible();
  });
});
