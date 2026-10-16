import { test, expect } from "../../src/fixtures";
import { RoomPage } from "../../src/pages/room-page";
import { uniqueName } from "../../src/data/factory";

test.describe("owner core flow", () => {
  test("create folder, upload PDF, rename, open, delete", async ({ page, owner, loginAs, pdf }) => {
    await loginAs(page, owner);
    const room = new RoomPage(page);
    const folder = uniqueName("Due diligence");

    await room.createFolder(folder);
    await room.openFolder(folder);

    await room.upload([{ name: "term-sheet.pdf", mimeType: "application/pdf", buffer: pdf }]);
    await expect(room.row("term-sheet.pdf")).toBeVisible({ timeout: 30_000 });

    await room.renameFile("term-sheet.pdf", "term-sheet-v2", "term-sheet-v2.pdf");

    await page.getByRole("cell", { name: "term-sheet-v2.pdf", exact: true }).click();
    await expect(page).toHaveURL(/\/file\//);
    await expect(page.getByText("term-sheet-v2.pdf").first()).toBeVisible();
    await page.goBack();

    await room.deleteFile("term-sheet-v2.pdf");
    const api = await owner.api.roomContents(owner.roomId);
    expect(api.status).toBe(200);
  });

  test("non-PDF files are rejected with a message, PDFs in the same batch still upload", async ({ page, owner, loginAs, pdf }) => {
    await loginAs(page, owner);
    const room = new RoomPage(page);
    await room.upload([
      { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") },
      { name: "ok.pdf", mimeType: "application/pdf", buffer: pdf },
    ]);
    await expect(page.getByText("notes.txt is not a PDF")).toBeVisible();
    await expect(room.row("ok.pdf")).toBeVisible({ timeout: 30_000 });
    await expect(room.row("notes.txt")).toHaveCount(0);
  });

  test("creating a folder with an existing name shows a clear error", async ({ page, owner, loginAs }) => {
    await owner.api.createFolder(owner.roomId, "Contracts");
    await loginAs(page, owner);
    const room = new RoomPage(page);
    await room.newFolderButton.click();
    await page.getByRole("dialog").getByRole("textbox").fill("contracts");
    await page.getByRole("dialog").getByRole("button", { name: "Create" }).click();
    await expect(page.getByText('A folder named "contracts" already exists here')).toBeVisible();
  });

  test("KNOWN VDR-10: typing the full name with .pdf in the rename field does not double the extension", async ({ page, owner, loginAs, pdf }) => {
    test.fail(true, "VDR-10: the field edits the base name only, a typed '.pdf' becomes 'name.pdf.pdf'");
    await owner.api.uploadPdf(owner.roomId, "nda.pdf", pdf);
    await loginAs(page, owner);
    const room = new RoomPage(page);
    await room.renameFile("nda.pdf", "nda-signed.pdf", "nda-signed.pdf");
  });

  test("KNOWN VDR-01: two files with the same name in one upload batch get unique names", async ({ page, owner, loginAs, pdf }) => {
    test.fail(true, "VDR-01: parallel upload intents race, both rows are named same.pdf");
    await loginAs(page, owner);
    const room = new RoomPage(page);
    await room.upload([
      { name: "same.pdf", mimeType: "application/pdf", buffer: pdf },
      { name: "same.pdf", mimeType: "application/pdf", buffer: pdf },
    ]);
    await expect(room.rows()).toHaveCount(2, { timeout: 30_000 });
    await expect(room.row("same (1).pdf")).toBeVisible();
  });
});

test.describe("accessibility", () => {
  test("KNOWN VDR-11: a folder can be opened with the keyboard", async ({ page, owner, loginAs }) => {
    test.fail(true, "VDR-11: rows open on mouse click only, the name is not a link or button");
    const name = uniqueName("Keyboard");
    await owner.api.createFolder(owner.roomId, name);
    await loginAs(page, owner);
    await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();
    let reached = false;
    for (let i = 0; i < 15 && !reached; i++) {
      await page.keyboard.press("Tab");
      reached = await page.evaluate((n) => {
        const el = document.activeElement as HTMLElement | null;
        return !!el && el.innerText?.trim() === n && !el.getAttribute("aria-label");
      }, name);
    }
    expect(reached).toBe(true);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/folder\//);
  });
});

test.describe("auth UI", () => {
  test("unauthenticated visitor is sent to the login page", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
  });

  test("wrong password shows an error and keeps the user on login", async ({ page, owner }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(owner.email);
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText(/invalid email or password/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});
