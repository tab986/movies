import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  // Load PORT from project root .env so the proxy matches the API
  const rootEnv = loadEnv(mode, path.join(__dirname, ".."), "");
  // Match backend/server.js: root .env PORT, or PORT in the shell when starting Vite
  const apiPort = String(rootEnv.PORT || process.env.PORT || "5000").trim();
  const apiTarget = `http://127.0.0.1:${apiPort}`;

  return {
    envDir: path.join(__dirname, ".."),
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
          configure(proxy) {
            proxy.on("error", (err) => {
              console.error(
                `[vite] /api proxy → ${apiTarget} failed: ${err.message}`
              );
            });
          },
        },
      },
    },
  };
});
