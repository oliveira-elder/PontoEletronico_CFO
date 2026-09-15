import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { OrientationLockOverlay } from "./components/OrientationLockOverlay";
import { AccessibilityMenu } from "./components/accessibility-menu/AccessibilityMenu";
import { router } from "./app/router";
import "./styles/global.css";
import "./components/accessibility-menu/AccessibilityMenu.css";
import "./components/accessibility-menu/accessibility-theme.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <>
    <OrientationLockOverlay />
    <ErrorBoundary>
      <AuthProvider>
        <div data-intranet-a11y-app="">
          <RouterProvider router={router} />
        </div>
        <AccessibilityMenu storageKey="ponto-cfo-accessibility-v1" />
      </AuthProvider>
    </ErrorBoundary>
  </>
);
