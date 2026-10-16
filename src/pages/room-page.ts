import { expect, type Locator, type Page } from "@playwright/test";

export class RoomPage {
  constructor(private readonly page: Page) {}

  row(name: string): Locator {
    return this.page.getByRole("row").filter({ has: this.page.getByRole("cell", { name, exact: true }) });
  }

  rows(): Locator {
    return this.page.getByRole("table").getByRole("rowgroup").last().getByRole("row");
  }

  get uploadButton() {
    return this.page.getByRole("button", { name: "Upload" }).first();
  }

  get newFolderButton() {
    return this.page.getByRole("button", { name: "New folder" }).first();
  }

  get shareButton() {
    return this.page.getByRole("button", { name: "Share", exact: true }).first();
  }

  async createFolder(name: string) {
    await this.newFolderButton.click();
    await this.page.getByRole("dialog").getByRole("textbox").fill(name);
    await this.page.getByRole("dialog").getByRole("button", { name: "Create" }).click();
    await expect(this.row(name)).toBeVisible();
  }

  async openFolder(name: string) {
    await this.page.getByRole("cell", { name, exact: true }).click();
    await expect(this.page.getByRole("navigation", { name: "Breadcrumb" })).toContainText(name);
  }

  async upload(files: { name: string; mimeType: string; buffer: Buffer }[]) {
    const chooser = this.page.waitForEvent("filechooser");
    await this.uploadButton.click();
    await (await chooser).setFiles(files);
  }

  async rowAction(name: string, action: "Rename" | "Move" | "Download" | "Share" | "Delete") {
    await this.page.getByRole("button", { name: `Actions for ${name}` }).first().click();
    await this.page.getByRole("menuitem", { name: action }).click();
  }

  async renameFile(from: string, typedName: string, expected: string) {
    await this.rowAction(from, "Rename");
    const dialog = this.page.getByRole("dialog");
    await dialog.getByRole("textbox").fill(typedName);
    await dialog.getByRole("button", { name: /save|rename/i }).click();
    await expect(this.row(expected)).toBeVisible();
  }

  async deleteFile(name: string) {
    await this.rowAction(name, "Delete");
    await this.page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await expect(this.row(name)).toHaveCount(0);
  }
}
