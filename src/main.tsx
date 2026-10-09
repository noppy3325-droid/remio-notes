import React from "react";
import { createRoot } from "react-dom/client";
import SessionGate from "./Account";
import "./style.css";
import "./readability.css";
import "./account.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SessionGate />
  </React.StrictMode>,
);
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch((error) => {
    console.warn("オフライン利用の準備に失敗しました。", error);
  });
}
