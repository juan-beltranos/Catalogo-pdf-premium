import path from "path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");

  return {
    server: {
      port: 3000,
      host: "0.0.0.0",
    },

    plugins: [
      react(),

      VitePWA({
        registerType: "autoUpdate",

        includeAssets: [
          "favicon.ico",
          "apple-touch-icon.png",
          "icons/icon-192.png",
          "icons/icon-512.png",
        ],

        manifest: {
          name: "Catálogo Instantáneo",
          short_name: "Catálogo",
          description: "Catálogo instalable y usable sin internet",
          start_url: "/",
          scope: "/",
          display: "standalone",
          theme_color: "#0f172a",
          background_color: "#0f172a",
          icons: [
            {
              src: "/icons/icon-192.png",
              sizes: "192x192",
              type: "image/png",
            },
            {
              src: "/icons/icon-512.png",
              sizes: "512x512",
              type: "image/png",
            },
            {
              src: "/icons/icon-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any maskable",
            },
          ],
        },

        workbox: {
          // cachea todo el build automáticamente
          globPatterns: [
            "**/*.{js,css,html,ico,png,svg,webp,json,woff2}",
          ],

          // necesario para SPA (React)
          navigateFallback: "/index.html",

          runtimeCaching: [
            {
              // imágenes
              urlPattern: ({ request }) =>
                request.destination === "image",
              handler: "CacheFirst",
              options: {
                cacheName: "images-cache",
                expiration: {
                  maxEntries: 200,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                },
              },
            },
            {
              // páginas / navegación
              urlPattern: ({ request }) =>
                request.destination === "document",
              handler: "NetworkFirst",
              options: {
                cacheName: "pages-cache",
              },
            },
          ],
        },
      }),
    ],

    define: {
      "process.env.API_KEY": JSON.stringify(env.GEMINI_API_KEY),
      "process.env.GEMINI_API_KEY": JSON.stringify(env.GEMINI_API_KEY),
    },

    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
  };
});
