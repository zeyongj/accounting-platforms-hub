import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Check,
  ChevronDown,
  Cloud,
  Copy,
  Layers3,
  LayoutGrid,
  LoaderCircle,
  Search,
  SearchX,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  X,
} from "lucide-react";
import OwnerAccess from "./components/OwnerAccess";
import ToolIcon from "./components/ToolIcon";
import { validateCatalog } from "./lib/catalog";
import {
  discoverTools,
  displayHost,
  localized,
  readFavoriteIds,
  readLanguage,
  type ToolSort,
} from "./lib/discovery";
import type {
  CatalogSnapshot,
  HubTool,
  Language,
  ToolCategory,
} from "./lib/types";
import "./styles.css";

const LANGUAGE_KEY = "platform-hub:language:v1";
const FAVORITES_KEY = "platform-hub:favorites:v1";
const strings = {
  en: {
    language: "Language",
    shared: "Shared directory",
    eyebrow: "YOUR WORKSPACE, CONNECTED",
    title: "Your tools.",
    titleAccent: "One place.",
    intro:
      "A clear starting point for the platforms you use. Find the right tool and get straight to work.",
    tools: "platforms",
    categories: "categories",
    atAGlance: "ONE CONNECTED WORKSPACE",
    summaryTitle: "Less searching. More doing.",
    summaryDescription:
      "Project information, accounts payable, and property management — together in one directory.",
    search: "Search tools",
    searchPlaceholder: "Find a tool, task, or keyword…",
    searchHint: "Search names, descriptions, and tags in English or Chinese.",
    shortcut: "Press / to search",
    clearSearch: "Clear search",
    categoryFilter: "Browse categories",
    all: "All tools",
    favorites: "Favorites",
    explore: "Explore platforms",
    results: "tools found",
    result: "tool found",
    sort: "Sort tools",
    recommended: "Recommended",
    alphabetical: "Name A–Z",
    reset: "Reset filters",
    loading: "Loading your directory…",
    loadError: "The directory could not be loaded.",
    loadErrorDetail: "Please try again to fetch the shared tool list.",
    stale:
      "The latest directory could not be loaded. You are viewing the last loaded version.",
    retry: "Try again",
    refresh: "Refresh directory",
    noResults: "No tools found",
    noResultsDescription: "Try another keyword or choose a different category.",
    noFavorites: "Keep your go-to tools close.",
    noFavoritesDescription:
      "Select the bookmark on any tool to add it here. Favorites are saved in this browser.",
    emptyDirectory: "Your directory is ready for its first tool.",
    emptyDirectoryDescription:
      "The Owner can add tools through Manage directory.",
    featured: "Featured",
    maintenance: "Maintenance",
    open: "Open platform",
    newTab: "opens in a new tab",
    favorite: "Add to favorites",
    unfavorite: "Remove from favorites",
    copy: "Copy link",
    copied: "Link copied.",
    copyFailed:
      "The link could not be copied. You can copy it from the platform link’s menu.",
    favoriteStorageFailed:
      "Favorites are available for this visit, but your browser could not save them.",
    localFavorites: "Favorites stay in this browser",
    about: "About this hub",
    aboutIntro: "One shared directory, with shortcuts that feel personal.",
    aboutSearch:
      "Browse a category or search across English and Chinese names, descriptions, and tags. Each platform opens in a new tab.",
    aboutFavorites:
      "Bookmarks and your language preference are stored only in this browser. The directory is shared; your favorites are personal.",
    aboutOwner:
      "Only the verified Owner can publish tools and categories, mark maintenance, or restore directory versions. Maintenance labels are set by the Owner, not a live uptime check.",
    aboutPrivacy:
      "This hub does not record searches or platform launches. Hosting and sign-in providers may process service and security metadata; linked platforms have their own sign-in and data handling.",
    updated: "Directory updated",
    initial: "Original directory",
    copyright: "All rights reserved.",
    privacy: "No usage analytics",
    moreTags: "more tags",
    clearCategory: "Show all categories",
    filteredCategory: "Category",
    authUnavailable: "Owner sign-in is temporarily unavailable.",
  },
  zh: {
    language: "语言",
    shared: "共享工具目录",
    eyebrow: "连接你的日常工作",
    title: "常用工具，",
    titleAccent: "一站直达。",
    intro: "从这里找到所需平台，让项目查询、账款处理和物业管理更加顺手。",
    tools: "个平台",
    categories: "个分类",
    atAGlance: "一个入口，连接工作所需",
    summaryTitle: "少一点查找，多一点专注。",
    summaryDescription:
      "项目资料、应付账款与物业管理工具，集中在同一个导航目录中。",
    search: "搜索工具",
    searchPlaceholder: "搜索工具、工作内容或关键词…",
    searchHint: "可搜索中英文名称、介绍与标签。",
    shortcut: "按 / 搜索",
    clearSearch: "清除搜索",
    categoryFilter: "浏览分类",
    all: "全部工具",
    favorites: "我的收藏",
    explore: "浏览平台",
    results: "个匹配工具",
    result: "个匹配工具",
    sort: "工具排序",
    recommended: "推荐顺序",
    alphabetical: "按名称排序",
    reset: "重置筛选",
    loading: "正在载入工具目录…",
    loadError: "暂时无法载入工具目录。",
    loadErrorDetail: "请重试，以获取最新的共享工具列表。",
    stale: "无法获取最新目录，现显示上次成功载入的版本。",
    retry: "重试",
    refresh: "刷新目录",
    noResults: "没有找到匹配工具",
    noResultsDescription: "试试其他关键词，或切换到不同分类。",
    noFavorites: "将常用工具收藏在这里。",
    noFavoritesDescription:
      "点击工具上的书签图标即可收藏，收藏保存在当前浏览器中。",
    emptyDirectory: "目录已就绪，等待添加第一个工具。",
    emptyDirectoryDescription: "Owner 可在“管理目录”中添加工具。",
    featured: "精选",
    maintenance: "维护中",
    open: "打开平台",
    newTab: "在新标签页打开",
    favorite: "添加收藏",
    unfavorite: "取消收藏",
    copy: "复制链接",
    copied: "链接已复制。",
    copyFailed: "无法复制链接，你可以通过平台链接的菜单手动复制。",
    favoriteStorageFailed: "收藏在本次访问中可用，但浏览器无法保存这些设置。",
    localFavorites: "收藏仅保存在当前浏览器",
    about: "关于此导航页",
    aboutIntro: "共享同一个工具目录，保留自己的使用习惯。",
    aboutSearch:
      "选择分类，或搜索中英文名称、介绍和标签。每个平台都会在新的标签页打开。",
    aboutFavorites:
      "收藏和语言偏好仅保存在当前浏览器。工具目录由所有访客共享，收藏列表只属于你。",
    aboutOwner:
      "只有经过验证的 Owner 可以发布工具和分类、标记维护状态，以及恢复目录版本。维护状态由 Owner 设置，并非实时运行检测。",
    aboutPrivacy:
      "本导航页不记录搜索内容或平台打开操作。托管和登录服务提供商可能处理服务与安全元数据；各个链接平台有各自的登录方式与数据处理规则。",
    updated: "目录更新于",
    initial: "初始目录",
    copyright: "保留所有权利。",
    privacy: "无使用分析",
    moreTags: "个其他标签",
    clearCategory: "显示全部分类",
    filteredCategory: "分类",
    authUnavailable: "Owner 登录服务暂不可用。",
  },
};
type Feedback = "copied" | "copyFailed" | "favoriteStorageFailed";

function storedValue(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function storeValue(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
function checkedSnapshot(value: unknown): CatalogSnapshot {
  if (!value || typeof value !== "object") throw new Error("invalid_catalog");
  const candidate = value as CatalogSnapshot;
  if (
    candidate.schemaVersion !== 1 ||
    typeof candidate.revision !== "string" ||
    !candidate.revision ||
    (candidate.updatedAt !== null &&
      (typeof candidate.updatedAt !== "string" ||
        !Number.isFinite(Date.parse(candidate.updatedAt)))) ||
    validateCatalog({
      categories: candidate.categories,
      tools: candidate.tools,
    }).length
  )
    throw new Error("invalid_catalog");
  return candidate;
}

function ToolCard({
  tool,
  category,
  language,
  favorite,
  onFavorite,
  onCopy,
}: {
  tool: HubTool;
  category: ToolCategory;
  language: Language;
  favorite: boolean;
  onFavorite: () => void;
  onCopy: () => void;
}) {
  const t = strings[language];
  const name = localized(tool.name, language);
  return (
    <article
      className={`tool-card accent-${category.accent}${tool.featured ? " is-featured" : ""}`}
    >
      <div className="tool-card-top">
        <span className="category-label">
          <ToolIcon name={category.icon} />
          {localized(category.name, language)}
        </span>
        <button
          type="button"
          className={`favorite-button${favorite ? " is-saved" : ""}`}
          aria-label={`${favorite ? t.unfavorite : t.favorite}: ${name}`}
          aria-pressed={favorite}
          title={favorite ? t.unfavorite : t.favorite}
          onClick={onFavorite}
        >
          <Bookmark
            aria-hidden="true"
            fill={favorite ? "currentColor" : "none"}
          />
        </button>
      </div>
      <div className="tool-card-main">
        <span className="tool-icon">
          <ToolIcon name={tool.icon} />
        </span>
        <div>
          <div className="tool-title-line">
            <h3>{name}</h3>
            {tool.featured ? (
              <span className="featured-label">
                <Star aria-hidden="true" />
                {t.featured}
              </span>
            ) : null}
          </div>
          <p>{localized(tool.description, language)}</p>
        </div>
      </div>
      <div className="tool-tags">
        {tool.tags.slice(0, 3).map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
        {tool.tags.length > 3 ? (
          <span
            title={tool.tags.slice(3).join(", ")}
            aria-label={`${tool.tags.length - 3} ${t.moreTags}`}
          >
            +{tool.tags.length - 3}
          </span>
        ) : null}
        {tool.status === "maintenance" ? (
          <span className="maintenance-badge">
            <span />
            {t.maintenance}
          </span>
        ) : null}
      </div>
      <div className="tool-card-bottom">
        <div className="tool-host">
          <span title={tool.url}>{displayHost(tool.url)}</span>
          <button
            className="copy-button"
            type="button"
            onClick={onCopy}
            aria-label={`${t.copy}: ${name}`}
            title={t.copy}
          >
            <Copy aria-hidden="true" />
          </button>
        </div>
        <a
          className="launch-link"
          href={tool.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${t.open}: ${name} (${t.newTab})`}
        >
          {t.open}
          <ArrowUpRight aria-hidden="true" />
        </a>
      </div>
    </article>
  );
}

export default function App({ authAvailable }: { authAvailable: boolean }) {
  const [language, setLanguage] = useState<Language>(() =>
    readLanguage(storedValue(LANGUAGE_KEY)),
  );
  const [favorites, setFavorites] = useState<string[]>(() =>
    readFavoriteIds(storedValue(FAVORITES_KEY)),
  );
  const [catalog, setCatalog] = useState<CatalogSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sort, setSort] = useState<ToolSort>("recommended");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const requestId = useRef(0);
  const lastRefresh = useRef(0);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(false);
  const t = strings[language];

  const refreshCatalog = useCallback(async () => {
    const id = ++requestId.current;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    lastRefresh.current = Date.now();
    setLoading(true);
    const timer = window.setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch("/api/catalog", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("catalog_unavailable");
      const snapshot = checkedSnapshot(await response.json());
      if (!mounted.current || id !== requestId.current) return;
      setCatalog((current) =>
        current?.revision === snapshot.revision ? current : snapshot,
      );
      setLoadError(false);
      setCategoryId((current) =>
        current &&
        !snapshot.categories.some((category) => category.id === current)
          ? null
          : current,
      );
    } catch (error) {
      if (mounted.current && id === requestId.current) setLoadError(true);
      if (id === requestId.current) throw error;
    } finally {
      window.clearTimeout(timer);
      if (mounted.current && id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refreshCatalog().catch(() => undefined);
    const onReturn = () => {
      if (!document.hidden && Date.now() - lastRefresh.current > 30000)
        void refreshCatalog().catch(() => undefined);
    };
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      mounted.current = false;
      requestId.current++;
      requestRef.current?.abort();
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, [refreshCatalog]);
  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    document.title =
      language === "zh"
        ? "Platform Hub — 工具导航"
        : "Platform Hub — Your tools, one place";
  }, [language]);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === FAVORITES_KEY)
        setFavorites(readFavoriteIds(event.newValue));
      if (event.key === LANGUAGE_KEY) setLanguage(readLanguage(event.newValue));
      if (event.key === null) {
        setFavorites([]);
        setLanguage("en");
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const editing =
        target instanceof HTMLElement &&
        (target.matches("input, textarea, select") || target.isContentEditable);
      if (
        event.key === "/" &&
        !editing &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !document.querySelector('[aria-modal="true"]')
      ) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  useEffect(
    () => () => {
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    },
    [],
  );

  const categories = useMemo(
    () =>
      [...(catalog?.categories ?? [])].sort(
        (a, b) => a.order - b.order || a.id.localeCompare(b.id),
      ),
    [catalog],
  );
  const categoriesById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );
  const visibleTools = useMemo(
    () => catalog?.tools.filter((tool) => tool.visible) ?? [],
    [catalog],
  );
  const liveFavoritesCount = useMemo(
    () => visibleTools.filter((tool) => favorites.includes(tool.id)).length,
    [visibleTools, favorites],
  );
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    visibleTools.forEach((tool) =>
      counts.set(tool.categoryId, (counts.get(tool.categoryId) ?? 0) + 1),
    );
    return counts;
  }, [visibleTools]);
  const results = useMemo(
    () =>
      catalog
        ? discoverTools(catalog, {
            query,
            categoryId,
            favoritesOnly,
            favoriteIds: favorites,
            sort,
            language,
          })
        : [],
    [catalog, query, categoryId, favoritesOnly, favorites, sort, language],
  );
  const selectedCategory = categoryId
    ? categoriesById.get(categoryId)
    : undefined;
  const hasFilters = Boolean(query.trim() || categoryId || favoritesOnly);

  function announce(value: Feedback) {
    setFeedback(value);
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => setFeedback(null), 4000);
  }
  function changeLanguage(next: Language) {
    setLanguage(next);
    storeValue(LANGUAGE_KEY, next);
  }
  function toggleFavorite(id: string) {
    const next = favorites.includes(id)
      ? favorites.filter((item) => item !== id)
      : [...favorites, id];
    setFavorites(next);
    if (!storeValue(FAVORITES_KEY, JSON.stringify(next)))
      announce("favoriteStorageFailed");
  }
  async function copyLink(url: string) {
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error("clipboard_unavailable");
      await navigator.clipboard.writeText(url);
      if (mounted.current) announce("copied");
    } catch {
      if (mounted.current) announce("copyFailed");
    }
  }
  function resetFilters() {
    setQuery("");
    setCategoryId(null);
    setFavoritesOnly(false);
  }
  const dateText = catalog?.updatedAt
    ? new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-CA", {
        dateStyle: "medium",
      }).format(new Date(catalog.updatedAt))
    : null;

  return (
    <div className="hub-app">
      <a className="skip-link" href="#tools">
        {t.explore}
      </a>
      <header className="topbar">
        <a className="brand" href="#" aria-label="Platform Hub">
          <span className="brand-mark">
            <Layers3 aria-hidden="true" />
          </span>
          <span>
            Platform <strong>Hub</strong>
          </span>
        </a>
        <div className="top-actions">
          <span className="shared-tag">
            <Cloud aria-hidden="true" />
            {t.shared}
          </span>
          {authAvailable ? (
            <OwnerAccess language={language} onPublished={refreshCatalog} />
          ) : (
            <span className="auth-unavailable" title={t.authUnavailable}>
              <ShieldCheck aria-hidden="true" />
            </span>
          )}
          <div className="language" role="group" aria-label={t.language}>
            <button
              aria-pressed={language === "en"}
              onClick={() => changeLanguage("en")}
            >
              EN
            </button>
            <button
              aria-pressed={language === "zh"}
              onClick={() => changeLanguage("zh")}
            >
              中文
            </button>
          </div>
        </div>
      </header>
      <main>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow">{t.eyebrow}</p>
            <h1 id="hero-title">
              {t.title} <span>{t.titleAccent}</span>
            </h1>
            <p className="hero-intro">{t.intro}</p>
            <div className="hero-facts">
              <span>
                <strong>{catalog ? visibleTools.length : "—"}</strong>
                {t.tools}
              </span>
              <span className="fact-divider" />
              <span>
                <strong>{catalog ? categories.length : "—"}</strong>
                {t.categories}
              </span>
              <span className="fact-divider" />
              <span>
                <ArrowUpRight aria-hidden="true" />
                {t.newTab}
              </span>
            </div>
          </div>
          <div className="workspace-note">
            <div className="note-symbols">
              <span>
                <ToolIcon name="globe" />
              </span>
              <span>
                <ToolIcon name="file" />
              </span>
              <span>
                <ToolIcon name="building" />
              </span>
            </div>
            <p className="eyebrow">{t.atAGlance}</p>
            <h2>{t.summaryTitle}</h2>
            <p>{t.summaryDescription}</p>
          </div>
        </section>
        <section className="discovery-panel" aria-label={t.search}>
          <div className="search-field">
            <Search aria-hidden="true" />
            <label className="sr-only" htmlFor="tool-search">
              {t.search}
            </label>
            <input
              ref={searchRef}
              id="tool-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t.searchPlaceholder}
              aria-describedby="search-hint"
              onKeyDown={(event) => {
                if (event.key === "Escape" && query) {
                  event.preventDefault();
                  setQuery("");
                }
              }}
            />
            {query ? (
              <button
                type="button"
                className="icon-button search-clear"
                aria-label={t.clearSearch}
                onClick={() => {
                  setQuery("");
                  searchRef.current?.focus();
                }}
              >
                <X aria-hidden="true" />
              </button>
            ) : (
              <kbd title={t.shortcut}>/</kbd>
            )}
          </div>
          <span id="search-hint" className="search-help">
            {t.searchHint}
          </span>
        </section>
        <div className="catalog-toolbar">
          <nav className="category-navigation" aria-label={t.categoryFilter}>
            <button
              className={categoryId === null && !favoritesOnly ? "active" : ""}
              aria-pressed={categoryId === null && !favoritesOnly}
              onClick={() => {
                setCategoryId(null);
                setFavoritesOnly(false);
              }}
            >
              <LayoutGrid aria-hidden="true" />
              {t.all}
              <span>{catalog ? visibleTools.length : "—"}</span>
            </button>
            {categories.map((category) => (
              <button
                key={category.id}
                className={`accent-${category.accent}${categoryId === category.id ? " active" : ""}`}
                aria-pressed={categoryId === category.id && !favoritesOnly}
                onClick={() => {
                  setCategoryId(category.id);
                  setFavoritesOnly(false);
                }}
              >
                <ToolIcon name={category.icon} />
                {localized(category.name, language)}
                <span>{categoryCounts.get(category.id) ?? 0}</span>
              </button>
            ))}
            <span className="navigation-divider" />
            <button
              className={`favorites-filter${favoritesOnly ? " active" : ""}`}
              aria-pressed={favoritesOnly}
              onClick={() => {
                setFavoritesOnly((current) => !current);
                setCategoryId(null);
              }}
            >
              <Bookmark aria-hidden="true" />
              {t.favorites}
              <span>{liveFavoritesCount}</span>
            </button>
          </nav>
        </div>
        <section
          className="tool-directory"
          id="tools"
          aria-labelledby="directory-title"
          aria-busy={loading && !catalog}
        >
          <div className="directory-heading">
            <div>
              <h2 id="directory-title">
                {favoritesOnly
                  ? t.favorites
                  : selectedCategory
                    ? localized(selectedCategory.name, language)
                    : t.explore}
              </h2>
              <p role="status">
                {catalog
                  ? `${results.length} ${results.length === 1 ? t.result : t.results}`
                  : loading
                    ? t.loading
                    : t.loadErrorDetail}
                {favoritesOnly ? (
                  <span className="favorites-note"> · {t.localFavorites}</span>
                ) : null}
              </p>
            </div>
            <div className="directory-actions">
              {hasFilters ? (
                <button
                  className="text-button reset-filters"
                  onClick={resetFilters}
                >
                  <X aria-hidden="true" />
                  {t.reset}
                </button>
              ) : null}
              <label className="sort-control">
                <SlidersHorizontal aria-hidden="true" />
                <span className="sr-only">{t.sort}</span>
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value as ToolSort)}
                  aria-label={t.sort}
                >
                  <option value="recommended">{t.recommended}</option>
                  <option value="name">{t.alphabetical}</option>
                </select>
                <ChevronDown aria-hidden="true" />
              </label>
            </div>
          </div>
          {loadError && catalog ? (
            <div className="stale-banner" role="alert">
              <Cloud aria-hidden="true" />
              <p>{t.stale}</p>
              <button
                disabled={loading}
                onClick={() => void refreshCatalog().catch(() => undefined)}
              >
                {loading ? <LoaderCircle className="spinner" /> : null}
                {t.refresh}
              </button>
            </div>
          ) : null}
          {!catalog && loading ? (
            <div className="tool-grid skeleton-grid" aria-hidden="true">
              {Array.from({ length: 5 }, (_, index) => (
                <div
                  className={`tool-skeleton${index === 0 ? " featured-skeleton" : ""}`}
                  key={index}
                >
                  <span />
                  <strong />
                  <p />
                  <i />
                </div>
              ))}
            </div>
          ) : !catalog ? (
            <div className="empty-state error-state" role="alert">
              <span className="empty-icon">
                <Cloud aria-hidden="true" />
              </span>
              <h3>{t.loadError}</h3>
              <p>{t.loadErrorDetail}</p>
              <button
                className="primary"
                onClick={() => void refreshCatalog().catch(() => undefined)}
              >
                <ArrowRight aria-hidden="true" />
                {t.retry}
              </button>
            </div>
          ) : results.length ? (
            <div
              className={`tool-grid${sort === "recommended" && !categoryId && !favoritesOnly && !query.trim() ? " featured-grid" : ""}`}
            >
              {results.map((tool) => (
                <ToolCard
                  key={tool.id}
                  tool={tool}
                  category={categoriesById.get(tool.categoryId)!}
                  language={language}
                  favorite={favorites.includes(tool.id)}
                  onFavorite={() => toggleFavorite(tool.id)}
                  onCopy={() => void copyLink(tool.url)}
                />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <span className="empty-icon">
                {favoritesOnly && !query.trim() ? (
                  <Bookmark aria-hidden="true" />
                ) : (
                  <SearchX aria-hidden="true" />
                )}
              </span>
              <h3>
                {!visibleTools.length
                  ? t.emptyDirectory
                  : favoritesOnly && !query.trim() && !liveFavoritesCount
                    ? t.noFavorites
                    : t.noResults}
              </h3>
              <p>
                {!visibleTools.length
                  ? t.emptyDirectoryDescription
                  : favoritesOnly && !query.trim() && !liveFavoritesCount
                    ? t.noFavoritesDescription
                    : t.noResultsDescription}
              </p>
              {hasFilters ? (
                <button onClick={resetFilters}>
                  {t.all}
                  <ArrowRight aria-hidden="true" />
                </button>
              ) : null}
            </div>
          )}
        </section>
        <details className="about-hub">
          <summary>
            <ShieldCheck aria-hidden="true" />
            <span>{t.about}</span>
            <ChevronDown aria-hidden="true" />
          </summary>
          <div>
            <h2>{t.aboutIntro}</h2>
            <div className="about-columns">
              <p>{t.aboutSearch}</p>
              <p>{t.aboutFavorites}</p>
              <p>{t.aboutOwner}</p>
            </div>
            <p className="about-privacy">{t.aboutPrivacy}</p>
          </div>
        </details>
      </main>
      <footer className="footer">
        <span>
          © {new Date().getFullYear()} Zeyong Jin. {t.copyright}
        </span>
        <span className="footer-meta">
          {dateText ? `${t.updated} ${dateText}` : t.initial}
          <span className="footer-dot">·</span>
          <ShieldCheck aria-hidden="true" />
          {t.privacy}
        </span>
      </footer>
      {feedback ? (
        <div
          className={`feedback-toast${feedback === "copied" ? " success" : ""}`}
          role="status"
        >
          {feedback === "copied" ? (
            <Check aria-hidden="true" />
          ) : (
            <Copy aria-hidden="true" />
          )}
          {t[feedback]}
          <button
            aria-label={language === "en" ? "Dismiss notification" : "关闭提示"}
            onClick={() => setFeedback(null)}
          >
            <X aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
