import type { Page } from "@playwright/test";
import { test } from "../../src/fixtures";
import { RoomPage } from "../../src/pages/room-page";

const shotsDir = "docs/ux";

const viewports = [
  { tag: "desktop", width: 1440, height: 900 },
  { tag: "mobile", width: 390, height: 844 },
];

async function shot(page: Page, tag: string, name: string) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${shotsDir}/${tag}-${name}.png`, fullPage: true });
}

for (const vp of viewports) {
  test(`ux tour ${vp.tag}`, async ({ page, owner, viewer, pdf, loginAs, browser }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: vp.width, height: vp.height });

    await page.goto("/login");
    await shot(page, vp.tag, "01-login");
    await page.getByRole("textbox").first().fill(owner.email);
    await page.locator("input[type=password]").fill("wrong-password");
    await page.getByRole("button", { name: /sign in|log in|login/i }).first().click();
    await shot(page, vp.tag, "02-login-error");

    await page.goto("/register");
    await shot(page, vp.tag, "03-register");

    await loginAs(page, owner);
    await shot(page, vp.tag, "04-empty-room");

    const folder = await owner.api.createFolder(owner.roomId, "Financials");
    await owner.api.createFolder(owner.roomId, "Legal");
    await owner.api.uploadPdf(owner.roomId, "investor-deck.pdf", pdf);
    await owner.api.uploadPdf(owner.roomId, "a-very-long-file-name-for-the-share-purchase-agreement-final-v3-signed.pdf", pdf);
    await owner.api.uploadPdf(owner.roomId, "q3-report.pdf", pdf, folder.body.id);
    await owner.api.createShare({ resourceType: "FOLDER", resourceId: folder.body.id, mode: "USER", granteeEmail: viewer.email });
    await page.reload();
    await shot(page, vp.tag, "05-room-with-content");

    const room = new RoomPage(page);
    await room.newFolderButton.click();
    await shot(page, vp.tag, "06-new-folder-dialog");
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Actions for investor-deck.pdf" }).first().click();
    await shot(page, vp.tag, "07-row-actions");
    await page.getByRole("menuitem", { name: "Rename" }).click();
    await shot(page, vp.tag, "08-rename-dialog");
    await page.keyboard.press("Escape");

    await room.rowAction("investor-deck.pdf", "Delete");
    await shot(page, vp.tag, "09-delete-confirm");
    await page.keyboard.press("Escape");

    await room.shareButton.click();
    await shot(page, vp.tag, "10-share-dialog");
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Create public link" }).click();
    await dialog.locator("input[readonly]").waitFor();
    await shot(page, vp.tag, "11-share-link-created");
    const link = await dialog.locator("input[readonly]").inputValue();
    await page.keyboard.press("Escape");

    await room.openFolder("Financials");
    await shot(page, vp.tag, "12-folder-view");

    await page.getByRole("cell", { name: "q3-report.pdf", exact: true }).click();
    await page.waitForTimeout(2500);
    await shot(page, vp.tag, "13-file-viewer");

    const anonCtx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const visitor = await anonCtx.newPage();
    await visitor.goto(link);
    await shot(visitor, vp.tag, "14-public-link");
    await anonCtx.close();

    const viewerCtx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const vpage = await viewerCtx.newPage();
    await loginAs(vpage, viewer);
    await vpage.getByRole("link", { name: "Shared with me" }).click();
    await shot(vpage, vp.tag, "15-shared-with-me");
    await viewerCtx.close();
  });
}
