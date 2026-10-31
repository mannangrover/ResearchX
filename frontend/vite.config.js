import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.PORT) || 5173,
    proxy: {
      // Override with API_URL to point at a different backend (e.g. a local-mode test instance)
      "/api": process.env.API_URL || "http://127.0.0.1:8000",
    },
  },
});
