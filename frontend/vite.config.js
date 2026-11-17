import path from "path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const projectRoot = fileURLToPath(new URL(".", import.meta.url));
  const env = loadEnv(mode, projectRoot, "");
  const apiUrl = env.VITE_API_URL ?? "/api";
  const proxyTarget =
    env.VITE_API_PROXY_TARGET ||
    (apiUrl.startsWith("http")
      ? new URL(apiUrl).origin
      : "http://127.0.0.1:3000");

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(projectRoot, "src"),
      },
    },
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": {
          target: proxyTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});
