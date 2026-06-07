import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/__TOKEN__/",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/__TOKEN__/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true
      }
    }
  }
});
