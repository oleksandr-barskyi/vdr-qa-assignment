import { test, expect } from "../../src/fixtures";
import { env } from "../../src/config";
import { uniqueEmail } from "../../src/data/factory";

test.describe("known issues (open defects)", () => {
  test("VDR-01 concurrent uploads with the same name must not create duplicates", async ({ owner, pdf }) => {
    test.fail(true, "VDR-01: name conflict check is not atomic, no unique index on (room, folder, nameLower)");
    const uploads = await Promise.all(
      Array.from({ length: 4 }, () => owner.api.uploadPdf(owner.roomId, "parallel.pdf", pdf)),
    );
    expect(new Set(uploads.map((u) => u.name)).size).toBe(4);
  });

  test("VDR-02 server must enforce the declared size and PDF type of the stored object", async ({ owner }) => {
    test.fail(true, "VDR-02: completeUpload trusts the client; size and content type are never checked");
    const intent = await owner.api.uploadIntent({ dataRoomId: owner.roomId, name: "fake.pdf", size: 1, mimeType: "application/pdf" });
    await owner.api.putToStorage(intent.body.uploadUrl, "<html>not a pdf</html>".repeat(100), "text/html");
    const complete = await owner.api.completeUpload(intent.body.fileId);
    expect(complete.status).toBe(400);
  });

  test("VDR-08 completing an upload whose bytes never arrived must be a 4xx, not a 500", async ({ owner }) => {
    test.fail(true, "VDR-08: Supabase answers 400 for a missing object, the service only maps 404 to 'not uploaded'");
    const intent = await owner.api.uploadIntent({ dataRoomId: owner.roomId, name: "never-sent.pdf", size: 100, mimeType: "application/pdf" });
    expect((await owner.api.completeUpload(intent.body.fileId)).status).toBe(400);
  });

  test("VDR-03 repeated failed logins must be throttled", async ({ anon, owner }) => {
    test.fail(true, "VDR-03: no rate limiting or lockout on /auth/login");
    const statuses: number[] = [];
    for (let i = 0; i < 10; i++) statuses.push((await anon.login(owner.email, `wrong-${i}`)).status);
    expect(statuses).toContain(429);
  });

  test("VDR-04 passwords longer than 72 bytes must not be silently truncated", async ({ anon }) => {
    test.fail(true, "VDR-04: bcrypt uses only the first 72 bytes; MaxLength(72) counts characters, not bytes");
    const email = uniqueEmail("bcrypt");
    const prefix = "ж".repeat(40);
    expect((await anon.register("QA bcrypt", email, `${prefix}A`)).status).toBe(201);
    expect((await anon.login(email, `${prefix}completely different tail`)).status).toBe(401);
  });

  test("VDR-05 whitespace-only names must be rejected", async ({ anon, owner }) => {
    test.fail(true, "VDR-05: trim runs after validation for user and data room names, empty strings are stored");
    const user = await anon.register("   ", uniqueEmail("blank"), env.password);
    const room = await owner.api.createRoom("   ");
    expect([user.status, room.status]).toEqual([400, 400]);
  });

  test("VDR-06 rename must keep the file a PDF", async ({ owner, pdf }) => {
    test.fail(true, "VDR-06: rename accepts any extension, a PDF can be renamed to invoice.exe");
    const file = await owner.api.uploadPdf(owner.roomId, "invoice.pdf", pdf);
    const renamed = await owner.api.renameFile(file.id, "invoice.exe");
    expect(renamed.status === 400 || renamed.body.name.endsWith(".pdf")).toBe(true);
  });

  test("VDR-07 owner should not be able to share a resource with their own email", async ({ owner }) => {
    test.fail(true, "VDR-07: self-share is accepted and shows up as a share entry");
    const res = await owner.api.createShare({ resourceType: "DATAROOM", resourceId: owner.roomId, mode: "USER", granteeEmail: owner.email });
    expect(res.status).toBe(400);
  });
});
