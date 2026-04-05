import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
  plugins: [solidPlugin()],
  base: "/chat/",
  build: {
    target: "esnext",
    outDir: "dist",
  },
  server: {
    proxy: {
      "/chat/api": {
        target: "http://localhost:8120",
        rewrite: (path) => path.replace(/^\/chat/, ""),
      },
      "/chat/auth": {
        target: "http://localhost:8120",
        rewrite: (path) => path.replace(/^\/chat/, ""),
      },
      "/chat/ws": {
        target: "ws://localhost:8120",
        ws: true,
        rewrite: (path) => path.replace(/^\/chat/, ""),
      },
    },
  },
});
