import { createClerkClient } from "@clerk/backend";
import { ApiError, type OwnerAuthorization } from "./catalog.js";

interface Identity {
  banned?: boolean;
  locked?: boolean;
  primaryEmailAddressId: string | null;
  emailAddresses: {
    id: string;
    emailAddress: string;
    verification: { status: string } | null;
  }[];
}
export function verifiedOwnerEmail(
  user: Identity,
  ownerEmail: string,
): boolean {
  const primary = user.emailAddresses.find(
    (email) => email.id === user.primaryEmailAddressId,
  );
  return Boolean(
    ownerEmail.trim() &&
      !user.banned &&
      !user.locked &&
      primary?.verification?.status === "verified" &&
      primary.emailAddress.trim().toLowerCase() ===
        ownerEmail.trim().toLowerCase(),
  );
}
export function authorizedOrigins(env: NodeJS.ProcessEnv): string[] {
  if (!env.HUB_PUBLIC_ORIGIN)
    throw new Error("The public origin is not configured.");
  const configured = new URL(env.HUB_PUBLIC_ORIGIN);
  if (
    configured.origin !== env.HUB_PUBLIC_ORIGIN ||
    configured.protocol !== "https:" ||
    configured.username ||
    configured.password
  )
    throw new Error("The public origin is invalid.");
  const origins = [configured.origin];
  if (env.NODE_ENV !== "production")
    origins.push(
      "http://127.0.0.1:4173",
      "http://localhost:4173",
      "http://127.0.0.1:5173",
      "http://localhost:5173",
    );
  return origins;
}
export function createOwnerAuthorizer(env: NodeJS.ProcessEnv = process.env) {
  return async (request: Request): Promise<OwnerAuthorization> => {
    const bearer = request.headers.get("authorization");
    if (!bearer) return { signedIn: false, isOwner: false };
    if (!/^Bearer [^\s]+$/i.test(bearer) || bearer.length > 16384)
      throw new ApiError(
        401,
        "unauthorized",
        "Your sign-in session is invalid. Sign in again.",
      );
    if (
      !env.CLERK_SECRET_KEY ||
      !env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
      !env.HUB_OWNER_EMAIL?.trim()
    )
      throw new Error("Owner authentication is not configured.");
    const client = createClerkClient({
      secretKey: env.CLERK_SECRET_KEY,
      publishableKey: env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
      telemetry: { disabled: true },
    });
    const state = await client.authenticateRequest(request, {
      authorizedParties: authorizedOrigins(env),
      acceptsToken: "session_token",
    });
    if (!state.isAuthenticated)
      throw new ApiError(
        401,
        "unauthorized",
        "Your session expired or is invalid. Sign in again.",
      );
    const identity = state.toAuth();
    if (!identity?.userId)
      throw new ApiError(
        401,
        "unauthorized",
        "Your sign-in session is invalid. Sign in again.",
      );
    const user = await client.users.getUser(identity.userId);
    const isOwner = verifiedOwnerEmail(user, env.HUB_OWNER_EMAIL);
    const primary = user.emailAddresses.find(
      (email) => email.id === user.primaryEmailAddressId,
    );
    return {
      signedIn: true,
      isOwner,
      ...(isOwner && primary
        ? {
            actor: {
              userId: identity.userId,
              email: primary.emailAddress.trim().toLowerCase(),
            },
          }
        : {}),
    };
  };
}
