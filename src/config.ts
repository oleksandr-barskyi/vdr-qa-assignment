export const env = {
  apiUrl:
    process.env.VDR_API_URL ??
    "https://virtual-data-room-production.up.railway.app",
  webUrl: process.env.VDR_WEB_URL ?? "https://virtual-data-room-ten.vercel.app",
  password: process.env.VDR_TEST_PASSWORD ?? "Passw0rd!qa",
  tokenStorageKey: "dataroom_token",
};
