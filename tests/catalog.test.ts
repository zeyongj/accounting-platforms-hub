import { describe, expect, test } from "vitest";
import {
  canonicalToolUrl,
  cleanCatalog,
  validateCatalog,
  CatalogValidationError,
  CATALOG_LIMITS,
} from "../src/lib/catalog";
import type { HubCatalog } from "../src/lib/types";
export function fixtureCatalog(): HubCatalog {
  return {
    categories: [
      {
        id: "category-one",
        name: { en: "Accounts payable", zh: "应付账款" },
        description: { en: "", zh: "" },
        icon: "folder",
        accent: "blue",
        order: 0,
      },
    ],
    tools: [
      {
        id: "tool-one",
        name: { en: "Invoice tool", zh: "发票工具" },
        description: { en: "Count invoices", zh: "统计发票" },
        url: "https://example.com/",
        categoryId: "category-one",
        tags: ["AP", "Invoice"],
        icon: "count",
        featured: true,
        visible: true,
        status: "active",
        order: 0,
      },
    ],
  };
}
describe("catalog validation and safe links", () => {
  test("accepts bilingual fields, optional Chinese/description and empty directories", () => {
    expect(validateCatalog(fixtureCatalog())).toEqual([]);
    const catalog = fixtureCatalog();
    catalog.tools[0].name.zh = "";
    catalog.tools[0].description = { en: "", zh: "" };
    expect(validateCatalog(catalog)).toEqual([]);
    expect(cleanCatalog({ categories: [], tools: [] })).toEqual({
      categories: [],
      tools: [],
    });
  });
  test.each([
    "javascript:alert(1)",
    "data:text/html,<script>",
    "file:///etc/passwd",
    "https://user:password@example.com/",
    "http://localhost/",
    "https://app.local/",
    "http://127.0.0.1/",
    "http://127.1/",
    "http://2130706433/",
    "http://0x7f000001/",
    "http://10.2.3.4/",
    "http://100.64.0.1/",
    "http://169.254.169.254/",
    "http://172.16.0.1/",
    "https://192.168.1.2/",
    "http://198.18.0.1/",
    "http://224.0.0.1/",
    "http://[::1]/",
    "https://example.com/\nheader",
  ])("rejects unsafe or private URL %s", (url) => {
    expect(() => canonicalToolUrl(url)).toThrow();
    const catalog = fixtureCatalog();
    catalog.tools[0].url = url;
    expect(
      validateCatalog(catalog).some((issue) => issue.path === "tools.0.url"),
    ).toBe(true);
  });
  test("normalizes public URLs without rewriting queries or hash routes", () => {
    expect(canonicalToolUrl(" HTTPS://EXAMPLE.COM:443 ")).toBe(
      "https://example.com/",
    );
    expect(canonicalToolUrl("https://example.com/#calculator")).toBe(
      "https://example.com/#calculator",
    );
    expect(canonicalToolUrl("http://8.8.8.8/tool?x=1")).toBe(
      "http://8.8.8.8/tool?x=1",
    );
  });
  test("duplicate normalized URLs and dangling category references cannot be published", () => {
    const catalog = fixtureCatalog();
    catalog.tools.push({
      ...structuredClone(catalog.tools[0]),
      id: "tool-two",
      url: "HTTPS://EXAMPLE.COM:443",
    });
    expect(
      validateCatalog(catalog).some((issue) => issue.path === "tools.1.url"),
    ).toBe(true);
    catalog.tools.pop();
    catalog.categories = [];
    expect(
      validateCatalog(catalog).some(
        (issue) => issue.path === "tools.0.categoryId",
      ),
    ).toBe(true);
  });
  test("IDs are unique across the whole directory and enums/text/order are bounded", () => {
    const catalog = fixtureCatalog();
    catalog.tools[0].id = catalog.categories[0].id;
    catalog.tools[0].name.en = " ";
    catalog.tools[0].order = -1;
    (catalog.tools[0] as unknown as { icon: string }).icon = "<script>";
    const issues = validateCatalog(catalog);
    expect(issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining([
        "tools.0.id",
        "tools.0.name.en",
        "tools.0.order",
        "tools.0.icon",
      ]),
    );
    expect(() => cleanCatalog(catalog)).toThrow(CatalogValidationError);
    expect(validateCatalog(null)).not.toHaveLength(0);
    expect(validateCatalog({ tools: null, categories: [] })).not.toHaveLength(
      0,
    );
  });
  test("over-limit input is rejected and errors are capped for predictable responses", () => {
    const catalog = fixtureCatalog();
    catalog.tools = Array.from(
      { length: CATALOG_LIMITS.tools + 1 },
      (_, index) => ({
        ...structuredClone(catalog.tools[0]),
        id: `tool-${index}`,
        url: `https://example.com/${index}`,
      }),
    );
    expect(
      validateCatalog(catalog).some((issue) => issue.path === "tools"),
    ).toBe(true);
    expect(
      validateCatalog({
        categories: Array(1000).fill({}),
        tools: Array(1000).fill({}),
      }).length,
    ).toBeLessThanOrEqual(100);
  });
  test("cleaning trims text, deduplicates tags and drops arbitrary imported data", () => {
    const input = fixtureCatalog() as HubCatalog & { privateData?: string };
    input.privateData = "secret";
    Object.assign(input.tools[0], {
      invoiceRows: ["private"],
      name: { en: " Tool ", zh: " 工具 " },
      tags: [" AP ", "AP"],
    });
    const clean = cleanCatalog(input);
    expect(clean.tools[0].name).toEqual({ en: "Tool", zh: "工具" });
    expect(clean.tools[0].tags).toEqual(["AP"]);
    expect(JSON.stringify(clean)).not.toContain("private");
    expect(JSON.stringify(clean)).not.toContain("secret");
  });
});
