import { BlobPreconditionFailedError, get, put } from "@vercel/blob";
import {
  INITIAL_REVISION,
  MAX_STORED_BYTES,
  parseStoredCatalog,
  RevisionConflictError,
  type CatalogStore,
  type StoredCatalog,
} from "./catalog.js";
export const CATALOG_PATH = "platform-hub/catalog-v1.json";
export function isStrongETag(value: string): boolean {
  return /^"[\x21\x23-\x7e\x80-\xff]+"$/.test(value);
}
export function createBlobCatalogStore(
  env: NodeJS.ProcessEnv = process.env,
): CatalogStore {
  function options() {
    if (env.BLOB_READ_WRITE_TOKEN)
      return { token: env.BLOB_READ_WRITE_TOKEN, access: "private" as const };
    if (env.BLOB_STORE_ID)
      return { storeId: env.BLOB_STORE_ID, access: "private" as const };
    throw new Error("The private catalog store is not configured.");
  }
  async function read() {
    const result = await get(CATALOG_PATH, {
      ...options(),
      useCache: false,
      headers: { "accept-encoding": "identity" },
    });
    if (!result) return null;
    if (
      result.statusCode !== 200 ||
      result.blob.size > MAX_STORED_BYTES ||
      !isStrongETag(result.blob.etag)
    )
      throw new Error("Unexpected catalog storage response.");
    const text = await new Response(result.stream).text();
    if (new TextEncoder().encode(text).byteLength > MAX_STORED_BYTES)
      throw new Error("The stored catalog is too large.");
    return {
      document: parseStoredCatalog(JSON.parse(text)),
      revision: result.blob.etag,
    };
  }
  async function write(document: StoredCatalog, expectedRevision: string) {
    const initial = expectedRevision === INITIAL_REVISION;
    if (!initial && !isStrongETag(expectedRevision))
      throw new Error("A strong storage revision is required.");
    try {
      const result = await put(CATALOG_PATH, JSON.stringify(document), {
        ...options(),
        contentType: "application/json",
        addRandomSuffix: false,
        allowOverwrite: !initial,
        ...(initial ? {} : { ifMatch: expectedRevision }),
      });
      if (!isStrongETag(result.etag))
        throw new Error("The new storage revision is invalid.");
      return result.etag;
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError)
        throw new RevisionConflictError();
      if (initial) {
        try {
          if (await read()) throw new RevisionConflictError();
        } catch (readError) {
          if (readError instanceof RevisionConflictError) throw readError;
        }
      }
      throw error;
    }
  }
  return { read, write };
}
