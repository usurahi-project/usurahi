import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.js",
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
