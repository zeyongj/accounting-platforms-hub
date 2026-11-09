import { describe, expect, test } from "vitest";
import {
  discoverTools,
  displayHost,
  localized,
  readFavoriteIds,
  readLanguage,
  type DiscoveryOptions,
} from "../src/lib/discovery";
import type { HubCatalog, HubTool } from "../src/lib/types";

const tool = (id: string, overrides: Partial<HubTool> = {}): HubTool => ({
  id,
  name: { en: id, zh: "" },
  description: { en: "A useful platform", zh: "工具平台" },
  url: `https://${id}.example.test/`,
  categoryId: "ap",
  tags: [],
  icon: "file",
  featured: false,
  visible: true,
  status: "active",
  order: 0,
  ...overrides,
});
const catalog: HubCatalog = {
  categories: [
    {
      id: "global",
      name: { en: "Global Scope", zh: "全局工具" },
      description: { en: "Project information", zh: "项目信息" },
      icon: "globe",
      accent: "violet",
      order: 0,
    },
    {
      id: "ap",
      name: { en: "AP Tools", zh: "应付账款工具" },
      description: { en: "Accounts payable", zh: "发票与账款" },
      icon: "file",
      accent: "blue",
      order: 1,
    },
  ],
  tools: [
    tool("hydro", {
      name: { en: "BC Hydro Extractor", zh: "电费提取" },
      description: { en: "Extract bill details", zh: "提取电费账单" },
      tags: ["PDF", "Utility"],
      order: 2,
    }),
    tool("count", { name: { en: "AP Count Tool", zh: "发票统计" }, order: 1 }),
    tool("projects", {
      categoryId: "global",
      name: { en: "Project Search Platform", zh: "项目查询" },
      featured: true,
    }),
    tool("hidden", { visible: false, featured: true }),
  ],
};
const base: DiscoveryOptions = {
  query: "",
  categoryId: null,
  favoritesOnly: false,
  favoriteIds: [],
  sort: "recommended",
  language: "en",
};

describe("tool discovery", () => {
  test("matches English, Chinese, tags, URL and category fields independent of current language", () => {
    for (const query of [
      "HYDRO",
      "电费",
      "pdf",
      "hydro.example.test",
      "Utility",
      "账款 pdf",
    ]) {
      expect(
        discoverTools(catalog, { ...base, query }).map((item) => item.id),
      ).toEqual(["hydro"]);
    }
    expect(
      discoverTools(catalog, { ...base, query: "project", language: "zh" }).map(
        (item) => item.id,
      ),
    ).toEqual(["projects"]);
    expect(
      discoverTools(catalog, { ...base, query: "count" }).map(
        (item) => item.id,
      ),
    ).toEqual(["count"]);
  });
  test("search tokens use AND semantics and normalize full-width Latin text", () => {
    expect(
      discoverTools(catalog, { ...base, query: "ＢＣ　ＰＤＦ" }).map(
        (item) => item.id,
      ),
    ).toEqual(["hydro"]);
    expect(discoverTools(catalog, { ...base, query: "hydro count" })).toEqual(
      [],
    );
  });
  test("category, favorites and query intersect without changing the stored favorite IDs", () => {
    const favoriteIds = ["hydro", "projects", "hidden", "previously-removed"];
    expect(
      discoverTools(catalog, {
        ...base,
        categoryId: "ap",
        favoritesOnly: true,
        favoriteIds,
        query: "utility",
      }).map((item) => item.id),
    ).toEqual(["hydro"]);
    expect(favoriteIds).toEqual([
      "hydro",
      "projects",
      "hidden",
      "previously-removed",
    ]);
  });
  test("hidden and dangling-category tools never appear in results", () => {
    expect(
      discoverTools(
        {
          ...catalog,
          tools: [...catalog.tools, tool("orphan", { categoryId: "missing" })],
        },
        base,
      ).map((item) => item.id),
    ).toEqual(["projects", "count", "hydro"]);
  });
  test("configured order is deterministic and alphabetical sort uses displayed localized names", () => {
    expect(discoverTools(catalog, base).map((item) => item.id)).toEqual([
      "projects",
      "count",
      "hydro",
    ]);
    expect(
      discoverTools(catalog, { ...base, sort: "name" }).map((item) => item.id),
    ).toEqual(["count", "hydro", "projects"]);
    expect(catalog.tools[0].id).toBe("hydro");
  });
  test("a category with no matching visible tools has empty results", () => {
    expect(
      discoverTools(catalog, { ...base, categoryId: "not-present" }),
    ).toEqual([]);
  });
});

describe("browser preference decoding", () => {
  test("favorites tolerate malformed or unrelated storage and deduplicate bounded IDs", () => {
    for (const raw of [null, "{", '"hydro"', '{"hydro":true}', "null"])
      expect(readFavoriteIds(raw)).toEqual([]);
    expect(
      readFavoriteIds(
        JSON.stringify([
          "hydro",
          "hydro",
          "",
          null,
          1,
          "projects",
          "x".repeat(201),
        ]),
      ),
    ).toEqual(["hydro", "projects"]);
    expect(
      readFavoriteIds(
        JSON.stringify(
          Array.from({ length: 600 }, (_, index) => `id-${index}`),
        ),
      ),
    ).toHaveLength(500);
  });
  test("English is the default, with explicit Chinese preference supported", () => {
    expect(readLanguage(null)).toBe("en");
    expect(readLanguage("invalid")).toBe("en");
    expect(readLanguage("zh")).toBe("zh");
    expect(localized({ en: "Project search", zh: "" }, "zh")).toBe(
      "Project search",
    );
  });
  test("displaying the destination host does not execute or fetch URLs", () => {
    expect(displayHost("https://www.example.com/path?q=1")).toBe("example.com");
    expect(displayHost("invalid")).toBe("");
  });
});
