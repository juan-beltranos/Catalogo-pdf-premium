import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.tsx";

import { registerSW } from "virtual:pwa-register";

registerSW({
  immediate: true,
  onOfflineReady() {
    console.log("✅ La app ya está lista para usarse sin internet.");
  },
  onNeedRefresh() {
    console.log("🔄 Hay una nueva versión disponible. Recarga para actualizar.");
  },
});

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
