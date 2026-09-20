import { expect, test } from "@playwright/test";
import { createConversation, messages } from "./helpers";

interface Backup {
  format: string;
  version: number;
  embedModel: string;
  embedDim: number;
  conversations: number;
  messages: number;
  data: { id: string; title: string; messages: { id: string; content: string; embedding?: number[] }[] }[];
}

test.describe("backup: export / import all data", () => {
  let convoId: string;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    convoId = await createConversation(page, {
      title: "Backup me",
      tags: "backup, e2e",
      transcript: `User: what is the capital of Australia?
Assistant: Canberra — not Sydney, which is the largest city.`,
    });
    await page.close();
  });

  test("export streams a JSON file with vectors, and without on request", async ({ request }) => {
    const res = await request.get("/api/backup");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-disposition"]).toMatch(/attachment; filename="next-mem0-backup-.*\.json"/);
    const full = (await res.json()) as Backup;
    expect(full.format).toBe("next-mem0-backup");
    expect(full.version).toBe(1);
    expect(full.embedDim).toBe(768);
    expect(full.data.length).toBe(full.conversations);
    const mine = full.data.find((c) => c.id === convoId)!;
    expect(mine.title).toBe("Backup me");
    expect(mine.messages).toHaveLength(2);
    expect(mine.messages[0].embedding).toHaveLength(768);

    const slim = (await (await request.get("/api/backup?vectors=0")).json()) as Backup;
    expect(slim.data.find((c) => c.id === convoId)!.messages[0].embedding).toBeUndefined();
  });

  test("import in replace mode restores exactly the file's contents", async ({ page, request }) => {
    const backup = (await (await request.get("/api/backup")).json()) as Backup;

    // Add something that is NOT in the backup, then restore with replace: it must disappear.
    const extra = await createConversation(page, { title: "Not in backup", transcript: "User: temporary" });

    await page.goto("/backup");
    await page.getByLabel("Backup file").setInputFiles({
      name: "next-mem0-backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(backup)),
    });
    await page.getByLabel("Replace", { exact: false }).check();
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Import backup" }).click();
    const summary = page.getByText(/Imported \d+ conversations and \d+ messages/);
    await expect(summary).toBeVisible();
    // Vectors came from the file: nothing re-embedded.
    await expect(summary).not.toContainText("re-embedded");

    expect((await page.goto(`/c/${extra}`))?.status()).toBe(404);
    await page.goto(`/c/${convoId}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Backup me");
    await expect(messages(page)).toHaveCount(2);
    await expect(page.getByText("backup", { exact: true })).toBeVisible();

    const after = (await (await request.get("/api/backup")).json()) as Backup;
    expect(after.conversations).toBe(backup.conversations);
    expect(after.messages).toBe(backup.messages);
  });

  test("import without vectors re-embeds and merges over the existing copy", async ({ page, request }) => {
    const slim = (await (await request.get("/api/backup?vectors=0")).json()) as Backup;
    const before = slim.conversations;

    const res = await request.post("/api/backup?mode=merge", {
      headers: { "content-type": "application/json" },
      data: slim,
    });
    expect(res.status()).toBe(200);
    const result = await res.json();
    expect(result.ok).toBe(true);
    expect(result.conversations).toBe(before);
    expect(result.reembedded).toBe(slim.messages);

    // Same ids → replaced in place, not duplicated; search still works on the fresh vectors.
    const after = (await (await request.get("/api/backup?vectors=0")).json()) as Backup;
    expect(after.conversations).toBe(before);
    await page.goto("/search?q=which+city+is+the+capital+of+australia");
    await expect(page.locator("main ul > li > div.glass").first()).toContainText("Backup me");
  });

  test("rejects files that are not a backup", async ({ request }) => {
    const notJson = await request.post("/api/backup", { headers: { "content-type": "application/json" }, data: "nope" });
    expect(notJson.status()).toBe(400);
    const wrongShape = await request.post("/api/backup", { data: { hello: "world" } });
    expect(wrongShape.status()).toBe(400);
    const wrongFormat = await request.post("/api/backup", { data: { format: "other", data: [] } });
    expect(wrongFormat.status()).toBe(400);
    expect((await wrongFormat.json()).error).toMatch(/not a next-mem0 backup/i);
  });
});
