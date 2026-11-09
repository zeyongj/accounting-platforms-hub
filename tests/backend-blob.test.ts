import { beforeEach, describe, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  Precondition: class extends Error {},
}));
vi.mock("@vercel/blob", () => ({
  get: mocks.get,
  put: mocks.put,
  BlobPreconditionFailedError: mocks.Precondition,
}));
import { createBlobCatalogStore, CATALOG_PATH } from "../server/blob-store";
import {
  INITIAL_REVISION,
  RevisionConflictError,
  type StoredCatalog,
} from "../server/catalog";
import { freshDefaultCatalog } from "../src/lib/default-catalog";
const catalog = freshDefaultCatalog();
const document: StoredCatalog = {
  schemaVersion: 1,
  updatedAt: null,
  catalog,
  history: [
    {
      id: "baseline",
      number: 1,
      createdAt: null,
      actor: null,
      action: "baseline",
      restoredFrom: null,
      catalog,
    },
  ],
};
function result(etag = '"v1"', body: unknown = document) {
  const text = JSON.stringify(body);
  return {
    statusCode: 200,
    stream: new Response(text).body!,
    blob: { size: new TextEncoder().encode(text).byteLength, etag },
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockImplementation(async () => result());
  mocks.put.mockResolvedValue({ etag: '"v2"' });
});
describe("private Blob catalog adapter", () => {
  test("reads a single identity representation so body and strong revision match atomically", async () => {
    const store = createBlobCatalogStore({ BLOB_STORE_ID: "store-fixture" });
    expect(await store.read()).toEqual({ document, revision: '"v1"' });
    expect(mocks.get).toHaveBeenCalledWith(CATALOG_PATH, {
      access: "private",
      storeId: "store-fixture",
      useCache: false,
      headers: { "accept-encoding": "identity" },
    });
  });
  test("uses server credentials without returning or persisting them", async () => {
    const store = createBlobCatalogStore({
      BLOB_READ_WRITE_TOKEN: "fixture-credential",
    });
    expect(JSON.stringify(await store.read())).not.toContain(
      "fixture-credential",
    );
    expect(mocks.get).toHaveBeenCalledWith(
      CATALOG_PATH,
      expect.objectContaining({
        token: "fixture-credential",
        access: "private",
      }),
    );
  });
  test("writes pass the exact strong ETag and map failed preconditions to conflicts", async () => {
    const store = createBlobCatalogStore({ BLOB_STORE_ID: "store-fixture" });
    expect(await store.write(document, '"v1"')).toBe('"v2"');
    expect(mocks.put).toHaveBeenCalledWith(
      CATALOG_PATH,
      JSON.stringify(document),
      expect.objectContaining({
        ifMatch: '"v1"',
        allowOverwrite: true,
        addRandomSuffix: false,
        access: "private",
      }),
    );
    mocks.put.mockRejectedValue(new mocks.Precondition());
    await expect(store.write(document, '"v1"')).rejects.toBeInstanceOf(
      RevisionConflictError,
    );
  });
  test.each(['W/"v1"', "v1", "", '"bad\netag"'])(
    "rejects weak or malformed read revision %s",
    async (etag) => {
      mocks.get.mockImplementation(async () => result(etag));
      await expect(
        createBlobCatalogStore({ BLOB_STORE_ID: "store-fixture" }).read(),
      ).rejects.toThrow();
      expect(mocks.put).not.toHaveBeenCalled();
    },
  );
  test.each(['W/"v1"', "v1", "", '"bad\netag"'])(
    "rejects unsafe write revision %s before any provider call",
    async (revision) => {
      await expect(
        createBlobCatalogStore({ BLOB_STORE_ID: "store-fixture" }).write(
          document,
          revision,
        ),
      ).rejects.toThrow();
      expect(mocks.put).not.toHaveBeenCalled();
    },
  );
  test("initialization is create-only and reports concurrent creation without overwrite", async () => {
    const store = createBlobCatalogStore({ BLOB_STORE_ID: "store-fixture" });
    expect(await store.write(document, INITIAL_REVISION)).toBe('"v2"');
    expect(mocks.put.mock.calls[0][2]).toMatchObject({ allowOverwrite: false });
    expect(mocks.put.mock.calls[0][2]).not.toHaveProperty("ifMatch");
    mocks.put.mockRejectedValue(new Error("already exists"));
    await expect(
      store.write(document, INITIAL_REVISION),
    ).rejects.toBeInstanceOf(RevisionConflictError);
  });
  test("an unknown write result never causes an unconditional retry", async () => {
    mocks.put.mockResolvedValue({ etag: 'W/"v2"' });
    const store = createBlobCatalogStore({ BLOB_STORE_ID: "store-fixture" });
    await expect(store.write(document, '"v1"')).rejects.toThrow();
    expect(mocks.put).toHaveBeenCalledTimes(1);
  });
  test("missing config, corrupt records and provider errors never fall back silently", async () => {
    await expect(createBlobCatalogStore({}).read()).rejects.toThrow(
      "not configured",
    );
    expect(mocks.get).not.toHaveBeenCalled();
    const store = createBlobCatalogStore({ BLOB_STORE_ID: "store-fixture" });
    mocks.get.mockResolvedValue(null);
    expect(await store.read()).toBeNull();
    mocks.put.mockRejectedValue(new Error("offline"));
    await expect(store.write(document, INITIAL_REVISION)).rejects.toThrow(
      "offline",
    );
    mocks.get.mockImplementation(async () =>
      result('"v1"', { ...document, history: [] }),
    );
    await expect(store.read()).rejects.toThrow();
  });
});
