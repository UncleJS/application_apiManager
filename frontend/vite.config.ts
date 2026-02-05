import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 55000,
    host: true
  },
  preview: {
    port: 55000,
    host: true
  }
});
