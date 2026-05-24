import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  test: {
    environment: "jsdom",
    include: ["src/**/*.{test,spec}.{js,jsx}"],
    setupFiles: "./src/test/setup.js",
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
