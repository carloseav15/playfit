import path from "node:path";

import { defineConfig } from "vite";

const buildTarget = process.env.BUILD_TARGET ?? "public";

const inputByTarget = {
  public: {
    main: path.resolve(__dirname, "index.html"),
    app: path.resolve(__dirname, "app/index.html"),
  },
  workbench: {
    workbench: path.resolve(__dirname, "workbench/index.html"),
  },
  all: {
    main: path.resolve(__dirname, "index.html"),
    app: path.resolve(__dirname, "app/index.html"),
    workbench: path.resolve(__dirname, "workbench/index.html"),
  },
} as const;

function getRollupInput() {
  if (buildTarget === "workbench") return inputByTarget.workbench;
  if (buildTarget === "all") return inputByTarget.all;
  return inputByTarget.public;
}

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      input: getRollupInput(),
    },
  },
});
