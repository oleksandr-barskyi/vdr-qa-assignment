import { test, expect } from "../../src/fixtures";
import { env } from "../../src/config";
import { uniqueEmail } from "../../src/data/factory";

test.describe("auth", () => {
  test("register returns a token and creates a default data room", async ({ owner }) => {
    const me = await owner.api.me();
    expect(me.status).toBe(200);
    expect(me.body.email).toBe(owner.email);
    const rooms = await owner.api.listRooms();
    expect(rooms.body.items).toHaveLength(1);
  });

  test("email is case-insensitive for login and duplicates", async ({ anon }) => {
    const email = uniqueEmail("case");
    const reg = await anon.register("QA case", email.toUpperCase(), env.password);
    expect(reg.status).toBe(201);
    expect((await anon.login(email, env.password)).status).toBe(200);
    expect((await anon.register("QA case", email, env.password)).status).toBe(409);
  });

  test("wrong password and unknown email give the same 401 (no user enumeration)", async ({ anon, owner }) => {
    const wrongPassword = await anon.login(owner.email, "definitely-wrong");
    const unknownEmail = await anon.login(uniqueEmail("ghost"), "definitely-wrong");
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect((wrongPassword.body as any).message).toBe((unknownEmail.body as any).message);
  });

  test("protected endpoints reject missing and malformed tokens", async ({ anon }) => {
    expect((await anon.listRooms()).status).toBe(401);
    expect((await anon.withToken("not.a.jwt").listRooms()).status).toBe(401);
  });

  for (const [title, body] of [
    ["short password", { name: "QA", email: uniqueEmail("v"), password: "short" }],
    ["invalid email", { name: "QA", email: "not-an-email", password: env.password }],
    ["empty name", { name: "", email: uniqueEmail("v"), password: env.password }],
  ] as const) {
    test(`register validation: ${title} -> 400`, async ({ anon }) => {
      expect((await anon.post("/auth/register", body)).status).toBe(400);
    });
  }
});
