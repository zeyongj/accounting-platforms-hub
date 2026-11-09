export type Language = "en" | "zh";
export type Accent = "blue" | "teal" | "violet" | "amber";
export type IconName =
  | "search"
  | "globe"
  | "zap"
  | "chart"
  | "count"
  | "building"
  | "folder"
  | "calculator"
  | "file"
  | "layers";
export interface LocalizedText {
  en: string;
  zh: string;
}
export interface ToolCategory {
  id: string;
  name: LocalizedText;
  description: LocalizedText;
  icon: IconName;
  accent: Accent;
  order: number;
}
export interface HubTool {
  id: string;
  name: LocalizedText;
  description: LocalizedText;
  url: string;
  categoryId: string;
  tags: string[];
  icon: IconName;
  featured: boolean;
  visible: boolean;
  status: "active" | "maintenance";
  order: number;
}
export interface HubCatalog {
  categories: ToolCategory[];
  tools: HubTool[];
}
export interface CatalogSnapshot extends HubCatalog {
  schemaVersion: 1;
  revision: string;
  updatedAt: string | null;
}
export interface OwnerActor {
  userId: string;
  email: string;
}
export interface CatalogVersion {
  id: string;
  number: number;
  createdAt: string | null;
  actor: OwnerActor | null;
  action: "baseline" | "publish" | "restore";
  restoredFrom: string | null;
  catalog: HubCatalog;
}
export interface ManagementSnapshot {
  current: CatalogSnapshot;
  history: CatalogVersion[];
  historyLimit: number;
}
export interface ValidationIssue {
  path: string;
  message: string;
}
export type ManageAction =
  | { action: "publish"; revision: string; catalog: HubCatalog }
  | { action: "restore"; revision: string; versionId: string };
