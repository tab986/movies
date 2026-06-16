import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
        <Toaster
          position="top-center"
          toastOptions={{
            className: "!bg-zinc-900 !text-zinc-100 !border !border-zinc-700",
            duration: 3200,
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
