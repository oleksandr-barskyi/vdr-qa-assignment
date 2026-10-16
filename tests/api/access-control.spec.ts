import { test, expect } from "../../src/fixtures";
import { uniqueName } from "../../src/data/factory";

test.describe("access control: a stranger cannot see or change someone else's room", () => {
  test("every read endpoint answers 404, not 403, so existence is not leaked", async ({ owner, stranger, pdf }) => {
    const folder = await owner.api.createFolder(owner.roomId, uniqueName("Private"));
    const file = await owner.api.uploadPdf(owner.roomId, "secret.pdf", pdf, folder.body.id);
    const s = stranger.api;
    const reads = [
      s.get(`/data-rooms/${owner.roomId}`),
      s.roomContents(owner.roomId),
      s.get(`/data-rooms/${owner.roomId}/folders`),
      s.folderContents(folder.body.id),
      s.breadcrumbs(folder.body.id),
      s.deletePreview(folder.body.id),
      s.getFile(file.id),
      s.viewUrl(file.id),
      s.downloadUrl(file.id),
      s.listShares("FOLDER", folder.body.id),
    ];
    for (const res of await Promise.all(reads)) expect(res.status).toBe(404);
  });

  test("every write endpoint answers 404 and changes nothing", async ({ owner, stranger, pdf }) => {
    const folder = await owner.api.createFolder(owner.roomId, uniqueName("Target"));
    const file = await owner.api.uploadPdf(owner.roomId, "keep.pdf", pdf);
    const share = await owner.api.createShare({ resourceType: "FILE", resourceId: file.id, mode: "PUBLIC_LINK" });
    const s = stranger.api;
    const writes = [
      s.createFolder(owner.roomId, "intruder"),
      s.renameFolder(folder.body.id, "hacked"),
      s.deleteFolder(folder.body.id),
      s.uploadIntent({ dataRoomId: owner.roomId, name: "x.pdf", size: 10, mimeType: "application/pdf" }),
      s.renameFile(file.id, "hacked.pdf"),
      s.moveFile(file.id, folder.body.id),
      s.deleteFile(file.id),
      s.createShare({ resourceType: "DATAROOM", resourceId: owner.roomId, mode: "PUBLIC_LINK" }),
      s.revokeShare(share.body.id),
    ];
    for (const res of await Promise.all(writes)) expect(res.status).toBe(404);

    const contents = await owner.api.roomContents(owner.roomId);
    const names = contents.body.items.map((i: any) => i.name);
    expect(names).toContain(folder.body.name);
    expect(names).toContain("keep.pdf");
    expect(names).not.toContain("intruder");
    expect((await owner.api.publicShare(share.body.token)).status).toBe(200);
  });

  test("a stranger cannot move their own file into the owner's folder", async ({ owner, stranger, pdf }) => {
    const ownerFolder = await owner.api.createFolder(owner.roomId, uniqueName("Owner"));
    const strangerFile = await stranger.api.uploadPdf(stranger.roomId, "mine.pdf", pdf);
    expect((await stranger.api.moveFile(strangerFile.id, ownerFolder.body.id)).status).toBe(404);
  });
});

test.describe("access control: permissioned (per-email) share", () => {
  test("viewer reads the shared folder subtree and nothing outside it", async ({ owner, viewer, pdf }) => {
    const shared = await owner.api.createFolder(owner.roomId, uniqueName("Shared"));
    const nested = await owner.api.createFolder(owner.roomId, "Nested", shared.body.id);
    const nestedFile = await owner.api.uploadPdf(owner.roomId, "deep.pdf", pdf, nested.body.id);
    const sibling = await owner.api.createFolder(owner.roomId, uniqueName("Sibling"));
    const rootFile = await owner.api.uploadPdf(owner.roomId, "root.pdf", pdf);
    await owner.api.createShare({ resourceType: "FOLDER", resourceId: shared.body.id, mode: "USER", granteeEmail: viewer.email });

    const v = viewer.api;
    expect((await v.folderContents(shared.body.id)).status).toBe(200);
    expect((await v.folderContents(nested.body.id)).status).toBe(200);
    expect((await v.viewUrl(nestedFile.id)).status).toBe(200);
    expect((await v.folderContents(sibling.body.id)).status).toBe(404);
    expect((await v.getFile(rootFile.id)).status).toBe(404);
    expect((await v.roomContents(owner.roomId)).status).toBe(404);

    const received = await v.receivedShares();
    expect(received.body.items.map((i: any) => i.resourceId)).toContain(shared.body.id);
  });

  test("viewer is read-only", async ({ owner, viewer, pdf }) => {
    const shared = await owner.api.createFolder(owner.roomId, uniqueName("Shared"));
    const file = await owner.api.uploadPdf(owner.roomId, "doc.pdf", pdf, shared.body.id);
    await owner.api.createShare({ resourceType: "FOLDER", resourceId: shared.body.id, mode: "USER", granteeEmail: viewer.email });
    const v = viewer.api;
    const writes = [
      v.createFolder(owner.roomId, "viewer folder", shared.body.id),
      v.renameFolder(shared.body.id, "renamed by viewer"),
      v.deleteFolder(shared.body.id),
      v.deletePreview(shared.body.id),
      v.renameFile(file.id, "renamed.pdf"),
      v.deleteFile(file.id),
      v.uploadIntent({ dataRoomId: owner.roomId, folderId: shared.body.id, name: "v.pdf", size: 10, mimeType: "application/pdf" }),
      v.createShare({ resourceType: "FOLDER", resourceId: shared.body.id, mode: "PUBLIC_LINK" }),
    ];
    for (const res of await Promise.all(writes)) expect(res.status).toBe(404);
  });

  test("breadcrumbs do not reveal folder names above the share boundary", async ({ owner, viewer }) => {
    const secretParent = await owner.api.createFolder(owner.roomId, "Secret parent name");
    const shared = await owner.api.createFolder(owner.roomId, "Shared child", secretParent.body.id);
    const leaf = await owner.api.createFolder(owner.roomId, "Leaf", shared.body.id);
    await owner.api.createShare({ resourceType: "FOLDER", resourceId: shared.body.id, mode: "USER", granteeEmail: viewer.email });

    const crumbs = await viewer.api.breadcrumbs(leaf.body.id);
    expect(crumbs.status).toBe(200);
    expect(JSON.stringify(crumbs.body)).not.toContain("Secret parent name");
    expect(JSON.stringify(crumbs.body)).toContain("Shared child");
  });

  test("revoking a share removes access immediately", async ({ owner, viewer, pdf }) => {
    const file = await owner.api.uploadPdf(owner.roomId, "revocable.pdf", pdf);
    const share = await owner.api.createShare({ resourceType: "FILE", resourceId: file.id, mode: "USER", granteeEmail: viewer.email });
    expect((await viewer.api.getFile(file.id)).status).toBe(200);
    expect((await owner.api.revokeShare(share.body.id)).status).toBe(204);
    expect((await viewer.api.getFile(file.id)).status).toBe(404);
    expect((await viewer.api.receivedShares()).body.items).toHaveLength(0);
  });

  test("grantee email is matched case-insensitively", async ({ owner, viewer, pdf }) => {
    const file = await owner.api.uploadPdf(owner.roomId, "case.pdf", pdf);
    await owner.api.createShare({ resourceType: "FILE", resourceId: file.id, mode: "USER", granteeEmail: viewer.email.toUpperCase() });
    expect((await viewer.api.getFile(file.id)).status).toBe(200);
  });
});

test.describe("access control: public link", () => {
  test("token gives read access to the shared subtree only", async ({ owner, anon, pdf }) => {
    const shared = await owner.api.createFolder(owner.roomId, uniqueName("Public"));
    const inside = await owner.api.uploadPdf(owner.roomId, "inside.pdf", pdf, shared.body.id);
    const outside = await owner.api.uploadPdf(owner.roomId, "outside.pdf", pdf);
    const share = await owner.api.createShare({ resourceType: "FOLDER", resourceId: shared.body.id, mode: "PUBLIC_LINK" });
    const token = share.body.token;

    expect((await anon.publicShare(token)).status).toBe(200);
    const contents = await anon.publicFolderContents(token, shared.body.id);
    expect(contents.body.items.map((i: any) => i.name)).toEqual(["inside.pdf"]);
    expect((await anon.publicViewUrl(token, inside.id)).status).toBe(200);
    expect((await anon.publicFile(token, outside.id)).status).toBe(404);
    expect((await anon.publicViewUrl(token, outside.id)).status).toBe(404);
  });

  test("revoked link answers 410, unknown token answers 404", async ({ owner, anon }) => {
    const share = await owner.api.createShare({ resourceType: "DATAROOM", resourceId: owner.roomId, mode: "PUBLIC_LINK" });
    await owner.api.revokeShare(share.body.id);
    expect((await anon.publicShare(share.body.token)).status).toBe(410);
    expect((await anon.publicShare("no-such-token-123")).status).toBe(404);
  });

  test("a public token cannot be used as a bearer token", async ({ owner, anon }) => {
    const share = await owner.api.createShare({ resourceType: "DATAROOM", resourceId: owner.roomId, mode: "PUBLIC_LINK" });
    expect((await anon.withToken(share.body.token).roomContents(owner.roomId)).status).toBe(401);
  });

  test("creating the same public link twice returns the same token", async ({ owner }) => {
    const body = { resourceType: "DATAROOM" as const, resourceId: owner.roomId, mode: "PUBLIC_LINK" as const };
    const first = await owner.api.createShare(body);
    const second = await owner.api.createShare(body);
    expect(second.body.token).toBe(first.body.token);
  });
});
