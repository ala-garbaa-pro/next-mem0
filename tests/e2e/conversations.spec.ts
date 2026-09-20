import { expect, test } from "@playwright/test";
import { createConversation, messages } from "./helpers";

const TRANSCRIPT = `User: how do I center a div horizontally and vertically?
Assistant: Use flexbox on the parent:
display: flex; justify-content: center; align-items: center;
User: and with grid?
Assistant: display: grid; place-items: center;`;

test.describe("conversations", () => {
  test("create from a pasted transcript, title derived from first message", async ({ page }) => {
    await createConversation(page, { tags: "css, layout", transcript: TRANSCRIPT });

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "how do I center a div horizontally and vertically?",
    );
    await expect(messages(page)).toHaveCount(4);
    await expect(messages(page).nth(0)).toContainText(/user/i);
    await expect(messages(page).nth(1)).toContainText("Use flexbox on the parent");
    await expect(messages(page).nth(3)).toContainText("place-items: center");
    await expect(page.getByText("4 messages")).toBeVisible();
    await expect(page.getByText("css", { exact: true })).toBeVisible();
    await expect(page.getByText("layout", { exact: true })).toBeVisible();

    // Sidebar lists it with the source badge.
    const sidebar = page.getByRole("complementary");
    await expect(sidebar.getByRole("link", { name: /center a div/ })).toBeVisible();
    await expect(sidebar.getByText("Claude").first()).toBeVisible();
  });

  test("explicit title and source are kept", async ({ page }) => {
    await createConversation(page, {
      title: "Rust borrow checker",
      source: "ChatGPT",
      transcript: "User: why does the borrow checker complain?\nChatGPT: iterating holds an immutable borrow.",
    });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Rust borrow checker");
    await expect(page.locator("header").getByText("ChatGPT")).toBeVisible();
    await expect(messages(page).nth(1)).toContainText(/assistant/i);
  });

  test("add messages manually, roles alternate", async ({ page }) => {
    await createConversation(page, { title: "Manual notes" });
    await expect(page.getByText("No messages yet")).toBeVisible();

    await page.getByRole("tab", { name: "Add message" }).click();
    const box = page.getByPlaceholder("Paste or type a message…");
    await box.fill("What is a monad?");
    await page.getByRole("button", { name: "Save message" }).click();
    await expect(page.getByText("Message saved")).toBeVisible();
    await expect(messages(page)).toHaveCount(1);

    // Role flipped to Assistant after saving a User message.
    await expect(page.getByRole("combobox").filter({ hasText: "Assistant" })).toBeVisible();
    await box.fill("A monoid in the category of endofunctors.");
    await box.press("Control+Enter");
    await expect(messages(page)).toHaveCount(2);
    await expect(messages(page).nth(1)).toContainText(/assistant/i);
    await expect(messages(page).nth(1)).toContainText("endofunctors");
  });

  test("opening a popup never scrolls the layout wrapper (sidebar stays put)", async ({ page }) => {
    await createConversation(page, { title: "Popup layout", transcript: TRANSCRIPT });
    await page.getByRole("tab", { name: "Add message" }).click();
    await page.getByRole("combobox").first().click();
    await expect(page.getByRole("option", { name: "Assistant" })).toBeVisible();
    const box = await page.getByRole("complementary").boundingBox();
    expect(box?.x).toBe(0);
    expect(box?.y).toBe(0);
    await page.keyboard.press("Escape");
  });

  test("edit title and tags", async ({ page }) => {
    await createConversation(page, { title: "Before", transcript: "User: hi" });
    await page.getByRole("button", { name: "Edit" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Title").fill("After");
    await dialog.getByLabel("Tags").fill("renamed, e2e");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("After");
    await expect(page.getByText("renamed", { exact: true })).toBeVisible();
    await expect(page.getByRole("complementary").getByRole("link", { name: "After" })).toBeVisible();
  });

  test("sidebar filter narrows the list", async ({ page }) => {
    await createConversation(page, { title: "Zebra migration patterns", transcript: "User: zebras" });
    const sidebar = page.getByRole("complementary");
    await sidebar.getByPlaceholder("Filter by title or tag…").fill("zebra");
    await expect(sidebar.getByRole("link", { name: /Zebra migration/ })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: /Rust borrow/ })).toHaveCount(0);
    await sidebar.getByPlaceholder("Filter by title or tag…").fill("nothing-matches-this");
    await expect(sidebar.getByText("No matches.")).toBeVisible();
  });

  test("delete removes the conversation and its messages", async ({ page }) => {
    const id = await createConversation(page, { title: "Doomed", transcript: "User: bye\nAssistant: bye" });
    await page.getByRole("button", { name: "Delete" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Delete this conversation?")).toBeVisible();
    await dialog.getByRole("button", { name: "Delete" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("complementary").getByRole("link", { name: "Doomed" })).toHaveCount(0);
    const res = await page.goto(`/c/${id}`);
    expect(res?.status()).toBe(404);
  });
});
