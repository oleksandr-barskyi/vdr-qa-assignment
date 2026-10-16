import { test as base, expect, type Page } from "@playwright/test";
import { ApiClient } from "./api/client";
import { env } from "./config";
import { makePdf, uniqueEmail } from "./data/factory";

export interface TestUser {
  email: string;
  password: string;
  name: string;
  token: string;
  roomId: string;
  api: ApiClient;
}

interface Fixtures {
  anon: ApiClient;
  owner: TestUser;
  viewer: TestUser;
  stranger: TestUser;
  pdf: Buffer;
  loginAs: (page: Page, user: TestUser) => Promise<void>;
}

async function createUser(anon: ApiClient, tag: string): Promise<TestUser> {
  const email = uniqueEmail(tag);
  const name = `QA ${tag}`;
  const reg = await anon.register(name, email, env.password);
  expect(reg.status, `register ${tag}`).toBe(201);
  const api = anon.withToken(reg.body.accessToken);
  const rooms = await api.listRooms();
  expect(rooms.status).toBe(200);
  return {
    email,
    password: env.password,
    name,
    token: reg.body.accessToken,
    roomId: rooms.body.items[0].id,
    api,
  };
}

export const test = base.extend<Fixtures>({
  anon: async ({ playwright }, use) => {
    const request = await playwright.request.newContext();
    await use(new ApiClient(request, env.apiUrl));
    await request.dispose();
  },
  owner: async ({ anon }, use) => use(await createUser(anon, "owner")),
  viewer: async ({ anon }, use) => use(await createUser(anon, "viewer")),
  stranger: async ({ anon }, use) => use(await createUser(anon, "stranger")),
  pdf: async ({}, use) => use(await makePdf()),
  loginAs: async ({}, use) => {
    await use(async (page, user) => {
      await page.goto("/login");
      await page.evaluate(
        ([key, token]) => localStorage.setItem(key, token),
        [env.tokenStorageKey, user.token],
      );
      await page.goto("/");
    });
  },
});

export { expect };
