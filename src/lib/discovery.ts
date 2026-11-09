import type { HubCatalog, HubTool, Language, LocalizedText } from "./types";

export type ToolSort = "recommended" | "name";

export function localized(text: LocalizedText, language: Language): string {
  return text[language].trim() || text.en.trim() || text.zh.trim();
}

export function displayTags(
  tags: readonly string[],
  language: Language,
): string[] {
  const uniqueTags = [
    ...new Set(tags.map((tag) => tag.trim()).filter(Boolean)),
  ];
  const hasHan = (tag: string) => /\p{Script=Han}/u.test(tag);
  const nonHanTags = uniqueTags.filter((tag) => !hasHan(tag));
  if (language === "en") return nonHanTags;

  const chineseTags = uniqueTags.filter(hasHan);
  if (!chineseTags.length) return nonHanTags;
  const technicalTags = nonHanTags.filter(
    (tag) =>
      ![...tag].some(
        (character) =>
          /\p{Script=Latin}/u.test(character) && /\p{Ll}/u.test(character),
      ),
  );
  return [...chineseTags, ...technicalTags];
}

function searchable(value: string): string {
  return value.normalize("NFKC").toLowerCase();
}

export function displayHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function readFavoriteIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return [
      ...new Set(
        parsed
          .slice(0, 500)
          .filter(
            (id): id is string =>
              typeof id === "string" && id.length > 0 && id.length <= 200,
          ),
      ),
    ];
  } catch {
    return [];
  }
}

export function readLanguage(raw: string | null): Language {
  return raw === "zh" ? "zh" : "en";
}

export interface DiscoveryOptions {
  query: string;
  categoryId: string | null;
  favoritesOnly: boolean;
  favoriteIds: readonly string[];
  sort: ToolSort;
  language: Language;
}

export function discoverTools(
  catalog: HubCatalog,
  options: DiscoveryOptions,
): HubTool[] {
  const tokens = searchable(options.query.trim()).split(/\s+/).filter(Boolean);
  const categories = new Map(
    catalog.categories.map((category) => [category.id, category]),
  );
  const favorites = new Set(options.favoriteIds);
  return catalog.tools
    .filter((tool) => {
      const category = categories.get(tool.categoryId);
      if (!tool.visible || !category) return false;
      if (options.categoryId && tool.categoryId !== options.categoryId)
        return false;
      if (options.favoritesOnly && !favorites.has(tool.id)) return false;
      const haystack = searchable(
        [
          tool.name.en,
          tool.name.zh,
          tool.description.en,
          tool.description.zh,
          tool.url,
          ...tool.tags,
          category.name.en,
          category.name.zh,
          category.description.en,
          category.description.zh,
        ].join(" "),
      );
      // Latin search uses word prefixes so "count" finds "Count" without also
      // matching every "accounts payable" category. Chinese and URLs keep useful
      // substring matching because they do not follow English word boundaries.
      const words = haystack.split(/[^\p{L}\p{N}]+/u);
      return tokens.every((token) =>
        /^[a-z0-9]+$/.test(token)
          ? words.some((word) => word.startsWith(token))
          : haystack.includes(token),
      );
    })
    .sort((left, right) => {
      if (options.sort === "name") {
        return (
          localized(left.name, options.language).localeCompare(
            localized(right.name, options.language),
            options.language === "zh" ? "zh-CN" : "en-CA",
          ) || left.id.localeCompare(right.id)
        );
      }
      return (
        Number(right.featured) - Number(left.featured) ||
        categories.get(left.categoryId)!.order -
          categories.get(right.categoryId)!.order ||
        left.order - right.order ||
        left.id.localeCompare(right.id)
      );
    });
}
