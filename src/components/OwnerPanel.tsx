import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  ChevronRight,
  Clock3,
  Download,
  Eye,
  Folder,
  History,
  LoaderCircle,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { cleanCatalog, validateCatalog } from "../lib/catalog";
import type {
  CatalogVersion,
  HubCatalog,
  HubTool,
  Language,
  ManageAction,
  ManagementSnapshot,
  ToolCategory,
  ValidationIssue,
} from "../lib/types";
import { CategoryForm, ToolForm } from "./OwnerForms";
import { ownerCopy } from "./owner-copy";
import "./owner-panel.css";

interface OwnerPanelProps {
  language: Language;
  getToken: () => Promise<string | null>;
  onClose: () => void;
  onPublished: () => Promise<void>;
  onAccessChanged?: () => void;
}
type Pending =
  | { kind: "publish" }
  | { kind: "delete-tool"; id: string }
  | { kind: "delete-category"; id: string }
  | { kind: "discard-close" }
  | { kind: "discard-refresh" }
  | { kind: "import"; catalog: HubCatalog }
  | { kind: "restore"; version: CatalogVersion };
type Notice = "published" | "restored" | "imported" | "removed";
const clone = <T,>(value: T): T => structuredClone(value);
const catalogOf = (snapshot: ManagementSnapshot): HubCatalog => ({
  categories: snapshot.current.categories,
  tools: snapshot.current.tools,
});
const uid = () => crypto.randomUUID();
const label = (value: { en: string; zh: string }, language: Language) =>
  value[language] || value.en;
class RequestError extends Error {
  constructor(
    readonly code: string,
    readonly issues: ValidationIssue[] = [],
  ) {
    super(code);
  }
}

function changes<T extends { id: string; name: { en: string; zh: string } }>(
  before: T[],
  after: T[],
) {
  const old = new Map(before.map((item) => [item.id, item]));
  const next = new Map(after.map((item) => [item.id, item]));
  return {
    added: after.filter((item) => !old.has(item.id)),
    updated: after.filter(
      (item) =>
        old.has(item.id) &&
        JSON.stringify(old.get(item.id)) !== JSON.stringify(item),
    ),
    deleted: before.filter((item) => !next.has(item.id)),
  };
}
function isSnapshot(input: unknown): input is ManagementSnapshot {
  if (!input || typeof input !== "object") return false;
  const data = input as ManagementSnapshot;
  return Boolean(
    data.current &&
      typeof data.current.revision === "string" &&
      Array.isArray(data.history) &&
      Number.isInteger(data.historyLimit) &&
      validateCatalog(data.current).length === 0,
  );
}
function ChangesList({
  title,
  value,
  language,
}: {
  title: string;
  value: ReturnType<typeof changes>;
  language: Language;
}) {
  const t = ownerCopy[language];
  return (
    <section className="owner-change-summary">
      <h4>{title}</h4>
      {(["added", "updated", "deleted"] as const).map((kind) => (
        <div key={kind}>
          <strong>
            {t[kind]} <span>{value[kind].length}</span>
          </strong>
          {value[kind].length ? (
            <p>
              {value[kind]
                .map((item) => label(item.name, language) || t.untitled)
                .join(" · ")}
            </p>
          ) : null}
        </div>
      ))}
    </section>
  );
}

export default function OwnerPanel({
  language,
  getToken,
  onClose,
  onPublished,
  onAccessChanged,
}: OwnerPanelProps) {
  const t = ownerCopy[language];
  const [snapshot, setSnapshot] = useState<ManagementSnapshot | null>(null);
  const [draft, setDraft] = useState<HubCatalog | null>(null);
  const [tab, setTab] = useState<"tools" | "categories" | "history">("tools");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverIssues, setServerIssues] = useState<ValidationIssue[]>([]);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [undo, setUndo] = useState<HubCatalog | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const errorMessage = useRef<HTMLDivElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const live = useRef(false);
  const busyRef = useRef(false);
  const requestSerial = useRef(0);
  const controllers = useRef(new Set<AbortController>());
  const callbacks = useRef({ onClose, onPublished, onAccessChanged });
  callbacks.current = { onClose, onPublished, onAccessChanged };
  const closeRequest = useRef<() => void>(() => {});
  const dirty = Boolean(
    snapshot &&
      draft &&
      JSON.stringify(catalogOf(snapshot)) !== JSON.stringify(draft),
  );
  const issues = useMemo(() => (draft ? validateCatalog(draft) : []), [draft]);
  const issueList = serverIssues.length ? serverIssues : issues;
  const toolChanges = useMemo(
    () =>
      snapshot && draft
        ? changes(snapshot.current.tools, draft.tools)
        : { added: [], updated: [], deleted: [] },
    [snapshot, draft],
  );
  const categoryChanges = useMemo(
    () =>
      snapshot && draft
        ? changes(snapshot.current.categories, draft.categories)
        : { added: [], updated: [], deleted: [] },
    [snapshot, draft],
  );
  const tool = draft?.tools.find((item) => item.id === selectedTool);
  const category = draft?.categories.find(
    (item) => item.id === selectedCategory,
  );
  const categoryInUse = Boolean(
    category && draft?.tools.some((tool) => tool.categoryId === category.id),
  );
  const version =
    snapshot?.history.find((item) => item.id === selectedVersion) ??
    snapshot?.history[0];
  const filteredTools = useMemo(
    () =>
      draft?.tools
        .filter((item) =>
          `${item.name.en} ${item.name.zh} ${item.url} ${item.tags.join(" ")}`
            .toLowerCase()
            .includes(search.trim().toLowerCase()),
        )
        .sort((a, b) => a.order - b.order) ?? [],
    [draft, search],
  );

  const request = useCallback(
    async (
      action?: ManageAction,
      upstream?: AbortSignal,
    ): Promise<ManagementSnapshot> => {
      const controller = new AbortController();
      controllers.current.add(controller);
      const abort = () => controller.abort();
      upstream?.addEventListener("abort", abort, { once: true });
      if (upstream?.aborted) controller.abort();
      let rejectDeadline: (reason: unknown) => void = () => {};
      const deadline = new Promise<never>((_, reject) => {
        rejectDeadline = reject;
      });
      const timer = window.setTimeout(() => {
        controller.abort();
        rejectDeadline(new RequestError("service_unavailable"));
      }, 20000);
      try {
        return await Promise.race([
          deadline,
          (async () => {
            const token = await getToken();
            if (controller.signal.aborted)
              throw new RequestError("service_unavailable");
            if (!token) throw new RequestError("unauthorized");
            const response = await fetch("/api/manage", {
              method: action ? "POST" : "GET",
              cache: "no-store",
              signal: controller.signal,
              headers: {
                Authorization: `Bearer ${token}`,
                ...(action ? { "Content-Type": "application/json" } : {}),
              },
              ...(action ? { body: JSON.stringify(action) } : {}),
            });
            const value: unknown = await response.json().catch(() => null);
            if (!response.ok) {
              const failure = value as {
                code?: string;
                issues?: ValidationIssue[];
              } | null;
              throw new RequestError(
                typeof failure?.code === "string"
                  ? failure.code
                  : "service_unavailable",
                Array.isArray(failure?.issues) ? failure.issues : [],
              );
            }
            if (!isSnapshot(value))
              throw new RequestError("service_unavailable");
            return value;
          })(),
        ]);
      } finally {
        window.clearTimeout(timer);
        upstream?.removeEventListener("abort", abort);
        controllers.current.delete(controller);
      }
    },
    [getToken],
  );

  function applySnapshot(next: ManagementSnapshot) {
    setSnapshot(next);
    setDraft(clone(catalogOf(next)));
    setPending(null);
    setUndo(null);
    setServerIssues([]);
    setNeedsRefresh(false);
    setSelectedTool((current) =>
      next.current.tools.some((item) => item.id === current)
        ? current
        : (next.current.tools[0]?.id ?? null),
    );
    setSelectedCategory((current) =>
      next.current.categories.some((item) => item.id === current)
        ? current
        : (next.current.categories[0]?.id ?? null),
    );
    setSelectedVersion(next.history[0]?.id ?? null);
  }
  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (busyRef.current) return;
      const id = ++requestSerial.current;
      setLoading(true);
      setError(null);
      try {
        const next = await request(undefined, signal);
        if (live.current && id === requestSerial.current) applySnapshot(next);
      } catch (failure) {
        if (!live.current || signal?.aborted || id !== requestSerial.current)
          return;
        const code =
          failure instanceof RequestError
            ? failure.code
            : "service_unavailable";
        setError(code);
        setNeedsRefresh(true);
        if (code === "unauthorized" || code === "forbidden") {
          setSnapshot(null);
          setDraft(null);
          callbacks.current.onAccessChanged?.();
        }
      } finally {
        if (live.current && id === requestSerial.current && !signal?.aborted)
          setLoading(false);
      }
    },
    [request],
  );
  useEffect(() => {
    live.current = true;
    const controller = new AbortController();
    void load(controller.signal);
    return () => {
      live.current = false;
      controller.abort();
      requestSerial.current++;
      controllers.current.forEach((item) => item.abort());
    };
  }, [load]);
  closeRequest.current = () => {
    if (busyRef.current) return;
    if (pending) {
      setPending(null);
      return;
    }
    if (dirty) setPending({ kind: "discard-close" });
    else callbacks.current.onClose();
  };
  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const root = document.getElementById("root");
    const previousInert = root?.inert ?? false;
    if (root) root.inert = true;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeRequest.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [
        ...(dialog.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,a[href],[tabindex]:not([tabindex="-1"])',
        ) ?? []),
      ].filter((element) => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first) {
        event.preventDefault();
        dialog.current?.focus();
      } else if (
        event.shiftKey &&
        (document.activeElement === first ||
          !dialog.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !dialog.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keydown, true);
    return () => {
      document.removeEventListener("keydown", keydown, true);
      document.body.style.overflow = overflow;
      if (root) root.inert = previousInert;
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);
  useEffect(() => {
    if (pending) cancelButton.current?.focus();
  }, [pending]);
  useEffect(() => {
    if (error)
      errorMessage.current?.scrollIntoView({
        block: "nearest",
        behavior: "auto",
      });
  }, [error]);

  function updateDraft(next: HubCatalog) {
    setDraft(next);
    setUndo(null);
    setNotice(null);
    setServerIssues([]);
  }
  function requestRefresh() {
    if (dirty) setPending({ kind: "discard-refresh" });
    else void load();
  }
  function addTool() {
    if (!draft) return;
    if (!draft.categories.length) {
      setError("noCategories");
      setTab("categories");
      return;
    }
    const next: HubTool = {
      id: uid(),
      name: { en: "", zh: "" },
      description: { en: "", zh: "" },
      url: "https://",
      categoryId: draft.categories[0].id,
      tags: [],
      icon: "layers",
      featured: false,
      visible: true,
      status: "active",
      order: Math.min(
        9999,
        Math.max(-1, ...draft.tools.map((item) => item.order)) + 1,
      ),
    };
    updateDraft({ ...draft, tools: [...draft.tools, next] });
    setSelectedTool(next.id);
    setSearch("");
  }
  function addCategory() {
    if (!draft) return;
    const next: ToolCategory = {
      id: uid(),
      name: { en: "", zh: "" },
      description: { en: "", zh: "" },
      icon: "folder",
      accent: "blue",
      order: Math.min(
        9999,
        Math.max(-1, ...draft.categories.map((item) => item.order)) + 1,
      ),
    };
    updateDraft({ ...draft, categories: [...draft.categories, next] });
    setSelectedCategory(next.id);
  }
  function exportDraft() {
    if (!draft) return;
    const data = JSON.stringify(
      {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        catalog: draft,
      },
      null,
      2,
    );
    const url = URL.createObjectURL(
      new Blob([data], { type: "application/json;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `platform-hub-catalog-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importDraft(file?: File) {
    if (!file) return;
    setServerIssues([]);
    try {
      if (file.size > 1024 * 1024) throw new Error();
      const parsed: unknown = JSON.parse(await file.text());
      const candidate =
        parsed && typeof parsed === "object" && "catalog" in parsed
          ? parsed.catalog
          : parsed;
      const found = validateCatalog(candidate);
      if (found.length) {
        setServerIssues(found);
        throw new Error();
      }
      setPending({ kind: "import", catalog: cleanCatalog(candidate) });
      setError(null);
    } catch {
      setError("invalidBackup");
    } finally {
      if (importInput.current) importInput.current.value = "";
    }
  }
  async function mutate(
    action: ManageAction,
    noticeKey: "published" | "restored",
  ) {
    if (busyRef.current || needsRefresh || loading) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    setServerIssues([]);
    try {
      const next = await request(action);
      if (!live.current) return;
      applySnapshot(next);
      setNotice(noticeKey);
      try {
        await callbacks.current.onPublished();
      } catch {
        if (live.current) setError("refreshAfterSave");
      }
    } catch (failure) {
      if (!live.current) return;
      const code =
        failure instanceof RequestError ? failure.code : "service_unavailable";
      setError(code);
      if (failure instanceof RequestError) setServerIssues(failure.issues);
      if (
        [
          "revision_conflict",
          "service_unavailable",
          "version_not_found",
        ].includes(code)
      )
        setNeedsRefresh(true);
      if (code === "unauthorized" || code === "forbidden") {
        setNeedsRefresh(true);
        callbacks.current.onAccessChanged?.();
      }
    } finally {
      busyRef.current = false;
      if (live.current) setBusy(false);
    }
  }
  function confirmPending() {
    if (!pending || busyRef.current) return;
    if (pending.kind === "discard-close") {
      callbacks.current.onClose();
      return;
    }
    if (pending.kind === "discard-refresh") {
      setPending(null);
      void load();
      return;
    }
    if (pending.kind === "import") {
      updateDraft(clone(pending.catalog));
      setSelectedTool(pending.catalog.tools[0]?.id ?? null);
      setSelectedCategory(pending.catalog.categories[0]?.id ?? null);
      setPending(null);
      setNotice("imported");
      return;
    }
    if (!draft || !snapshot) return;
    if (pending.kind === "delete-tool") {
      setUndo(clone(draft));
      setDraft({
        ...draft,
        tools: draft.tools.filter((item) => item.id !== pending.id),
      });
      setSelectedTool(null);
      setServerIssues([]);
      setPending(null);
      setNotice("removed");
      return;
    }
    if (pending.kind === "delete-category") {
      if (draft.tools.some((item) => item.categoryId === pending.id)) {
        setError("categoryUsed");
        setPending(null);
        return;
      }
      setUndo(clone(draft));
      setDraft({
        ...draft,
        categories: draft.categories.filter((item) => item.id !== pending.id),
      });
      setSelectedCategory(null);
      setServerIssues([]);
      setPending(null);
      setNotice("removed");
      return;
    }
    if (pending.kind === "publish") {
      if (issues.length) return;
      void mutate(
        {
          action: "publish",
          revision: snapshot.current.revision,
          catalog: cleanCatalog(draft),
        },
        "published",
      );
      return;
    }
    void mutate(
      {
        action: "restore",
        revision: snapshot.current.revision,
        versionId: pending.version.id,
      },
      "restored",
    );
  }
  function errorText(code: string) {
    return Object.hasOwn(t, code) ? t[code as keyof typeof t] : t.genericError;
  }
  function validationText(issue: ValidationIssue) {
    const [kind, index, field, locale] = issue.path.split(".");
    const collection =
      kind === "tools"
        ? t.tools
        : kind === "categories"
          ? t.categories
          : language === "zh"
            ? "目录"
            : "Catalog";
    const position = /^\d+$/.test(index ?? "") ? Number(index) : null;
    const item =
      position !== null && error !== "invalidBackup"
        ? kind === "tools"
          ? draft?.tools[position]
          : draft?.categories[position]
        : undefined;
    const fieldNames: Record<string, string> = {
      name: t.name,
      description: t.description,
      url: t.url,
      categoryId: t.category,
      tags: t.tags,
      icon: t.icon,
      accent: t.accent,
      order: t.order,
      featured: t.featured,
      visible: t.visible,
      status: t.status,
      id: language === "zh" ? "记录标识" : "Record ID",
    };
    const subject = [
      item
        ? label(item.name, language) || t.untitled
        : position === null
          ? collection
          : `${collection} ${position + 1}`,
      field ? fieldNames[field] || "" : "",
      locale === "en" ? t.english : locale === "zh" ? t.chinese : "",
    ]
      .filter(Boolean)
      .join(" · ");
    if (language === "en") return { subject, message: issue.message };
    const guidance: Record<string, string> = {
      name:
        locale === "en"
          ? "请填写 1–100 字符的英文名称。"
          : "中文名称不能超过 100 字符。",
      description: "说明不能超过 400 字符。",
      url: issue.message.includes("already used")
        ? "此地址已被另一个工具使用，请勿重复添加。"
        : "请使用公开的 HTTP／HTTPS 地址，不含登录凭据或内网地址。",
      categoryId: "请选择现有分类；删除分类前需先移动或移除其中的工具。",
      tags: "最多填写 12 个非空标签，每个标签不超过 40 字符。",
      icon: "请选择支持的图标。",
      accent: "请选择支持的分类颜色。",
      order: "请填写 0–9999 之间的整数。",
      featured: "请选择是否推荐此工具。",
      visible: "请选择是否对访客显示。",
      status: "请选择“可用”或“维护中”。",
      id: "记录标识必须唯一，且只包含字母、数字、连字符或下划线，最多 80 字符。",
    };
    return {
      subject,
      message: field
        ? guidance[field] || "请检查此项设置。"
        : kind === "tools" && position === null
          ? "最多可保存 200 个工具。"
          : kind === "categories" && position === null
            ? "最多可保存 30 个分类。"
            : "请检查目录记录及必填资料。",
    };
  }
  function date(value: string | null) {
    if (!value) return t.unknownTime;
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime())
      ? new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-CA", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(parsed)
      : t.unknownTime;
  }
  function versionAction(item: CatalogVersion) {
    return item.action === "baseline"
      ? t.baseline
      : item.action === "restore"
        ? t.restoration
        : t.publication;
  }
  const confirmationTitle =
    pending?.kind === "publish"
      ? t.publishTitle
      : pending?.kind === "delete-tool"
        ? t.deleteTool
        : pending?.kind === "delete-category"
          ? t.deleteCategory
          : pending?.kind === "import"
            ? t.importTitle
            : pending?.kind === "restore"
              ? t.restoreTitle
              : pending?.kind === "discard-refresh"
                ? t.refreshTitle
                : t.discardTitle;
  const confirmationHelp =
    pending?.kind === "publish"
      ? t.publishHelp
      : pending?.kind === "delete-tool" || pending?.kind === "delete-category"
        ? t.deleteHelp
        : pending?.kind === "import"
          ? t.importHelp
          : pending?.kind === "restore"
            ? t.restoreHelp
            : t.discardHelp;
  const confirmationButton =
    pending?.kind === "publish"
      ? t.confirmPublish
      : pending?.kind === "delete-tool" || pending?.kind === "delete-category"
        ? t.confirmDelete
        : pending?.kind === "import"
          ? t.confirmImport
          : pending?.kind === "restore"
            ? t.confirmRestore
            : pending?.kind === "discard-refresh"
              ? t.discardRefresh
              : t.discardClose;
  return createPortal(
    <div
      className="owner-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeRequest.current();
      }}
    >
      <div
        className="owner-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="owner-title"
        aria-describedby="owner-description"
        ref={dialog}
        tabIndex={-1}
      >
        <header className="owner-header">
          <div>
            <span className="owner-kicker">
              <ShieldCheck aria-hidden="true" />
              {t.workspace}
            </span>
            <h2 id="owner-title">{t.title}</h2>
            <p id="owner-description">{t.subtitle}</p>
          </div>
          <button
            className="owner-icon-button"
            ref={closeButton}
            aria-label={t.close}
            disabled={busy}
            onClick={() => closeRequest.current()}
          >
            <X aria-hidden="true" />
          </button>
        </header>
        <div className="owner-toolbar">
          <div className="owner-tabs" role="tablist" aria-label={t.title}>
            {(["tools", "categories", "history"] as const).map(
              (name, index, array) => (
                <button
                  key={name}
                  role="tab"
                  id={`owner-tab-${name}`}
                  aria-controls={`owner-content-${name}`}
                  aria-selected={tab === name}
                  tabIndex={tab === name ? 0 : -1}
                  disabled={busy}
                  onClick={() => {
                    setTab(name);
                    setPending(null);
                  }}
                  onKeyDown={(event) => {
                    if (
                      !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                        event.key,
                      )
                    )
                      return;
                    event.preventDefault();
                    const next =
                      event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? array.length - 1
                          : (index +
                              (event.key === "ArrowRight" ? 1 : -1) +
                              array.length) %
                            array.length;
                    setTab(array[next]);
                    setPending(null);
                    document
                      .getElementById(`owner-tab-${array[next]}`)
                      ?.focus();
                  }}
                >
                  {name === "tools" ? (
                    <Folder aria-hidden="true" />
                  ) : name === "history" ? (
                    <History aria-hidden="true" />
                  ) : (
                    <ChevronRight aria-hidden="true" />
                  )}
                  {t[name]}
                  {draft && name !== "history" ? (
                    <span>{draft[name].length}</span>
                  ) : null}
                </button>
              ),
            )}
          </div>
          <button
            className="owner-button owner-small"
            disabled={busy || loading}
            onClick={requestRefresh}
          >
            <RefreshCw
              className={loading ? "owner-spin" : ""}
              aria-hidden="true"
            />
            {t.refresh}
          </button>
        </div>
        <div className="owner-body" aria-busy={busy || loading}>
          {error ? (
            <div
              className="owner-message owner-error"
              role="alert"
              ref={errorMessage}
            >
              <span>
                {errorText(error)}
                {needsRefresh && snapshot ? (
                  <small>{t.needsRefresh}</small>
                ) : null}
              </span>
              {!snapshot ? (
                <button
                  className="owner-button owner-small"
                  disabled={busy || loading}
                  onClick={() => void load()}
                >
                  {t.retry}
                </button>
              ) : null}
            </div>
          ) : null}
          {notice ? (
            <div className="owner-message owner-success" role="status">
              <Check aria-hidden="true" />
              <span>{t[notice]}</span>
              {undo ? (
                <button
                  className="owner-button owner-small"
                  disabled={busy}
                  onClick={() => {
                    setDraft(undo);
                    setUndo(null);
                    setNotice(null);
                  }}
                >
                  <RotateCcw aria-hidden="true" />
                  {t.undo}
                </button>
              ) : null}
            </div>
          ) : null}
          {pending ? (
            <section
              className="owner-confirm"
              aria-labelledby="owner-confirm-title"
            >
              <h3 id="owner-confirm-title">{confirmationTitle}</h3>
              <p>{confirmationHelp}</p>
              {pending.kind === "restore" ? (
                <strong>
                  V{pending.version.number} · {date(pending.version.createdAt)}
                </strong>
              ) : null}
              {pending.kind === "publish" ? (
                <div className="owner-changes">
                  <ChangesList
                    title={t.toolChanges}
                    value={toolChanges}
                    language={language}
                  />
                  <ChangesList
                    title={t.categoryChanges}
                    value={categoryChanges}
                    language={language}
                  />
                </div>
              ) : null}
              <div className="owner-confirm-actions">
                <button
                  className="owner-button owner-primary"
                  disabled={
                    busy ||
                    loading ||
                    ((pending.kind === "publish" ||
                      pending.kind === "restore") &&
                      needsRefresh)
                  }
                  onClick={confirmPending}
                >
                  {busy ? (
                    <LoaderCircle className="owner-spin" aria-hidden="true" />
                  ) : null}
                  {busy ? t.working : confirmationButton}
                </button>
                <button
                  className="owner-button"
                  ref={cancelButton}
                  disabled={busy}
                  onClick={() => setPending(null)}
                >
                  {pending.kind === "discard-close" ||
                  pending.kind === "discard-refresh"
                    ? t.keepEditing
                    : t.cancel}
                </button>
              </div>
            </section>
          ) : null}
          {loading && !snapshot ? (
            <div className="owner-loading" role="status">
              <LoaderCircle className="owner-spin" aria-hidden="true" />
              {t.loading}
            </div>
          ) : null}
          {draft && snapshot ? (
            <>
              {issueList.length ? (
                <details
                  className="owner-validation"
                  open={serverIssues.length > 0}
                >
                  <summary>
                    {t.validation} <strong>{issueList.length}</strong>
                  </summary>
                  <ul>
                    {issueList.slice(0, 12).map((issue, index) => {
                      const explanation = validationText(issue);
                      return (
                        <li key={`${issue.path}-${index}`}>
                          <strong>{explanation.subject}</strong> —{" "}
                          {explanation.message}
                        </li>
                      );
                    })}
                  </ul>
                </details>
              ) : null}
              <section
                role="tabpanel"
                id="owner-content-tools"
                aria-labelledby="owner-tab-tools"
                hidden={tab !== "tools"}
              >
                <div className="owner-section-heading">
                  <label className="owner-search">
                    <Search aria-hidden="true" />
                    <input
                      aria-label={t.searchTools}
                      placeholder={t.searchTools}
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </label>
                  <button
                    className="owner-button owner-primary"
                    disabled={busy || loading}
                    onClick={addTool}
                  >
                    <Plus aria-hidden="true" />
                    {t.addTool}
                  </button>
                </div>
                <div className="owner-editor-layout">
                  <div className="owner-item-list">
                    {filteredTools.length ? (
                      filteredTools.map((item) => (
                        <button
                          key={item.id}
                          className={`owner-item ${item.id === selectedTool ? "active" : ""}`}
                          aria-pressed={item.id === selectedTool}
                          disabled={busy}
                          onClick={() => {
                            setSelectedTool(item.id);
                            setPending(null);
                          }}
                        >
                          <strong>
                            {label(item.name, language) || t.untitled}
                          </strong>
                          <small>
                            {draft.categories.find(
                              (category) => category.id === item.categoryId,
                            )?.name[language] ||
                              draft.categories.find(
                                (category) => category.id === item.categoryId,
                              )?.name.en ||
                              t.chooseCategory}
                          </small>
                          <span>
                            {!item.visible ? <em>{t.hidden}</em> : null}
                            {item.featured ? <em>{t.featuredBadge}</em> : null}
                            {item.status === "maintenance" ? (
                              <em>{t.maintenance}</em>
                            ) : null}
                          </span>
                        </button>
                      ))
                    ) : (
                      <p className="owner-help">{t.noTools}</p>
                    )}
                  </div>
                  <div className="owner-editor-detail">
                    {tool ? (
                      <>
                        <div className="owner-edit-heading">
                          <h3>{label(tool.name, language) || t.untitled}</h3>
                          <button
                            className="owner-button owner-small owner-danger"
                            disabled={busy}
                            onClick={() =>
                              setPending({ kind: "delete-tool", id: tool.id })
                            }
                          >
                            <Trash2 aria-hidden="true" />
                            {t.delete}
                          </button>
                        </div>
                        <fieldset disabled={busy} className="owner-fields">
                          <ToolForm
                            key={tool.id}
                            tool={tool}
                            categories={draft.categories}
                            language={language}
                            onChange={(next) =>
                              updateDraft({
                                ...draft,
                                tools: draft.tools.map((item) =>
                                  item.id === next.id ? next : item,
                                ),
                              })
                            }
                          />
                        </fieldset>
                      </>
                    ) : (
                      <p className="owner-help">{t.selectTool}</p>
                    )}
                  </div>
                </div>
              </section>
              <section
                role="tabpanel"
                id="owner-content-categories"
                aria-labelledby="owner-tab-categories"
                hidden={tab !== "categories"}
              >
                <div className="owner-section-heading">
                  <p className="owner-help" id="owner-category-delete-help">
                    {t.categoryUsed}
                  </p>
                  <button
                    className="owner-button owner-primary"
                    disabled={busy || loading}
                    onClick={addCategory}
                  >
                    <Plus aria-hidden="true" />
                    {t.addCategory}
                  </button>
                </div>
                <div className="owner-editor-layout">
                  <div className="owner-item-list">
                    {[...draft.categories]
                      .sort((a, b) => a.order - b.order)
                      .map((item) => (
                        <button
                          key={item.id}
                          className={`owner-item ${item.id === selectedCategory ? "active" : ""}`}
                          aria-pressed={item.id === selectedCategory}
                          disabled={busy}
                          onClick={() => {
                            setSelectedCategory(item.id);
                            setPending(null);
                          }}
                        >
                          <strong>
                            {label(item.name, language) || t.untitled}
                          </strong>
                          <small>
                            {
                              draft.tools.filter(
                                (tool) => tool.categoryId === item.id,
                              ).length
                            }{" "}
                            {t.tools}
                          </small>
                        </button>
                      ))}
                  </div>
                  <div className="owner-editor-detail">
                    {category ? (
                      <>
                        <div className="owner-edit-heading">
                          <h3>
                            {label(category.name, language) || t.untitled}
                          </h3>
                          <button
                            className="owner-button owner-small owner-danger"
                            disabled={busy || categoryInUse}
                            title={categoryInUse ? t.categoryUsed : undefined}
                            aria-describedby={
                              categoryInUse
                                ? "owner-category-delete-help"
                                : undefined
                            }
                            onClick={() => {
                              if (
                                draft.tools.some(
                                  (tool) => tool.categoryId === category.id,
                                )
                              )
                                setError("categoryUsed");
                              else
                                setPending({
                                  kind: "delete-category",
                                  id: category.id,
                                });
                            }}
                          >
                            <Trash2 aria-hidden="true" />
                            {t.delete}
                          </button>
                        </div>
                        <fieldset disabled={busy} className="owner-fields">
                          <CategoryForm
                            key={category.id}
                            category={category}
                            language={language}
                            onChange={(next) =>
                              updateDraft({
                                ...draft,
                                categories: draft.categories.map((item) =>
                                  item.id === next.id ? next : item,
                                ),
                              })
                            }
                          />
                        </fieldset>
                      </>
                    ) : (
                      <p className="owner-help">{t.selectCategory}</p>
                    )}
                  </div>
                </div>
              </section>
              <section
                role="tabpanel"
                id="owner-content-history"
                aria-labelledby="owner-tab-history"
                hidden={tab !== "history"}
              >
                <p className="owner-help owner-history-help">
                  <Clock3 aria-hidden="true" />
                  {t.historyHelp.replace(
                    "{limit}",
                    String(snapshot.historyLimit),
                  )}
                </p>
                <div className="owner-editor-layout">
                  <div className="owner-item-list">
                    {snapshot.history.map((item, index) => (
                      <button
                        key={item.id}
                        className={`owner-item ${version?.id === item.id ? "active" : ""}`}
                        disabled={busy}
                        aria-pressed={version?.id === item.id}
                        onClick={() => {
                          setSelectedVersion(item.id);
                          setPending(null);
                        }}
                      >
                        <strong>
                          V{item.number}
                          {index === 0 ? <em>{t.current}</em> : null}
                        </strong>
                        <small>{versionAction(item)}</small>
                        <small>{date(item.createdAt)}</small>
                        <small>{item.actor?.email || t.unknownActor}</small>
                      </button>
                    ))}
                  </div>
                  {version ? (
                    <div className="owner-editor-detail">
                      <div className="owner-edit-heading">
                        <div>
                          <p className="owner-kicker">
                            {t.version} {version.number}
                          </p>
                          <h3>{versionAction(version)}</h3>
                          <p className="owner-help">
                            {date(version.createdAt)}
                            <br />
                            {version.actor?.email || t.unknownActor}
                          </p>
                        </div>
                        {version.id !== snapshot.history[0]?.id ? (
                          <button
                            className="owner-button owner-small"
                            disabled={busy || loading || needsRefresh}
                            onClick={() =>
                              setPending({ kind: "restore", version })
                            }
                          >
                            <RotateCcw aria-hidden="true" />
                            {t.restore}
                          </button>
                        ) : (
                          <span className="owner-live-badge">{t.current}</span>
                        )}
                      </div>
                      {version.action === "baseline" ? (
                        <p className="owner-help">{t.baselineHelp}</p>
                      ) : null}
                      {version.restoredFrom ? (
                        <p className="owner-help">
                          {t.restoredFrom}:{" "}
                          {snapshot.history.find(
                            (item) => item.id === version.restoredFrom,
                          )
                            ? `V${snapshot.history.find((item) => item.id === version.restoredFrom)!.number}`
                            : version.restoredFrom}
                        </p>
                      ) : null}
                      <details className="owner-history-details" open>
                        <summary>
                          {t.versionTools} · {version.catalog.tools.length}
                        </summary>
                        <ul>
                          {version.catalog.tools.map((item) => (
                            <li key={item.id}>
                              <strong>
                                {label(item.name, language) || t.untitled}
                              </strong>
                              <small>{item.url}</small>
                              {!item.visible ? <em>{t.hidden}</em> : null}
                            </li>
                          ))}
                        </ul>
                      </details>
                    </div>
                  ) : null}
                </div>
              </section>
              <details className="owner-preview">
                <summary>
                  <Eye aria-hidden="true" />
                  {t.preview}
                </summary>
                <p className="owner-help">{t.previewHelp}</p>
                {[...draft.categories]
                  .sort((a, b) => a.order - b.order)
                  .map((category) => {
                    const visible = draft.tools
                      .filter(
                        (tool) =>
                          tool.visible && tool.categoryId === category.id,
                      )
                      .sort((a, b) => a.order - b.order);
                    return visible.length ? (
                      <section key={category.id}>
                        <h4>{label(category.name, language) || t.untitled}</h4>
                        <div>
                          {visible.map((tool) => (
                            <article key={tool.id}>
                              <strong>
                                {label(tool.name, language) || t.untitled}
                              </strong>
                              <p>{label(tool.description, language)}</p>
                              <small>{tool.url}</small>
                              {tool.status === "maintenance" ? (
                                <em>{t.maintenance}</em>
                              ) : null}
                            </article>
                          ))}
                        </div>
                      </section>
                    ) : null;
                  })}
                {!draft.tools.some((tool) => tool.visible) ? (
                  <p className="owner-help">{t.noVisible}</p>
                ) : null}
              </details>
            </>
          ) : null}
        </div>
        <footer className="owner-footer">
          <div>
            <span className={dirty ? "owner-draft-badge" : "owner-live-badge"}>
              {dirty ? t.draft : t.live}
            </span>
            <p>{t.backupHelp}</p>
          </div>
          <div className="owner-footer-actions">
            <button
              className="owner-button owner-small"
              disabled={!draft || busy}
              onClick={exportDraft}
            >
              <Download aria-hidden="true" />
              {t.export}
            </button>
            <button
              className="owner-button owner-small"
              disabled={!draft || busy || loading}
              onClick={() => importInput.current?.click()}
            >
              <Upload aria-hidden="true" />
              {t.import}
            </button>
            <input
              ref={importInput}
              type="file"
              accept=".json,application/json"
              hidden
              aria-label={t.import}
              onChange={(event) => void importDraft(event.target.files?.[0])}
            />
            <button
              className="owner-button owner-primary"
              disabled={
                !draft ||
                !dirty ||
                busy ||
                loading ||
                needsRefresh ||
                issues.length > 0
              }
              onClick={() => {
                setPending({ kind: "publish" });
                setError(null);
              }}
            >
              {busy ? (
                <LoaderCircle className="owner-spin" aria-hidden="true" />
              ) : (
                <Check aria-hidden="true" />
              )}
              {busy ? t.working : t.publish}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
