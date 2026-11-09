import { describe, expect, test, vi } from "vitest";
import {
  createHandlers,
  INITIAL_REVISION,
  HISTORY_LIMIT,
  MAX_REQUEST_BYTES,
  MAX_STORED_BYTES,
  RevisionConflictError,
  parseStoredCatalog,
  type CatalogStore,
  type StoredCatalog,
} from "../server/catalog";
import type { HubCatalog } from "../src/lib/types";
import { freshDefaultCatalog } from "../src/lib/default-catalog";
const now = new Date("2026-11-08T12:00:00Z");
const owner = async () => ({
  signedIn: true,
  isOwner: true,
  actor: { userId: "owner-test", email: "owner@example.com" },
});
const request = (body: unknown) =>
  new Request("https://hub.example.com/api/manage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
function memoryStore() {
  let current: { document: StoredCatalog; revision: string } | null = null;
  let counter = 0;
  const write = vi.fn(async (document: StoredCatalog, expected: string) => {
    if (expected !== (current?.revision ?? INITIAL_REVISION))
      throw new RevisionConflictError();
    current = {
      document: structuredClone(document),
      revision: `"v${++counter}"`,
    };
    return current.revision;
  });
  const store: CatalogStore = {
    read: async () => structuredClone(current),
    write,
  };
  return {
    store,
    write,
    current: () => structuredClone(current),
    corrupt: (document: StoredCatalog) => {
      current = { document, revision: '"corrupt"' };
    },
  };
}
const publicRequest = () => new Request("https://hub.example.com/api/catalog");
describe("shared catalog API", () => {
  test("initial public reads return safe defaults without writing or authorizing", async () => {
    const { store, write } = memoryStore();
    const authorize = vi.fn(owner);
    const api = createHandlers({ store, authorize });
    const response = await api.getCatalog(publicRequest());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toEqual({
      schemaVersion: 1,
      revision: "initial",
      updatedAt: null,
      ...freshDefaultCatalog(),
      tools: freshDefaultCatalog().tools.filter((tool) => tool.visible),
    });
    expect(write).not.toHaveBeenCalled();
    expect(authorize).not.toHaveBeenCalled();
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
  test.each([
    { signedIn: false, isOwner: false },
    { signedIn: true, isOwner: false },
    { signedIn: false, isOwner: true },
    { signedIn: true, isOwner: true },
  ])("management denies incomplete authorization %j", async (authorization) => {
    const { store, write } = memoryStore();
    const api = createHandlers({ store, authorize: async () => authorization });
    expect((await api.getManage(publicRequest())).status).toBe(
      authorization.signedIn ? 403 : 401,
    );
    expect(
      (
        await api.postManage(
          request({
            action: "publish",
            revision: "initial",
            catalog: freshDefaultCatalog(),
          }),
        )
      ).status,
    ).toBe(authorization.signedIn ? 403 : 401);
    expect(write).not.toHaveBeenCalled();
  });
  test("publishing is independently visible; hidden links and audit data stay private", async () => {
    const { store, current } = memoryStore();
    const api = createHandlers({
      store,
      authorize: owner,
      now: () => now,
      newId: () => "version-two",
    });
    const catalog = freshDefaultCatalog();
    catalog.tools[0].visible = false;
    catalog.tools[0].name.en = "hidden-private-name";
    const response = await api.postManage(
      request({
        action: "publish",
        revision: "initial",
        catalog,
        actor: { email: "spoof@example.com" },
        invoiceRows: ["private invoice"],
      }),
    );
    expect(response.status).toBe(200);
    const management = await response.json();
    expect(management.history[0].actor).toEqual({
      userId: "owner-test",
      email: "owner@example.com",
    });
    expect(management.current.tools.length).toBe(catalog.tools.length);
    expect(management.history).toHaveLength(2);
    const reader = createHandlers({
      store,
      authorize: async () => ({ signedIn: false, isOwner: false }),
    });
    const publicBody = await (await reader.getCatalog(publicRequest())).json();
    expect(Object.keys(publicBody).sort()).toEqual([
      "categories",
      "revision",
      "schemaVersion",
      "tools",
      "updatedAt",
    ]);
    expect(JSON.stringify(publicBody)).not.toMatch(
      /owner@example|history|hidden-private-name|spoof|invoiceRows/,
    );
    expect(publicBody.tools.length).toBe(catalog.tools.length - 1);
    expect(JSON.stringify(current())).not.toContain("private invoice");
  });
  test("empty published directories remain empty rather than reappearing as seeded tools", async () => {
    const { store } = memoryStore();
    const api = createHandlers({ store, authorize: owner, now: () => now });
    expect(
      (
        await api.postManage(
          request({
            action: "publish",
            revision: "initial",
            catalog: { categories: [], tools: [] },
          }),
        )
      ).status,
    ).toBe(200);
    expect(
      (await (await api.getCatalog(publicRequest())).json()).tools,
    ).toEqual([]);
  });
  test("restoring appends an attributed version and preserves previous history", async () => {
    const { store } = memoryStore();
    let id = 0;
    const api = createHandlers({
      store,
      authorize: owner,
      now: () => now,
      newId: () => `id-${++id}`,
    });
    const original = freshDefaultCatalog();
    const changed = structuredClone(original);
    changed.tools[0].name.en = "Changed tool";
    const published = await (
      await api.postManage(
        request({ action: "publish", revision: "initial", catalog: changed }),
      )
    ).json();
    const restored = await api.postManage(
      request({
        action: "restore",
        revision: published.current.revision,
        versionId: "baseline",
      }),
    );
    expect(restored.status).toBe(200);
    const result = await restored.json();
    expect(result.current.tools).toEqual(original.tools);
    expect(
      result.history.map((entry: { number: number }) => entry.number),
    ).toEqual([3, 2, 1]);
    expect(result.history[0]).toMatchObject({
      action: "restore",
      restoredFrom: "baseline",
      actor: { email: "owner@example.com" },
    });
    expect(
      (
        await api.postManage(
          request({
            action: "restore",
            revision: result.current.revision,
            versionId: result.history[0].id,
          }),
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await api.postManage(
          request({
            action: "restore",
            revision: result.current.revision,
            versionId: "missing",
          }),
        )
      ).status,
    ).toBe(422);
  });
  test.each([false, true])(
    "concurrent initialization/update retains exactly one winning write (%s)",
    async (initialized) => {
      const { store } = memoryStore();
      let id = 0;
      const api = createHandlers({
        store,
        authorize: owner,
        now: () => now,
        newId: () => `id-${++id}`,
      });
      let revision = "initial";
      if (initialized)
        revision = (
          await (
            await api.postManage(
              request({
                action: "publish",
                revision,
                catalog: freshDefaultCatalog(),
              }),
            )
          ).json()
        ).current.revision;
      const first = freshDefaultCatalog(),
        second = freshDefaultCatalog();
      first.tools[0].name.en = "First writer";
      second.tools[0].name.en = "Second writer";
      const responses = await Promise.all([
        api.postManage(
          request({ action: "publish", revision, catalog: first }),
        ),
        api.postManage(
          request({ action: "publish", revision, catalog: second }),
        ),
      ]);
      expect(responses.map((response) => response.status).sort()).toEqual([
        200, 409,
      ]);
      const winner = await responses
        .find((response) => response.status === 200)!
        .json();
      const actual = await (await api.getCatalog(publicRequest())).json();
      expect(actual.tools[0].name.en).toBe(winner.current.tools[0].name.en);
    },
  );
  test("request formats, limits and catalog integrity are enforced before storage", async () => {
    const { store, write } = memoryStore();
    const api = createHandlers({ store, authorize: owner });
    const invalid = freshDefaultCatalog();
    invalid.tools[0].url = "javascript:alert(1)";
    const cases: [Request, number][] = [
      [
        new Request("https://hub.example.com/api/manage", {
          method: "POST",
          body: "not JSON",
        }),
        415,
      ],
      [
        new Request("https://hub.example.com/api/manage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{",
        }),
        400,
      ],
      [
        new Request("https://hub.example.com/api/manage", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": String(MAX_REQUEST_BYTES + 1),
          },
          body: "{}",
        }),
        413,
      ],
      [
        new Request("https://hub.example.com/api/manage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: " ".repeat(MAX_REQUEST_BYTES + 1),
        }),
        413,
      ],
      [request({ action: "publish", catalog: freshDefaultCatalog() }), 400],
      [request({ action: "unsupported", revision: "initial" }), 400],
      [
        request({ action: "publish", revision: "initial", catalog: invalid }),
        422,
      ],
      [
        request({
          action: "publish",
          revision: '"outdated"',
          catalog: freshDefaultCatalog(),
        }),
        409,
      ],
    ];
    for (const [input, status] of cases)
      expect((await api.postManage(input)).status).toBe(status);
    expect(write).not.toHaveBeenCalled();
  });
  test("history count retention keeps newest complete versions with monotonic numbering", async () => {
    const { store } = memoryStore();
    let id = 0;
    const api = createHandlers({
      store,
      authorize: owner,
      now: () => now,
      newId: () => `id-${++id}`,
    });
    let revision = "initial";
    for (let i = 0; i < HISTORY_LIMIT + 2; i++) {
      const catalog = freshDefaultCatalog();
      catalog.tools[0].name.en = `Tool ${i}`;
      const result = await (
        await api.postManage(request({ action: "publish", revision, catalog }))
      ).json();
      revision = result.current.revision;
      expect(result.history.length).toBeLessThanOrEqual(HISTORY_LIMIT);
    }
    const result = await (await api.getManage(publicRequest())).json();
    expect(result.history).toHaveLength(HISTORY_LIMIT);
    expect(result.history[0].number).toBe(HISTORY_LIMIT + 3);
    expect(result.history.at(-1).number).toBe(4);
    expect(result.history[0].catalog.tools).toEqual(result.current.tools);
  });
  test("byte retention removes whole oldest versions and still permits future small saves", async () => {
    const { store, current } = memoryStore();
    let id = 0;
    const api = createHandlers({
      store,
      authorize: owner,
      now: () => now,
      newId: () => `large-${++id}`,
    });
    let revision = "initial";
    const catalog = freshDefaultCatalog();
    const template = structuredClone(catalog.tools[0]);
    catalog.tools = Array.from({ length: 200 }, (_, index) => ({
      ...structuredClone(template),
      id: `large-tool-${index}`,
      url: `https://example.com/${index}`,
      description: { en: "x".repeat(400), zh: "测".repeat(400) },
    }));
    for (let i = 0; i < 10; i++) {
      const result = await api.postManage(
        request({ action: "publish", revision, catalog }),
      );
      expect(result.status).toBe(200);
      revision = (await result.json()).current.revision;
    }
    expect(
      new TextEncoder().encode(JSON.stringify(current()?.document)).byteLength,
    ).toBeLessThanOrEqual(MAX_STORED_BYTES);
    expect(current()!.document.history.length).toBeLessThan(11);
    expect(
      (
        await api.postManage(
          request({
            action: "publish",
            revision,
            catalog: freshDefaultCatalog(),
          }),
        )
      ).status,
    ).toBe(200);
  });
  test("corrupt storage and provider failures fail closed without leaking secrets or resetting data", async () => {
    const reportFailure = vi.fn();
    const api = createHandlers({
      store: {
        read: async () => {
          throw new Error("token=do-not-expose");
        },
        write: vi.fn(),
      },
      authorize: owner,
      reportFailure,
    });
    const response = await api.getCatalog(publicRequest());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("do-not-expose");
    expect(reportFailure).toHaveBeenCalledWith("read-catalog");
    expect(() =>
      parseStoredCatalog({
        schemaVersion: 1,
        updatedAt: null,
        catalog: freshDefaultCatalog(),
        history: [],
      }),
    ).toThrow();
    const { store, corrupt } = memoryStore();
    corrupt({
      schemaVersion: 1,
      updatedAt: null,
      catalog: freshDefaultCatalog(),
      history: [
        {
          id: "baseline",
          number: 1,
          createdAt: null,
          actor: null,
          action: "baseline",
          restoredFrom: null,
          catalog: { categories: [], tools: [] },
        },
      ],
    });
    expect(
      (
        await createHandlers({ store, authorize: owner }).getCatalog(
          publicRequest(),
        )
      ).status,
    ).toBe(503);
  });
});
