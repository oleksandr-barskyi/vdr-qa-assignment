import { test, expect } from "../../src/fixtures";
import { uniqueName } from "../../src/data/factory";

const names = (page: { items: any[] }) => page.items.map((i) => i.name);

test.describe("folders", () => {
  test("nested folders with breadcrumbs in root-to-leaf order", async ({ owner }) => {
    const a = await owner.api.createFolder(owner.roomId, "Level A");
    const b = await owner.api.createFolder(owner.roomId, "Level B", a.body.id);
    const c = await owner.api.createFolder(owner.roomId, "Level C", b.body.id);
    expect(c.status).toBe(201);
    const crumbs = JSON.stringify((await owner.api.breadcrumbs(c.body.id)).body);
    expect(crumbs.indexOf("Level A")).toBeLessThan(crumbs.indexOf("Level B"));
    expect(crumbs.indexOf("Level B")).toBeLessThan(crumbs.indexOf("Level C"));
  });

  test("folder names are unique per parent, case-insensitively", async ({ owner }) => {
    const name = uniqueName("Docs");
    expect((await owner.api.createFolder(owner.roomId, name)).status).toBe(201);
    expect((await owner.api.createFolder(owner.roomId, name.toUpperCase())).status).toBe(409);
    expect((await owner.api.createFolder(owner.roomId, `  ${name}  `)).status).toBe(409);
    const other = await owner.api.createFolder(owner.roomId, uniqueName("Other"));
    expect((await owner.api.createFolder(owner.roomId, name, other.body.id)).status).toBe(201);
  });

  test("renaming into an existing sibling name is rejected", async ({ owner }) => {
    const first = await owner.api.createFolder(owner.roomId, uniqueName("First"));
    const second = await owner.api.createFolder(owner.roomId, uniqueName("Second"));
    expect((await owner.api.renameFolder(second.body.id, first.body.name)).status).toBe(409);
    expect((await owner.api.renameFolder(second.body.id, "   ")).status).toBe(400);
  });

  test("delete preview counts the whole subtree and delete removes it", async ({ owner, pdf }) => {
    const top = await owner.api.createFolder(owner.roomId, uniqueName("Top"));
    const child = await owner.api.createFolder(owner.roomId, "Child", top.body.id);
    const f1 = await owner.api.uploadPdf(owner.roomId, "one.pdf", pdf, top.body.id);
    const f2 = await owner.api.uploadPdf(owner.roomId, "two.pdf", pdf, child.body.id);

    const preview = await owner.api.deletePreview(top.body.id);
    expect(preview.status).toBe(200);
    expect(JSON.stringify(preview.body)).toMatch(/2/);

    expect((await owner.api.deleteFolder(top.body.id)).status).toBe(204);
    expect((await owner.api.folderContents(child.body.id)).status).toBe(404);
    expect((await owner.api.getFile(f1.id)).status).toBe(404);
    expect((await owner.api.getFile(f2.id)).status).toBe(404);
  });
});

test.describe("files", () => {
  test("uploaded PDF is listed and served as application/pdf", async ({ owner, pdf, playwright }) => {
    const file = await owner.api.uploadPdf(owner.roomId, "served.pdf", pdf);
    expect(names((await owner.api.roomContents(owner.roomId)).body)).toContain("served.pdf");
    const view = await owner.api.viewUrl(file.id);
    const request = await playwright.request.newContext();
    const res = await request.get(view.body.url);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/pdf");
    await request.dispose();
  });

  test("same-name upload in one folder gets a numbered name, case-insensitively", async ({ owner, pdf }) => {
    const first = await owner.api.uploadPdf(owner.roomId, "Report.pdf", pdf);
    const second = await owner.api.uploadPdf(owner.roomId, "report.PDF", pdf);
    expect(first.name).toBe("Report.pdf");
    expect(second.name).toBe("report (1).PDF");
  });

  test("rename into an existing name is resolved with a suffix", async ({ owner, pdf }) => {
    await owner.api.uploadPdf(owner.roomId, "taken.pdf", pdf);
    const other = await owner.api.uploadPdf(owner.roomId, "other.pdf", pdf);
    const renamed = await owner.api.renameFile(other.id, "taken.pdf");
    expect(renamed.status).toBe(200);
    expect(renamed.body.name).toBe("taken (1).pdf");
  });

  test("move to another folder resolves a name conflict at the destination", async ({ owner, pdf }) => {
    const dest = await owner.api.createFolder(owner.roomId, uniqueName("Dest"));
    await owner.api.uploadPdf(owner.roomId, "contract.pdf", pdf, dest.body.id);
    const mover = await owner.api.uploadPdf(owner.roomId, "contract.pdf", pdf);
    const moved = await owner.api.moveFile(mover.id, dest.body.id);
    expect(moved.status).toBe(200);
    expect(moved.body.folderId).toBe(dest.body.id);
    expect(moved.body.name).toBe("contract (1).pdf");
    const back = await owner.api.moveFile(mover.id, null);
    expect(back.body.folderId).toBeNull();
  });

  test("a file cannot be moved into a folder of another data room", async ({ owner, pdf }) => {
    const room2 = await owner.api.createRoom(uniqueName("Second room"));
    const foreignFolder = await owner.api.createFolder(room2.body.id, "Foreign");
    const file = await owner.api.uploadPdf(owner.roomId, "stay.pdf", pdf);
    expect((await owner.api.moveFile(file.id, foreignFolder.body.id)).status).toBe(404);
  });

  test("delete removes the file", async ({ owner, pdf }) => {
    const file = await owner.api.uploadPdf(owner.roomId, "gone.pdf", pdf);
    expect((await owner.api.deleteFile(file.id)).status).toBe(204);
    expect((await owner.api.getFile(file.id)).status).toBe(404);
  });

  test("an intent without uploaded bytes is not listed and cannot be completed", async ({ owner }) => {
    const intent = await owner.api.uploadIntent({ dataRoomId: owner.roomId, name: "ghost.pdf", size: 100, mimeType: "application/pdf" });
    expect((await owner.api.completeUpload(intent.body.fileId)).status).toBeGreaterThanOrEqual(400);
    expect(names((await owner.api.roomContents(owner.roomId)).body)).not.toContain("ghost.pdf");
  });

  for (const [title, patch] of [
    ["non-PDF mime type", { mimeType: "text/html" }],
    ["size over 50 MB", { size: 50 * 1024 * 1024 + 1 }],
    ["zero size", { size: 0 }],
    ["blank name", { name: "   " }],
  ] as const) {
    test(`upload intent validation: ${title} -> 400`, async ({ owner }) => {
      const base = { dataRoomId: owner.roomId, name: "x.pdf", size: 100, mimeType: "application/pdf" };
      const res = await owner.api.uploadIntent({ ...base, ...patch });
      expect(res.status).toBe(400);
    });
  }
});

test.describe("listing and pagination", () => {
  test("keyset pagination returns every item exactly once", async ({ owner }) => {
    for (const n of ["p1", "p2", "p3", "p4", "p5"]) await owner.api.createFolder(owner.roomId, n);
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const query: string = `?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const page = await owner.api.roomContents(owner.roomId, query);
      expect(page.status).toBe(200);
      expect(page.body.items.length).toBeLessThanOrEqual(2);
      seen.push(...names(page.body));
      cursor = page.body.nextCursor;
    } while (cursor);
    expect(seen.sort()).toEqual(["p1", "p2", "p3", "p4", "p5"]);
  });

  for (const query of ["?limit=0", "?limit=101", "?limit=abc", "?cursor=garbage"]) {
    test(`invalid paging parameter ${query} -> 400`, async ({ owner }) => {
      expect((await owner.api.roomContents(owner.roomId, query)).status).toBe(400);
    });
  }

  test("malformed ids are rejected with 400 instead of 500", async ({ owner }) => {
    expect((await owner.api.getFile("not-a-uuid")).status).toBe(400);
    expect((await owner.api.folderContents("not-a-uuid")).status).toBe(400);
  });
});

test.describe("sharing lifecycle", () => {
  test("deleting a shared folder kills its public link and the viewer's entry", async ({ owner, viewer, anon }) => {
    const folder = await owner.api.createFolder(owner.roomId, uniqueName("Doomed"));
    const pub = await owner.api.createShare({ resourceType: "FOLDER", resourceId: folder.body.id, mode: "PUBLIC_LINK" });
    await owner.api.createShare({ resourceType: "FOLDER", resourceId: folder.body.id, mode: "USER", granteeEmail: viewer.email });
    expect((await viewer.api.receivedShares()).body.items).toHaveLength(1);

    await owner.api.deleteFolder(folder.body.id);
    expect((await anon.publicShare(pub.body.token)).status).toBe(404);
    expect((await viewer.api.receivedShares()).body.items).toHaveLength(0);
  });

  test("owner sees active shares of a resource; revoked ones disappear", async ({ owner, viewer }) => {
    const share = await owner.api.createShare({ resourceType: "DATAROOM", resourceId: owner.roomId, mode: "USER", granteeEmail: viewer.email });
    let list = await owner.api.listShares("DATAROOM", owner.roomId);
    expect(list.body.items.map((s: any) => s.id)).toContain(share.body.id);
    await owner.api.revokeShare(share.body.id);
    list = await owner.api.listShares("DATAROOM", owner.roomId);
    expect(list.body.items.map((s: any) => s.id)).not.toContain(share.body.id);
  });
});
