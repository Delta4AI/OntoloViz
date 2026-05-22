import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { bootstrapTheme } from "./lib/theme";
import "./index.css";

bootstrapTheme();

const container = document.getElementById("root");
if (!container) throw new Error("Root container missing in index.html");

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
