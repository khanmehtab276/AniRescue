export default {
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  retries: globalThis.process?.env?.CI ? 1 : 0,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    browserName: "chromium",
    viewport: { width: 1280, height: 720 },
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !globalThis.process?.env?.CI,
    timeout: 120_000,
  },
};
