import { test, expect } from "../../src/fixtures";
import { RoomPage } from "../../src/pages/room-page";
import { uniqueName } from "../../src/data/factory";

test.describe("sharing", () => {
  test("public link: anonymous visitor sees the room, revocation shows a clear page", async ({ page, owner, loginAs, pdf, browser }) => {
    await owner.api.uploadPdf(owner.roomId, "investor-deck.pdf", pdf);
    await loginAs(page, owner);
    const room = new RoomPage(page);

    await room.shareButton.click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Create public link" }).click();
    const link = await dialog.locator("input[readonly]").inputValue();
    expect(link).toMatch(/\/share\/[\w-]+$/);

    const anon = await browser.newContext();
    const visitor = await anon.newPage();
    await visitor.goto(link);
    await expect(visitor.getByText("investor-deck.pdf")).toBeVisible();
    await expect(visitor.getByRole("button", { name: "Upload" })).toHaveCount(0);

    const token = link.split("/share/")[1];
    const shares = await owner.api.listShares("DATAROOM", owner.roomId);
    const share = shares.body.items.find((s: any) => s.token === token);
    await owner.api.revokeShare(share.id);

    await visitor.reload();
    await expect(visitor.getByText("This link has been revoked").first()).toBeVisible();
    await anon.close();
  });

  test("permissioned share: viewer gets a read-only view, and a graceful page after the owner deletes the folder", async ({ owner, viewer, pdf, browser, loginAs }) => {
    const folderName = uniqueName("Board pack");
    const folder = await owner.api.createFolder(owner.roomId, folderName);
    await owner.api.uploadPdf(owner.roomId, "minutes.pdf", pdf, folder.body.id);
    await owner.api.createShare({ resourceType: "FOLDER", resourceId: folder.body.id, mode: "USER", granteeEmail: viewer.email });

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, viewer);
    await page.getByRole("link", { name: "Shared with me" }).click();
    await page.getByText(folderName).first().click();

    const room = new RoomPage(page);
    await expect(room.row("minutes.pdf")).toBeVisible();
    await expect(page.getByRole("button", { name: "Upload" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "New folder" })).toHaveCount(0);

    await page.getByRole("button", { name: "Actions for minutes.pdf" }).click();
    await expect(page.getByRole("menuitem", { name: "Download" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Delete" })).toHaveCount(0);
    await page.keyboard.press("Escape");

    await owner.api.deleteFolder(folder.body.id);
    await page.reload();
    await expect(page.getByText("Folder not found")).toBeVisible();
    await ctx.close();
  });
});
