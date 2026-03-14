import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import "./styles.css";
import "./planning/styles/planning-layout.css";
import "./planning/styles/planning-calendar.css";
import "./planning/styles/planning-cards.css";
import "./planning/styles/planning-library.css";
import "./planning/styles/planning-composer.css";
import "./athlete/styles/athlete.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);

