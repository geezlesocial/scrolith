import { defineConfig } from "cypress";

export default defineConfig({
  e2e: {
    baseUrl: "http://localhost:3001",
    supportFile: "cypress/support/e2e.ts",
    // Allow CI to override backend target via env vars:
    // - CYPRESS_apiUrl (preferred)
    // - BACKEND_URL (fallback, will be converted to <BACKEND_URL>/api)
    env: {
      apiUrl: process.env.CYPRESS_apiUrl || (process.env.BACKEND_URL ? `${process.env.BACKEND_URL.replace(/\/$/, '')}/api` : '/api'),

      // UPDATE IF NEEDED
      adminEmail: "admin@Scrolith.com",
      adminPassword: "admin12345",

      freelancerEmail: "shagocart@gmail.com",
      freelancerPassword: "user12345"
    }
  }
});
