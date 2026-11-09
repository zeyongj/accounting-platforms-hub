import { createHandlers } from "./catalog.js";
import { createBlobCatalogStore } from "./blob-store.js";
import { createOwnerAuthorizer } from "./owner.js";
export function productionHandlers() {
  return createHandlers({
    store: createBlobCatalogStore(),
    authorize: createOwnerAuthorizer(),
    reportFailure: (operation) =>
      console.error(`[Accounting Platforms Hub] ${operation} failed.`),
  });
}
