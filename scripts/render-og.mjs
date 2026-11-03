// Screenshots the OgCard story to public/og.png (the og:image). Needs Storybook running
// (`pnpm storybook`, or set STORYBOOK_URL). Run with `pnpm og` after changing the card or the copy.
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const storybook = process.env.STORYBOOK_URL ?? "http://localhost:6006";
const storyUrl = `${storybook}/iframe.html?id=ogcard--default&viewMode=story`;

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
});
try {
  await page.goto(storyUrl);
} catch {
  console.error(`Couldn't open ${storyUrl}. Is Storybook running (pnpm storybook)?`);
  await browser.close();
  process.exit(1);
}
const card = page.locator("[data-og-card]");
await card.waitFor();
await page.evaluate(() => document.fonts.ready);

await writeFile(
  path.join(import.meta.dirname, "../public/og.png"),
  await card.screenshot(),
);
await browser.close();
