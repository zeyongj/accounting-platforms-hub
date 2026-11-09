import { beforeEach, describe, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  client: vi.fn(),
  authenticate: vi.fn(),
  user: vi.fn(),
}));
vi.mock("@clerk/backend", () => ({ createClerkClient: mocks.client }));
import {
  authorizedOrigins,
  createOwnerAuthorizer,
  verifiedOwnerEmail,
} from "../server/owner";
const env = {
  NODE_ENV: "production",
  HUB_PUBLIC_ORIGIN: "https://hub.example.com",
  HUB_OWNER_EMAIL: "owner@example.com",
  CLERK_SECRET_KEY: "unit-secret",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "unit-public",
};
const primary = {
  id: "email-owner",
  emailAddress: "owner@example.com",
  verification: { status: "verified" },
};
const user = () => ({
  primaryEmailAddressId: primary.id,
  emailAddresses: [primary],
});
const request = () =>
  new Request("https://hub.example.com/api/owner", {
    headers: {
      Authorization: "Bearer fixture-session",
      Host: "attacker.example",
    },
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.client.mockReturnValue({
    authenticateRequest: mocks.authenticate,
    users: { getUser: mocks.user },
  });
  mocks.authenticate.mockResolvedValue({
    isAuthenticated: true,
    toAuth: () => ({ userId: "owner-id" }),
  });
  mocks.user.mockResolvedValue(user());
});
describe("Owner identity enforcement", () => {
  test("anonymous cookies do not authenticate a management request", async () => {
    expect(
      await createOwnerAuthorizer(env)(
        new Request("https://hub.example.com/api/owner", {
          headers: { cookie: "__session=untrusted" },
        }),
      ),
    ).toEqual({ signedIn: false, isOwner: false });
    expect(mocks.client).not.toHaveBeenCalled();
  });
  test("Owner requires an active verified primary email, never client roles or secondary address", () => {
    expect(verifiedOwnerEmail(user(), " OWNER@example.com ")).toBe(true);
    expect(
      verifiedOwnerEmail({ ...user(), banned: true }, env.HUB_OWNER_EMAIL),
    ).toBe(false);
    expect(
      verifiedOwnerEmail({ ...user(), locked: true }, env.HUB_OWNER_EMAIL),
    ).toBe(false);
    expect(
      verifiedOwnerEmail(
        { ...user(), primaryEmailAddressId: null },
        env.HUB_OWNER_EMAIL,
      ),
    ).toBe(false);
    expect(
      verifiedOwnerEmail(
        {
          ...user(),
          emailAddresses: [
            { ...primary, verification: { status: "unverified" } },
          ],
        },
        env.HUB_OWNER_EMAIL,
      ),
    ).toBe(false);
    expect(
      verifiedOwnerEmail(
        {
          primaryEmailAddressId: "reader",
          emailAddresses: [
            primary,
            { ...primary, id: "reader", emailAddress: "reader@example.com" },
          ],
        },
        env.HUB_OWNER_EMAIL,
      ),
    ).toBe(false);
    expect(verifiedOwnerEmail(user(), "")).toBe(false);
  });
  test("fetches live Clerk identity and returns trusted owner attribution", async () => {
    expect(await createOwnerAuthorizer(env)(request())).toEqual({
      signedIn: true,
      isOwner: true,
      actor: { userId: "owner-id", email: "owner@example.com" },
    });
    expect(mocks.user).toHaveBeenCalledWith("owner-id");
    expect(mocks.authenticate).toHaveBeenCalledWith(expect.any(Request), {
      authorizedParties: ["https://hub.example.com"],
      acceptsToken: "session_token",
    });
  });
  test("non-owner or unverified signed-in identities remain read-only", async () => {
    mocks.user.mockResolvedValue({
      ...user(),
      emailAddresses: [{ ...primary, emailAddress: "reader@example.com" }],
    });
    expect(await createOwnerAuthorizer(env)(request())).toEqual({
      signedIn: true,
      isOwner: false,
    });
    mocks.user.mockResolvedValue({
      ...user(),
      emailAddresses: [{ ...primary, verification: { status: "unverified" } }],
    });
    expect(await createOwnerAuthorizer(env)(request())).toEqual({
      signedIn: true,
      isOwner: false,
    });
  });
  test("bad credentials and rejected sessions cannot reach protected data", async () => {
    const authorize = createOwnerAuthorizer(env);
    await expect(
      authorize(
        new Request("https://hub.example.com", {
          headers: { Authorization: "Basic fixture" },
        }),
      ),
    ).rejects.toMatchObject({ status: 401 });
    mocks.authenticate.mockResolvedValue({
      isAuthenticated: false,
      toAuth: () => null,
    });
    await expect(authorize(request())).rejects.toMatchObject({ status: 401 });
    expect(mocks.user).not.toHaveBeenCalled();
    mocks.authenticate.mockResolvedValue({
      isAuthenticated: true,
      toAuth: () => null,
    });
    await expect(authorize(request())).rejects.toMatchObject({ status: 401 });
  });
  test("trusted origin comes from server config, with local origins only in development", () => {
    expect(authorizedOrigins(env)).toEqual(["https://hub.example.com"]);
    expect(authorizedOrigins({ ...env, NODE_ENV: "development" })).toContain(
      "http://127.0.0.1:4173",
    );
    expect(() =>
      authorizedOrigins({
        ...env,
        HUB_PUBLIC_ORIGIN: "https://hub.example.com/path",
      }),
    ).toThrow();
    expect(() =>
      authorizedOrigins({
        ...env,
        HUB_PUBLIC_ORIGIN: "http://hub.example.com",
      }),
    ).toThrow();
    expect(() => authorizedOrigins({})).toThrow();
  });
  test("configuration failures and Clerk outages fail closed", async () => {
    await expect(createOwnerAuthorizer({})(request())).rejects.toThrow(
      "not configured",
    );
    mocks.user.mockRejectedValue(new Error("private provider diagnostic"));
    await expect(createOwnerAuthorizer(env)(request())).rejects.toThrow();
  });
});
