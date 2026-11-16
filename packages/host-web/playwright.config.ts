import { defineConfig } from "@playwright/test";

/** The author's phone: 440×956 CSS pixels at 3x, touch. WebKit, like Safari on iOS. */
export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  use: {
    baseURL: "http://localhost:5179",
    viewport: { width: 440, height: 956 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
  projects: [
    { name: "phone", use: { browserName: "webkit" } },
    { name: "small-phone", use: { browserName: "webkit", viewport: { width: 375, height: 667 }, deviceScaleFactor: 2 } },
  ],
  // The production build, so the service worker and offline mode are tested too.
  webServer: { command: "npx vite build && npx vite preview --port 5179 --strictPort", url: "http://localhost:5179", reuseExistingServer: !process.env.CI },
});
