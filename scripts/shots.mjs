/**
 * Screenshot every page in light and dark mode for a visual check.
 * Usage: .tools/node/node.exe scripts/shots.mjs <baseUrl> <outDir> [conversationId]
 * (Playwright needs a real Node runtime — see scripts/e2e.ts.)
 */
import path from "node:path";
import { chromium } from "playwright";

const [base = "http://localhost:3210", out = ".shots", convoId = ""] = process.argv.slice(2);
const pages = [
  ["home", "/"],
  ["new", "/new"],
  ["import", "/import"],
  ["search", "/search?q=feeding+a+hungry+sourdough+starter"],
  ...(convoId ? [["convo", `/c/${convoId}`]] : []),
];

const browser = await chromium.launch({ channel: "msedge", headless: true });
for (const theme of ["dark", "light"]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme });
  await ctx.addInitScript((t) => localStorage.setItem("theme", t), theme);
  const page = await ctx.newPage();
  for (const [name, url] of pages) {
    await page.goto(base + url, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(out, `${name}-${theme}.png`) });
    if (name === "convo") {
      // dialogs
      await page.getByRole("button", { name: "Edit" }).click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(out, `dialog-edit-${theme}.png`) });
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Delete" }).click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(out, `dialog-delete-${theme}.png`) });
      await page.keyboard.press("Escape");
      await page.getByRole("tab", { name: "Add message" }).click();
      await page.getByRole("combobox").first().click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(out, `select-open-${theme}.png`) });
      await page.keyboard.press("Escape");
    }
  }
  await ctx.close();
}
await browser.close();
console.log("done ->", out);
