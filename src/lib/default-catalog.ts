import type { HubCatalog } from "./types";

const initialCatalog: HubCatalog = {
  categories: [
    {
      id: "global",
      name: { en: "Global Scope", zh: "通用平台" },
      description: {
        en: "Shared resources for every team.",
        zh: "面向各团队的通用查询与资源。",
      },
      icon: "globe",
      accent: "blue",
      order: 10,
    },
    {
      id: "ap",
      name: { en: "AP Tools", zh: "AP 工具" },
      description: {
        en: "Simplify your accounts payable workflow.",
        zh: "让应付账款的日常处理更清晰、高效。",
      },
      icon: "calculator",
      accent: "teal",
      order: 20,
    },
    {
      id: "rm",
      name: { en: "RM Tools", zh: "RM 工具" },
      description: {
        en: "Review renewals and manage property information.",
        zh: "核对续租变化，处理物业管理资料。",
      },
      icon: "building",
      accent: "violet",
      order: 30,
    },
  ],
  tools: [
    {
      id: "project-search",
      name: { en: "Project Search Platform", zh: "项目查询平台" },
      description: {
        en: "Look up strata and residential management projects by project number or strata plan.",
        zh: "按项目编号或 Strata Plan 查询分契与住宅管理项目。",
      },
      url: "https://zeyongj.github.io/",
      categoryId: "global",
      tags: ["Projects", "Strata", "RM", "查询", "物业"],
      icon: "search",
      featured: true,
      visible: true,
      status: "active",
      order: 10,
    },
    {
      id: "bc-hydro",
      name: { en: "BC Hydro Extractor", zh: "BC Hydro 信息提取" },
      description: {
        en: "Extract account, amount and reference details from remittance text or screenshots.",
        zh: "从付款通知文字或截图中提取账户、金额和参考编号。",
      },
      url: "https://bc-hydro-extractor.vercel.app/",
      categoryId: "ap",
      tags: ["BC Hydro", "Remittance", "OCR", "付款", "提取"],
      icon: "zap",
      featured: false,
      visible: true,
      status: "active",
      order: 10,
    },
    {
      id: "financial-distribution",
      name: { en: "Financial Distribution Tool", zh: "财务分配工具" },
      description: {
        en: "Turn monthly distribution workbooks into FA, FA + AR or FA + AP + AR CSV files.",
        zh: "将每月分配工作簿转换为 FA、FA + AR 或 FA + AP + AR 的 CSV 文件。",
      },
      url: "https://fa-converter.vercel.app/",
      categoryId: "ap",
      tags: ["Financial", "FA", "AR", "CSV", "分配", "财务"],
      icon: "chart",
      featured: false,
      visible: true,
      status: "active",
      order: 20,
    },
    {
      id: "ap-count",
      name: { en: "AP Count Tool", zh: "AP 发票统计" },
      description: {
        en: "Count invoices by project and AP clerk, using one shared portfolio distribution.",
        zh: "根据共享的 AP 项目分配，按项目及 AP 人员统计发票数量。",
      },
      url: "https://ap-count.vercel.app/",
      categoryId: "ap",
      tags: ["Invoices", "Portfolio", "Count", "发票", "统计"],
      icon: "count",
      featured: false,
      visible: true,
      status: "active",
      order: 30,
    },
    {
      id: "supplier-tracker",
      name: {
        en: "Supplier Tracker - Compliance Management System",
        zh: "供应商追踪与合规管理",
      },
      description: {
        en: "Access the supplier compliance management system.",
        zh: "进入供应商追踪与合规管理系统。",
      },
      url: "https://supplier-track.netlify.app/",
      categoryId: "ap",
      tags: ["Suppliers", "Compliance", "Tracking", "供应商", "合规"],
      icon: "file",
      featured: false,
      visible: true,
      status: "active",
      order: 40,
    },
    {
      id: "rsu-comparison",
      name: { en: "RSU Comparison Tool", zh: "RSU 对比工具" },
      description: {
        en: "Compare old and new RSU workbooks to review missing renewals and changed records.",
        zh: "对比新旧 RSU 工作簿，核对缺失的续租项目及记录变化。",
      },
      url: "https://rancho-rsu-compare.vercel.app/",
      categoryId: "rm",
      tags: ["RSU", "Excel", "Renewals", "Comparison", "续租", "对比"],
      icon: "building",
      featured: false,
      visible: true,
      status: "active",
      order: 10,
    },
  ],
};

export const freshDefaultCatalog = (): HubCatalog =>
  structuredClone(initialCatalog);
