import type { SVGProps } from "react";
import {
  Building2,
  Calculator,
  ChartNoAxesCombined,
  FileText,
  FolderKanban,
  Globe2,
  Layers3,
  Search,
  Sigma,
  Zap,
} from "lucide-react";
import type { Accent, IconName } from "../lib/types";

const icons = {
  search: Search,
  globe: Globe2,
  zap: Zap,
  chart: ChartNoAxesCombined,
  count: Sigma,
  building: Building2,
  folder: FolderKanban,
  calculator: Calculator,
  file: FileText,
  layers: Layers3,
};

export const ICON_OPTIONS: IconName[] = [
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
];
export const ACCENT_OPTIONS: Accent[] = ["blue", "teal", "violet", "amber"];

export default function ToolIcon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & { name: IconName }) {
  const Icon = icons[name] ?? Layers3;
  return <Icon aria-hidden="true" {...props} />;
}
