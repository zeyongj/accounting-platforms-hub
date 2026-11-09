# Accounting Platforms Hub

A bilingual directory for project search, accounts payable, and residential management platforms. Visitors can search, filter, bookmark, copy links, and open tools. The verified Owner publishes one cloud-backed catalog for everyone.

**Website:** [Accounting Platforms Hub](https://accounting-platforms-hub.vercel.app/)

**Source:** [zeyongj/accounting-platforms-hub](https://github.com/zeyongj/accounting-platforms-hub)

## Included platforms

| Category     | Platform                                                                               |
| ------------ | -------------------------------------------------------------------------------------- |
| Global Scope | [Project Search Platform](https://zeyongj.github.io/)                                  |
| AP Tools     | [BC Hydro Extractor](https://bc-hydro-extractor.vercel.app/)                           |
| AP Tools     | [Financial Distribution Tool](https://fa-converter.vercel.app/)                        |
| AP Tools     | [AP Count Tool](https://ap-count.vercel.app/)                                          |
| AP Tools     | [Supplier Tracker - Compliance Management System](https://supplier-track.netlify.app/) |
| RM Tools     | [RSU Comparison Tool](https://rancho-rsu-compare.vercel.app/)                          |

The current directory includes six platforms: one Global Scope tool, four AP tools, and one RM tool. Supplier Tracker provides access to the supplier compliance management system.

## Visitor guide

- English is the first-visit default. The global EN / 中文 selector remembers your choice in this browser.
- Search names, descriptions, categories, and tags in either language. Latin search terms match word prefixes; Chinese terms also match within text. Multiple terms must all match.
- Choose a category or Favorites, and sort by configured order or name. Press `/` outside an editor to focus search; press Escape in search to clear it.
- Bookmarks are personal to this browser and synchronize across its tabs. They do not create an account or change the shared catalog. If storage is blocked, bookmarks remain available for the current visit.
- Each platform opens in a new tab. Copy link copies the saved URL. Maintenance labels are set by the Owner; they are not live uptime checks.
- The hub does not collect search or launch analytics. Hosting and sign-in providers can process normal service/security metadata. Linked platforms have their own data handling and login requirements.

## Owner guide

Choose **Owner sign in** and use the verified primary email configured in `HUB_OWNER_EMAIL`. Accounting Platforms Hub has its own Clerk resource, separate from AP Count. First use may require registration and email verification in this new resource. Passwords and verification codes are entered only in Clerk's sign-in form.

Open **Manage directory**:

1. **Tools:** add, edit, or delete entries. Configure English/Chinese names and descriptions, URL, category, searchable tags, icon, featured state, visibility, availability, and display order. Lower order numbers appear first within the configured sort.
2. **Categories:** add and edit names, descriptions, icons, colors, and order. Move or delete a category's tools before deleting that category. IDs are internal stable identifiers, not user-facing names.
3. **Review & publish:** changes stay in your draft until reviewed and published together. Preview the changes and visible tools before confirming. A successful publication is shared by all visitors. Open pages refresh when revisited after 30 seconds, or when refreshed manually.
4. **Export draft / Import backup:** backups contain catalog settings only. Import validates the complete schema and changes the local draft; publishing is still required. Import never supplies an authoritative cloud revision. Export a backup before leaving a long editing session: drafts are held in memory and browser/tab closure can discard them.
5. **History:** inspect private versions with server-recorded actor/time. Restoring an earlier catalog publishes it as a new version. Up to 30 versions are retained; the oldest versions are removed sooner if the 3 MiB storage bound is reached. The initial directory is retained as a baseline until normal retention removes it.

Deleting from the draft can be undone before another draft edit. Closing or loading the latest catalog with unsaved changes asks for confirmation. Published deletions can be reversed by restoring a retained version or importing a backup and publishing it.

If another session publishes first, a stale operation returns a revision conflict. The draft stays available for export; load and review the latest catalog before trying again. Unknown network outcomes also require a refresh rather than an automatic retry.

The server checks Clerk's current verified primary email and account state for every protected request. Client roles, typed emails, unverified/secondary email addresses, and imported JSON do not grant ownership. Hidden tools and editor identities are available only through the protected management endpoint.

## Limits and persistence

- Up to 200 tools and 30 categories; English names required, Chinese text may fall back to English.
- Public HTTP/HTTPS website URLs only, without embedded credentials or local/private network addresses. Duplicate canonical URLs and dangling categories are rejected. The server does not fetch owner-entered URLs.
- JSON requests are bounded to 1 MiB; stored catalog/history to 3 MiB. Only explicit schema fields are retained.
- Private Blob storage holds the catalog and private version history. A missing file uses the checked-in seed; outages or corrupt files fail closed and never reset published data.
- Reads use identity encoding and origin data so the document and strong ETag come from the same response. Conditional writes require that exact ETag, including during restoration. Concurrent changes cannot silently overwrite each other.

## Development

Node.js 22.12+ or 24 LTS; npm. Configure the Vercel project before starting a full local session:

```sh
npm ci
vercel link --project accounting-platforms-hub --scope YOUR_TEAM
vercel env pull .env.local --environment=development
vercel dev --listen 4173
```

Required configuration names are in `.env.example`. `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is intentionally browser-visible. `CLERK_SECRET_KEY` and Blob credentials are server-only and must never have browser-exposed prefixes. `HUB_OWNER_EMAIL` is a server-side identity allowlist; `HUB_PUBLIC_ORIGIN` is the exact canonical HTTPS origin. Protected production requests accept only that configured origin; development additionally supports local ports 4173/5173. Use the canonical site for Owner sign-in, not arbitrary preview URLs.

Production uses an isolated private Blob store. Development and preview use another store; never run tests against production data. Clerk's independent Hobby resource supplies authentication through managed environment variables. This personal demonstration uses a Clerk development instance with Vercel deployment; a custom-domain production authentication rollout is a separate configuration task.

```sh
npm test
npm run build
vercel build --prod
npm run check:functions
```

Plain `npm run dev` serves the frontend only; `vercel dev` is required for the real APIs. The compiled-function check boots all emitted Node ESM handlers and confirms anonymous write/history requests are rejected.

## Deployment and costs

Vercel configuration: Vite, Node 24, `npm ci`, `npm run build`, output `dist`. GitHub Actions validates tests/builds and Vercel's Git connection publishes `main`. Secrets, local QA helpers, dependencies, and build output are ignored by Git.

This deployment is a personal, non-commercial demonstration on Vercel Hobby. Clerk uses its $0 Hobby plan with no enhanced paid add-ons; storage uses Vercel Blob's free allowances. No paid upgrade is required for the current demonstration. Free quotas and provider terms apply and can change; this is not a promise of unlimited hosting. See [Vercel Hobby](https://vercel.com/docs/plans/hobby), [Blob usage](https://vercel.com/docs/vercel-blob/usage-and-pricing), and [Clerk pricing](https://clerk.com/pricing).

## 中文说明

Accounting Platforms Hub 将 **Global Scope、AP Tools、RM Tools** 的六个平台集中展示，支持中英文搜索、分类筛选、收藏、复制链接和新标签页打开。首次访问默认英文；语言与收藏保存在当前浏览器，目录配置则由所有访客共享。当前包括 1 个 Global Scope 工具、4 个 AP 工具、1 个 RM 工具；Supplier Tracker 用于进入供应商追踪与合规管理系统。

### Owner 管理

点击 **Owner 登录**，使用服务器指定且主要邮箱已验证的账户。新导航站使用独立 Clerk 登录资源，与 AP Count 分开；首次使用可能需要在新资源中注册并完成验证。密码、验证码只在登录窗口输入。

进入 **管理导航**：

1. 在“工具”中新增、编辑、删除入口，设置中英文文字、链接、分类、标签、图标、精选、可见性、维护状态及顺序。
2. 在“分类”中维护分类。分类仍有工具时不能删除，需先移动或删除其工具。
3. 所有修改先保留为草稿，核对“发布预览”后统一发布。删除草稿内容后，可在进行下一次编辑前撤销。关闭或重新载入时会提示未保存修改；浏览器或标签页关闭会丢失内存中的草稿，长时间编辑请先导出备份。
4. 导入备份只修改草稿，仍需发布；不会覆盖云端版本校验。错误链接、重复 URL、缺失分类或超限字段会阻止发布。
5. “历史”显示操作人、时间和版本内容。恢复旧目录会新增一个版本，最多保留最近 30 版；达到 3 MiB 容量上限时会提前移除最旧版本。初始目录会作为基线保留，直到正常历史清理将其移除。

只有经过服务器验证的 Owner 能管理目录和查看历史。普通访客无法获取隐藏工具或操作人信息。多人同时编辑时，较旧的发布会被拒绝，草稿仍可导出；请载入最新配置并复核后重试。

### 使用与隐私

收藏和语言偏好只属于当前浏览器；工具目录由云端共享。导航页不记录搜索内容或打开平台的使用分析，托管与登录服务仍可能处理正常的服务和安全元数据。维护状态由 Owner 设置，并非实时可用性检测；各个平台有独立的数据处理和登录规则。

开发与检查命令见上方英文说明。正式、开发/预览存储相互隔离；不要向正式环境写入测试数据。当前发布使用免费方案与额度，定位为个人非商业演示，额度和服务条款可能变化。
