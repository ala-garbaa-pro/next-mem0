import { expect, type Page } from "@playwright/test";

export const CONVERSATION_URL = /\/c\/[0-9a-f-]{36}$/;

/** Fill the /new form and wait for the redirect to the created conversation. Returns its id. */
export async function createConversation(
  page: Page,
  opts: { title?: string; source?: string; tags?: string; transcript?: string },
): Promise<string> {
  await page.goto("/new");
  if (opts.title) await page.getByLabel("Title").fill(opts.title);
  if (opts.tags) await page.getByLabel("Tags").fill(opts.tags);
  if (opts.transcript) await page.getByLabel("Transcript (optional)").fill(opts.transcript);
  if (opts.source) await selectOption(page, "Claude", opts.source);
  await page.getByRole("button", { name: "Create conversation" }).click();
  await expect(page).toHaveURL(CONVERSATION_URL);
  return page.url().split("/").pop()!;
}

/** Pick an option in a base-ui Select whose trigger currently shows `currentLabel`. */
export async function selectOption(page: Page, currentLabel: string, optionLabel: string) {
  await page.getByRole("combobox").filter({ hasText: currentLabel }).first().click();
  await page.getByRole("option", { name: optionLabel, exact: true }).click();
}

export const messages = (page: Page) => page.locator("ol > li");
