import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { Capacitor } from "@capacitor/core";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles.css";

// Add native class to html for iOS-specific CSS
if (Capacitor.isNativePlatform()) {
  document.documentElement.classList.add("native-app");
}
import "./planning/styles/planning-layout.css";
import "./planning/styles/planning-calendar.css";
import "./planning/styles/planning-cards.css";
import "./planning/styles/planning-library.css";
import "./planning/styles/planning-composer.css";
import "./athlete/styles/athlete.css";
import "./styles/science-advisor.css";
import "./styles/landing.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);

