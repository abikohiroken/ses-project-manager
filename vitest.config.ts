import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    env: {
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
      AUTH_SECRET: "test-auth-secret",
      AUTH_GOOGLE_ID: "test-google-id",
      AUTH_GOOGLE_SECRET: "test-google-secret",
      APP_URL: "http://localhost:3000",
      NEXTAUTH_URL: "http://localhost:3000",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
