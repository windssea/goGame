import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  server: { port: 5186, strictPort: true },
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      injectRegister: "auto",
      manifest: {
        name: "弈间 Go Studio",
        short_name: "弈间",
        lang: "zh-CN",
        description: "从第一颗棋子开始的 3D 围棋学习空间",
        theme_color: "#153e35",
        background_color: "#f4f6f3",
        display: "standalone",
        icons: [
          {
            src: "/favicon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 3_000_000,
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) =>
          id.includes("/node_modules/three/")
            ? "three"
            : /\/node_modules\/react(?:-dom)?\//.test(id)
              ? "react"
              : undefined,
      },
    },
  },
});
