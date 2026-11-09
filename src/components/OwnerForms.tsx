import { useEffect, useState } from "react";
import type {
  Accent,
  HubTool,
  IconName,
  Language,
  ToolCategory,
} from "../lib/types";
import { ownerCopy } from "./owner-copy";

const icons: IconName[] = [
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
const accents: Accent[] = ["blue", "teal", "violet", "amber"];
const iconLabels = {
  en: [
    "Search",
    "Global",
    "Energy",
    "Chart",
    "Count",
    "Building",
    "Folder",
    "Calculator",
    "Document",
    "Layers",
  ],
  zh: [
    "搜索",
    "全球",
    "能源",
    "图表",
    "统计",
    "楼宇",
    "文件夹",
    "计算器",
    "文档",
    "图层",
  ],
};
const accentLabels = {
  en: ["Blue", "Teal", "Violet", "Amber"],
  zh: ["蓝色", "青色", "紫色", "琥珀色"],
};

function LocalizedFields({
  kind,
  value,
  language,
  onChange,
}: {
  kind: "name" | "description";
  value: { en: string; zh: string };
  language: Language;
  onChange: (value: { en: string; zh: string }) => void;
}) {
  const t = ownerCopy[language];
  return (
    <div className="owner-field-grid">
      {(["en", "zh"] as const).map((locale) => (
        <label className="owner-field" key={locale}>
          {t[kind]} · {locale === "en" ? t.english : t.chinese}
          {locale === "zh" ? ` (${t.optional})` : ""}
          {kind === "description" ? (
            <textarea
              rows={3}
              maxLength={400}
              value={value[locale]}
              onChange={(e) => onChange({ ...value, [locale]: e.target.value })}
            />
          ) : (
            <input
              required={locale === "en"}
              maxLength={100}
              value={value[locale]}
              onChange={(e) => onChange({ ...value, [locale]: e.target.value })}
            />
          )}
        </label>
      ))}
    </div>
  );
}
function TagsField({
  tool,
  language,
  onChange,
}: {
  tool: HubTool;
  language: Language;
  onChange: (tool: HubTool) => void;
}) {
  const [text, setText] = useState(tool.tags.join(", "));
  const t = ownerCopy[language];
  useEffect(() => {
    const entered = text
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (JSON.stringify(entered) !== JSON.stringify(tool.tags))
      setText(tool.tags.join(", "));
  }, [tool.tags]);
  return (
    <label className="owner-field">
      {t.tags}
      <input
        maxLength={700}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          onChange({
            ...tool,
            tags: event.target.value
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean),
          });
        }}
      />
      <small>{t.tagsHelp}</small>
    </label>
  );
}
export function ToolForm({
  tool,
  categories,
  language,
  onChange,
}: {
  tool: HubTool;
  categories: ToolCategory[];
  language: Language;
  onChange: (tool: HubTool) => void;
}) {
  const t = ownerCopy[language];
  return (
    <div className="owner-form">
      <p className="owner-help">{t.requiredHelp}</p>
      <LocalizedFields
        kind="name"
        value={tool.name}
        language={language}
        onChange={(name) => onChange({ ...tool, name })}
      />
      <LocalizedFields
        kind="description"
        value={tool.description}
        language={language}
        onChange={(description) => onChange({ ...tool, description })}
      />
      <label className="owner-field">
        {t.url}
        <input
          type="url"
          maxLength={2048}
          placeholder="https://example.com"
          value={tool.url}
          onChange={(e) => onChange({ ...tool, url: e.target.value })}
        />
      </label>
      <p className="owner-help">{t.toolHelp}</p>
      <div className="owner-field-grid">
        <label className="owner-field">
          {t.category}
          <select
            value={tool.categoryId}
            onChange={(e) => onChange({ ...tool, categoryId: e.target.value })}
          >
            <option value="">{t.chooseCategory}</option>
            {categories.map((category) => (
              <option value={category.id} key={category.id}>
                {category.name[language] || category.name.en || t.untitled}
              </option>
            ))}
          </select>
        </label>
        <label className="owner-field">
          {t.status}
          <select
            value={tool.status}
            onChange={(e) =>
              onChange({ ...tool, status: e.target.value as HubTool["status"] })
            }
          >
            <option value="active">{t.active}</option>
            <option value="maintenance">{t.maintenance}</option>
          </select>
        </label>
      </div>
      <TagsField
        key={tool.id}
        tool={tool}
        language={language}
        onChange={onChange}
      />
      <div className="owner-field-grid">
        <label className="owner-field">
          {t.icon}
          <select
            value={tool.icon}
            onChange={(e) =>
              onChange({ ...tool, icon: e.target.value as IconName })
            }
          >
            {icons.map((icon, index) => (
              <option key={icon} value={icon}>
                {iconLabels[language][index]}
              </option>
            ))}
          </select>
        </label>
        <label className="owner-field">
          {t.order}
          <input
            type="number"
            min={0}
            max={9999}
            step={1}
            value={tool.order}
            onChange={(e) =>
              onChange({ ...tool, order: Number(e.target.value) })
            }
          />
          <small>{t.orderHelp}</small>
        </label>
      </div>
      <div className="owner-checkboxes">
        <label>
          <input
            type="checkbox"
            checked={tool.featured}
            onChange={(e) => onChange({ ...tool, featured: e.target.checked })}
          />
          {t.featured}
        </label>
        <label>
          <input
            type="checkbox"
            checked={tool.visible}
            onChange={(e) => onChange({ ...tool, visible: e.target.checked })}
          />
          {t.visible}
        </label>
      </div>
    </div>
  );
}
export function CategoryForm({
  category,
  language,
  onChange,
}: {
  category: ToolCategory;
  language: Language;
  onChange: (category: ToolCategory) => void;
}) {
  const t = ownerCopy[language];
  return (
    <div className="owner-form">
      <p className="owner-help">{t.requiredHelp}</p>
      <LocalizedFields
        kind="name"
        value={category.name}
        language={language}
        onChange={(name) => onChange({ ...category, name })}
      />
      <LocalizedFields
        kind="description"
        value={category.description}
        language={language}
        onChange={(description) => onChange({ ...category, description })}
      />
      <div className="owner-field-grid">
        <label className="owner-field">
          {t.icon}
          <select
            value={category.icon}
            onChange={(e) =>
              onChange({ ...category, icon: e.target.value as IconName })
            }
          >
            {icons.map((icon, index) => (
              <option key={icon} value={icon}>
                {iconLabels[language][index]}
              </option>
            ))}
          </select>
        </label>
        <label className="owner-field">
          {t.accent}
          <select
            value={category.accent}
            onChange={(e) =>
              onChange({ ...category, accent: e.target.value as Accent })
            }
          >
            {accents.map((accent, index) => (
              <option key={accent} value={accent}>
                {accentLabels[language][index]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="owner-field">
        {t.order}
        <input
          type="number"
          min={0}
          max={9999}
          step={1}
          value={category.order}
          onChange={(e) =>
            onChange({ ...category, order: Number(e.target.value) })
          }
        />
        <small>{t.orderHelp}</small>
      </label>
    </div>
  );
}
