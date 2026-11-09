import React from "react";
import ReactDOM from "react-dom/client";
import { ClerkProvider } from "@clerk/react";
import App from "./App";
const key = import.meta.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const app = <App authAvailable={Boolean(key)} />;
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {key ? (
      <ClerkProvider
        publishableKey={key}
        afterSignOutUrl="/"
        localization={{
          signIn: {
            start: {
              title: "Sign in to Accounting Platforms Hub",
              titleCombined: "Sign in to Accounting Platforms Hub",
            },
          },
          signUp: {
            start: {
              title: "Create your Accounting Platforms Hub account",
              titleCombined: "Create your Accounting Platforms Hub account",
            },
          },
        }}
      >
        {app}
      </ClerkProvider>
    ) : (
      app
    )}
  </React.StrictMode>,
);
