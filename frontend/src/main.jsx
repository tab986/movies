import React, { Suspense } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import "./index.css";

function LoadingShell() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-dark">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand-red border-t-transparent" />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<LoadingShell />}>
            <App />
          </Suspense>
          <Toaster
            position="top-center"
            toastOptions={{
              className: "!bg-zinc-900 !text-zinc-100 !border !border-zinc-700",
              duration: 3200,
            }}
          />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
