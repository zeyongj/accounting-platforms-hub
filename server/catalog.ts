import { randomUUID } from "node:crypto";
import { cleanCatalog, CatalogValidationError } from "../src/lib/catalog.js";
import { freshDefaultCatalog } from "../src/lib/default-catalog.js";
import type {
  CatalogSnapshot,
  CatalogVersion,
  HubCatalog,
  ManagementSnapshot,
  OwnerActor,
  ValidationIssue,
} from "../src/lib/types.js";

export const INITIAL_REVISION = "initial";
export const MAX_REQUEST_BYTES = 1024 * 1024;
export const MAX_STORED_BYTES = 3 * MAX_REQUEST_BYTES;
export const HISTORY_LIMIT = 30;
export interface StoredCatalog {
  schemaVersion: 1;
  updatedAt: string | null;
  catalog: HubCatalog;
  history: CatalogVersion[];
}
export interface CatalogStore {
  read(): Promise<{ document: StoredCatalog; revision: string } | null>;
  write(document: StoredCatalog, expectedRevision: string): Promise<string>;
}
export interface OwnerAuthorization {
  signedIn: boolean;
  isOwner: boolean;
  actor?: OwnerActor;
}
export interface ApiDependencies {
  store: CatalogStore;
  authorize(request: Request): Promise<OwnerAuthorization>;
  now?: () => Date;
  newId?: () => string;
  reportFailure?: (operation: string) => void;
}
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly issues?: ValidationIssue[],
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export class RevisionConflictError extends Error {
  constructor() {
    super("The shared directory changed.");
    this.name = "RevisionConflictError";
  }
}
const record = (input: unknown): input is Record<string, unknown> =>
  Boolean(input && typeof input === "object" && !Array.isArray(input));
const timestamp = (input: unknown): input is string =>
  typeof input === "string" &&
  input.length <= 100 &&
  Number.isFinite(Date.parse(input));
function actor(input: unknown): OwnerActor {
  if (
    !record(input) ||
    typeof input.userId !== "string" ||
    !input.userId ||
    input.userId.length > 200 ||
    typeof input.email !== "string" ||
    !input.email.trim() ||
    input.email.length > 254
  )
    throw new Error("Invalid stored actor.");
  return { userId: input.userId, email: input.email.trim().toLowerCase() };
}
function version(input: unknown): CatalogVersion {
  if (
    !record(input) ||
    typeof input.id !== "string" ||
    !input.id ||
    input.id.length > 200 ||
    !Number.isSafeInteger(input.number) ||
    (input.number as number) < 1 ||
    !["baseline", "publish", "restore"].includes(input.action as string) ||
    (input.createdAt !== null && !timestamp(input.createdAt)) ||
    (input.restoredFrom !== null &&
      (typeof input.restoredFrom !== "string" ||
        !input.restoredFrom ||
        input.restoredFrom.length > 200))
  )
    throw new Error("Invalid stored catalog version.");
  if (
    (input.action === "baseline") !== (input.actor === null) ||
    (input.action === "restore") !== (input.restoredFrom !== null) ||
    (input.action !== "baseline" && input.createdAt === null)
  )
    throw new Error("Invalid stored version attribution.");
  return {
    id: input.id,
    number: input.number as number,
    createdAt: input.createdAt as string | null,
    actor: input.actor === null ? null : actor(input.actor),
    action: input.action as CatalogVersion["action"],
    restoredFrom: input.restoredFrom as string | null,
    catalog: cleanCatalog(input.catalog),
  };
}
export function parseStoredCatalog(input: unknown): StoredCatalog {
  if (
    !record(input) ||
    input.schemaVersion !== 1 ||
    (input.updatedAt !== null && !timestamp(input.updatedAt)) ||
    !Array.isArray(input.history) ||
    input.history.length < 1 ||
    input.history.length > HISTORY_LIMIT
  )
    throw new Error("Invalid stored catalog schema.");
  try {
    const catalog = cleanCatalog(input.catalog);
    const history = input.history.map(version);
    if (
      new Set(history.map((entry) => entry.id)).size !== history.length ||
      history.some(
        (entry, index) =>
          index > 0 && entry.number !== history[index - 1].number - 1,
      ) ||
      history[0].createdAt !== input.updatedAt ||
      JSON.stringify(history[0].catalog) !== JSON.stringify(catalog)
    )
      throw new Error("Invalid stored history sequence.");
    return {
      schemaVersion: 1,
      updatedAt: input.updatedAt as string | null,
      catalog,
      history,
    };
  } catch {
    throw new Error("Invalid stored catalog data.");
  }
}
interface CurrentCatalog {
  document: StoredCatalog;
  revision: string;
}
async function readCurrent(store: CatalogStore): Promise<CurrentCatalog> {
  const current = await store.read();
  if (current) {
    if (!current.revision || current.revision === INITIAL_REVISION)
      throw new Error("The stored catalog revision is missing.");
    return {
      revision: current.revision,
      document: parseStoredCatalog(current.document),
    };
  }
  const catalog = cleanCatalog(freshDefaultCatalog());
  return {
    revision: INITIAL_REVISION,
    document: {
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
    },
  };
}
function snapshot(
  current: CurrentCatalog,
  publicOnly: boolean,
): CatalogSnapshot {
  return {
    schemaVersion: 1,
    revision: current.revision,
    updatedAt: current.document.updatedAt,
    categories: current.document.catalog.categories,
    tools: publicOnly
      ? current.document.catalog.tools.filter((tool) => tool.visible)
      : current.document.catalog.tools,
  };
}
function management(current: CurrentCatalog): ManagementSnapshot {
  return {
    current: snapshot(current, false),
    history: current.document.history,
    historyLimit: HISTORY_LIMIT,
  };
}
function requireOwner(authorization: OwnerAuthorization): OwnerActor {
  if (!authorization.signedIn)
    throw new ApiError(
      401,
      "unauthorized",
      "Sign in as the Owner to continue.",
    );
  if (!authorization.isOwner || !authorization.actor)
    throw new ApiError(
      403,
      "forbidden",
      "Only the Owner can manage this directory.",
    );
  return actor(authorization.actor);
}
const responseHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};
const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: responseHeaders });

/** Read a bounded body before parsing JSON; arbitrary uploaded fields are never persisted. */
async function readJson(request: Request): Promise<unknown> {
  if (
    !/^application\/json(?:\s*;|$)/i.test(
      request.headers.get("content-type") ?? "",
    )
  )
    throw new ApiError(415, "unsupported_media_type", "Send application/json.");
  const declared = request.headers.get("content-length");
  if (
    declared &&
    /^\d+$/.test(declared) &&
    Number(declared) > MAX_REQUEST_BYTES
  )
    throw new ApiError(413, "payload_too_large", "The request exceeds 1 MiB.");
  if (!request.body)
    throw new ApiError(400, "invalid_request", "Send a JSON request body.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_REQUEST_BYTES) {
        await reader.cancel();
        throw new ApiError(
          413,
          "payload_too_large",
          "The request exceeds 1 MiB.",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new ApiError(400, "invalid_request", "Send valid UTF-8 JSON.");
  }
}

export function createHandlers(deps: ApiDependencies) {
  async function respond(operation: string, action: () => Promise<Response>) {
    try {
      return await action();
    } catch (error) {
      if (error instanceof RevisionConflictError)
        return json(
          {
            code: "revision_conflict",
            message:
              "The shared directory changed. Refresh and review the latest version before publishing.",
          },
          409,
        );
      if (error instanceof CatalogValidationError)
        return json(
          {
            code: "invalid_catalog",
            message: "Resolve the catalog validation issues before publishing.",
            issues: error.issues,
          },
          422,
        );
      if (error instanceof ApiError)
        return json(
          {
            code: error.code,
            message: error.message,
            ...(error.issues ? { issues: error.issues } : {}),
          },
          error.status,
        );
      deps.reportFailure?.(operation);
      return json(
        {
          code: "service_unavailable",
          message:
            "The directory service is temporarily unavailable. Please try again.",
        },
        503,
      );
    }
  }
  return {
    getCatalog: (_request: Request) =>
      respond("read-catalog", async () =>
        json(snapshot(await readCurrent(deps.store), true)),
      ),
    getOwner: (request: Request) =>
      respond("check-owner", async () => {
        const authorization = await deps.authorize(request);
        return json({
          isOwner: Boolean(
            authorization.signedIn &&
              authorization.isOwner &&
              authorization.actor,
          ),
        });
      }),
    getManage: (request: Request) =>
      respond("read-management", async () => {
        requireOwner(await deps.authorize(request));
        return json(management(await readCurrent(deps.store)));
      }),
    postManage: (request: Request) =>
      respond("publish-catalog", async () => {
        const editor = requireOwner(await deps.authorize(request));
        const input = await readJson(request);
        if (
          !record(input) ||
          typeof input.revision !== "string" ||
          !input.revision ||
          input.revision.length > 512
        )
          throw new ApiError(
            400,
            "invalid_request",
            "Send the current catalog revision.",
          );
        const current = await readCurrent(deps.store);
        if (input.revision !== current.revision)
          throw new RevisionConflictError();
        let catalog: HubCatalog;
        let action: "publish" | "restore";
        let restoredFrom: string | null = null;
        if (input.action === "publish") {
          catalog = cleanCatalog(input.catalog);
          action = "publish";
        } else if (input.action === "restore") {
          if (
            typeof input.versionId !== "string" ||
            !input.versionId ||
            input.versionId.length > 200
          )
            throw new ApiError(
              400,
              "invalid_request",
              "Choose a saved directory version.",
            );
          const target = current.document.history.find(
            (entry) => entry.id === input.versionId,
          );
          if (!target)
            throw new ApiError(
              422,
              "version_not_found",
              "This version is no longer available.",
            );
          if (target.id === current.document.history[0].id)
            throw new ApiError(
              422,
              "current_version",
              "This is already the current version.",
            );
          catalog = cleanCatalog(target.catalog);
          action = "restore";
          restoredFrom = target.id;
        } else
          throw new ApiError(
            400,
            "invalid_request",
            "Choose Publish or Restore.",
          );
        const now = (deps.now?.() ?? new Date()).toISOString();
        const entry: CatalogVersion = {
          id: deps.newId?.() ?? randomUUID(),
          number: current.document.history[0].number + 1,
          createdAt: now,
          actor: editor,
          action,
          restoredFrom,
          catalog,
        };
        const document: StoredCatalog = {
          schemaVersion: 1,
          updatedAt: now,
          catalog,
          history: [entry, ...current.document.history].slice(0, HISTORY_LIMIT),
        };
        let sanitized = parseStoredCatalog(document);
        while (
          new TextEncoder().encode(JSON.stringify(sanitized)).byteLength >
            MAX_STORED_BYTES &&
          sanitized.history.length > 1
        )
          sanitized.history.pop();
        if (
          new TextEncoder().encode(JSON.stringify(sanitized)).byteLength >
          MAX_STORED_BYTES
        )
          throw new ApiError(
            413,
            "payload_too_large",
            "The catalog exceeds the storage size limit.",
          );
        const revision = await deps.store.write(sanitized, current.revision);
        if (!revision || revision === INITIAL_REVISION)
          throw new Error("The new catalog revision is missing.");
        return json(management({ document: sanitized, revision }));
      }),
  };
}
