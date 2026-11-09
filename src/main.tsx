import React from "react";
import ReactDOM from "react-dom/client";
import { ClerkProvider } from "@clerk/react";
import App from "./App";
const key = import.meta.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const app = <App authAvailable={Boolean(key)} />;
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {key ? (
      <ClerkProvider publishableKey={key} afterSignOutUrl="/">
        {app}
      </ClerkProvider>
    ) : (
      app
    )}
  </React.StrictMode>,
);
