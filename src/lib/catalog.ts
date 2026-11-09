import type { HubCatalog, ValidationIssue } from "./types";

export const CATALOG_LIMITS = {
  tools: 200,
  categories: 30,
  name: 100,
  description: 400,
  tags: 12,
  tag: 40,
  url: 2048,
} as const;
export const TOOL_ICONS = [
  "search",
  "globe",
  "zap",
  "chart",
  "count",
  "building",
  "folder",
  "calculator",
  "file",
  "layers",
] as const;
export const CATEGORY_ACCENTS = ["blue", "teal", "violet", "amber"] as const;
const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
const record = (input: unknown): input is Record<string, unknown> =>
  Boolean(input && typeof input === "object" && !Array.isArray(input));
export class CatalogValidationError extends Error {
  constructor(public readonly issues: ValidationIssue[]) {
    super("The catalog has invalid fields.");
    this.name = "CatalogValidationError";
  }
}

/** Only web links to public hosts. This function never fetches or resolves a URL. */
export function canonicalToolUrl(input: string): string {
  if (
    typeof input !== "string" ||
    input.trim().length > CATALOG_LIMITS.url ||
    /[\u0000-\u0020\u007f]/.test(input.trim())
  )
    throw new Error("Enter a valid web URL.");
  const url = new URL(input.trim());
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("Use an HTTP or HTTPS URL without credentials.");
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    !host.includes(".") ||
    host === "localhost" ||
    /\.(localhost|local|internal|lan|home|test|invalid)$/.test(host) ||
    host.startsWith("[") ||
    host.includes(":")
  )
    throw new Error("Use a public website address.");
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const [a, b, c] = host.split(".").map(Number);
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    )
      throw new Error(
        "Private and reserved network addresses are not supported.",
      );
  }
  url.hostname = host;
  return url.href;
}

export function validateCatalog(input: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const issue = (path: string, message: string) => {
    if (issues.length < 100) issues.push({ path, message });
  };
  if (!record(input))
    return [{ path: "catalog", message: "Choose a valid catalog object." }];
  if (!Array.isArray(input.categories) || !Array.isArray(input.tools))
    return [
      {
        path: "catalog",
        message: "The catalog needs categories and tools arrays.",
      },
    ];
  if (input.categories.length > CATALOG_LIMITS.categories)
    issue("categories", `Use at most ${CATALOG_LIMITS.categories} categories.`);
  if (input.tools.length > CATALOG_LIMITS.tools)
    issue("tools", `Use at most ${CATALOG_LIMITS.tools} tools.`);
  const text = (
    value: unknown,
    path: string,
    max: number,
    required = false,
  ) => {
    if (
      typeof value !== "string" ||
      value.trim().length > max ||
      (required && !value.trim()) ||
      (typeof value === "string" &&
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))
    )
      issue(
        path,
        required
          ? `Enter text between 1 and ${max} characters.`
          : `Use text of at most ${max} characters.`,
      );
  };
  const localized = (
    value: unknown,
    path: string,
    max: number,
    required: boolean,
  ) => {
    if (!record(value)) {
      issue(path, "Provide English and Chinese text fields.");
      return;
    }
    text(value.en, `${path}.en`, max, required);
    text(value.zh, `${path}.zh`, max);
  };
  const ids = new Set<string>();
  const base = (item: Record<string, unknown>, path: string) => {
    if (typeof item.id !== "string" || !idPattern.test(item.id))
      issue(
        `${path}.id`,
        "Use a unique ID with letters, numbers, hyphens or underscores (up to 80 characters).",
      );
    else if (ids.has(item.id))
      issue(`${path}.id`, "IDs must be unique across tools and categories.");
    else ids.add(item.id);
    localized(item.name, `${path}.name`, CATALOG_LIMITS.name, true);
    localized(
      item.description,
      `${path}.description`,
      CATALOG_LIMITS.description,
      false,
    );
    if (!TOOL_ICONS.includes(item.icon as (typeof TOOL_ICONS)[number]))
      issue(`${path}.icon`, "Choose a supported icon.");
    if (
      !Number.isSafeInteger(item.order) ||
      (item.order as number) < 0 ||
      (item.order as number) > 9999
    )
      issue(`${path}.order`, "Order must be a whole number from 0 to 9999.");
  };
  const categoryIds = new Set<string>();
  input.categories
    .slice(0, CATALOG_LIMITS.categories + 1)
    .forEach((item, index) => {
      const path = `categories.${index}`;
      if (!record(item)) {
        issue(path, "Choose a valid category object.");
        return;
      }
      base(item, path);
      if (typeof item.id === "string") categoryIds.add(item.id);
      if (
        !CATEGORY_ACCENTS.includes(
          item.accent as (typeof CATEGORY_ACCENTS)[number],
        )
      )
        issue(`${path}.accent`, "Choose a supported accent color.");
    });
  const urls = new Set<string>();
  input.tools.slice(0, CATALOG_LIMITS.tools + 1).forEach((item, index) => {
    const path = `tools.${index}`;
    if (!record(item)) {
      issue(path, "Choose a valid tool object.");
      return;
    }
    base(item, path);
    if (
      typeof item.categoryId !== "string" ||
      !categoryIds.has(item.categoryId)
    )
      issue(
        `${path}.categoryId`,
        "Choose an existing category. Move or remove its tools before deleting a category.",
      );
    if (typeof item.url !== "string")
      issue(`${path}.url`, "Enter an HTTP or HTTPS website URL.");
    else
      try {
        const url = canonicalToolUrl(item.url);
        if (urls.has(url))
          issue(
            `${path}.url`,
            "This website URL is already used by another tool.",
          );
        else urls.add(url);
      } catch {
        issue(
          `${path}.url`,
          "Use a public HTTP or HTTPS URL without embedded credentials or private network addresses.",
        );
      }
    if (!Array.isArray(item.tags) || item.tags.length > CATALOG_LIMITS.tags)
      issue(`${path}.tags`, `Use at most ${CATALOG_LIMITS.tags} tags.`);
    else
      item.tags.forEach((tag, index) =>
        text(tag, `${path}.tags.${index}`, CATALOG_LIMITS.tag, true),
      );
    if (typeof item.featured !== "boolean")
      issue(`${path}.featured`, "Choose a featured setting.");
    if (typeof item.visible !== "boolean")
      issue(`${path}.visible`, "Choose a visibility setting.");
    if (item.status !== "active" && item.status !== "maintenance")
      issue(`${path}.status`, "Choose Active or Maintenance.");
  });
  return issues;
}

/** Persist only catalog fields. Importing JSON cannot store arbitrary private data. */
export function cleanCatalog(input: unknown): HubCatalog {
  const issues = validateCatalog(input);
  if (issues.length) throw new CatalogValidationError(issues);
  const catalog = input as HubCatalog;
  const localize = (value: { en: string; zh: string }) => ({
    en: value.en.trim(),
    zh: value.zh.trim(),
  });
  return {
    categories: catalog.categories.map((category) => ({
      id: category.id,
      name: localize(category.name),
      description: localize(category.description),
      icon: category.icon,
      accent: category.accent,
      order: category.order,
    })),
    tools: catalog.tools.map((tool) => ({
      id: tool.id,
      name: localize(tool.name),
      description: localize(tool.description),
      url: canonicalToolUrl(tool.url),
      categoryId: tool.categoryId,
      tags: [...new Set(tool.tags.map((tag) => tag.trim()))],
      icon: tool.icon,
      featured: tool.featured,
      visible: tool.visible,
      status: tool.status,
      order: tool.order,
    })),
  };
}
