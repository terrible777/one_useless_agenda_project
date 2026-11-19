# AI 待办助手

移动端优先的 PWA 待办工具，面向高校教务场景。支持 Cloudflare Pages 和 Vercel 两种部署；DeepSeek API Key 与 Supabase service role key 都只在服务端环境变量中读取。

## 当前架构

```text
浏览器
  ├─ localStorage：本地缓存、离线兜底、导入导出备份
  └─ /api/*
      ├─ Cloudflare Pages Functions / Next.js API：AI 接口、同步接口
      ├─ DeepSeek：待办 / 排考 / 排课 AI 整理
      └─ Supabase：待办和排考 / 排课云端存储
```

电脑和手机访问同一个部署地址时，会通过 Supabase 同步同一份待办、排考要求和排课要求。当前版本不做登录、不做 Supabase Auth、不做同步密钥保护。

## 本地开发

安装依赖：

```bash
npm install
```

启动前端开发服务：

```bash
npm run dev
```

访问：

```text
http://localhost:3000
```

本地 `next dev` 会同时运行页面和 Next.js API 兼容入口，读取 `.env.local`。如果暂时没有 DeepSeek 配置，可以设置：

```env
NEXT_PUBLIC_USE_MOCK_AI=true
```

如果要验证 Cloudflare Pages Functions 的实际运行方式，先执行 `npm run build`，将服务端环境变量放到项目根目录的 `.dev.vars`（不要提交），然后运行：

```bash
npx wrangler@4 pages dev out --port 8788
```

通过 `http://localhost:8788` 测试 Cloudflare 版本。`localhost:3000` 使用 Next.js API，二者复用同一套数据库和 AI 处理代码。
参考 [Cloudflare Pages 本地运行文档](https://developers.cloudflare.com/pages/functions/local-development/)。

## 环境变量

`.env.local` 示例：

```env
DEEPSEEK_API_KEY=你的 DeepSeek API Key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
NEXT_PUBLIC_USE_MOCK_AI=false

SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=你的 Supabase service_role secret key
```

说明：

- `DEEPSEEK_API_KEY` 只在 Cloudflare Pages Functions 中读取，不会暴露到前端。
- `SUPABASE_SERVICE_ROLE_KEY` 只在 Cloudflare Pages Functions 中读取，不要提交到 GitHub。
- 不需要 `NEXT_PUBLIC_SUPABASE_URL` 或 `NEXT_PUBLIC_SUPABASE_ANON_KEY`。
- `SUPABASE_URL` 兼容读取旧的 `NEXT_PUBLIC_SUPABASE_URL`，推荐部署时统一使用前者。
- `SUPABASE_SERVICE_ROLE_KEY` 可以填写新版 `sb_secret_...` Secret key 或旧版 `service_role` JWT；两者都只用于服务端。
- 新版 Secret key 通过 `apikey` 请求头发送，旧版 JWT 才使用 `Authorization: Bearer`，见 [Supabase API Key 文档](https://supabase.com/docs/guides/getting-started/api-keys)。
- 当前版本不使用 Supabase Auth，也不需要登录系统。

## Supabase 建表

在 Supabase Dashboard 的 SQL Editor 中执行：

```sql
create table if not exists tasks (
  id text primary key,
  title text not null,
  deadline_date text null,
  deadline_time text null,
  deadline_at text null,
  status text not null,
  note text,
  source_text text,
  sort_order integer,
  created_at text not null,
  updated_at text not null
);

create table if not exists requirement_notes (
  id text primary key,
  type text not null check (type in ('exam', 'course')),
  content text not null,
  created_at text not null,
  updated_at text not null
);
```

如果表开启了 Row Level Security，Cloudflare Functions 使用 `SUPABASE_SERVICE_ROLE_KEY` 访问，通常可以绕过 RLS。不要把 service role key 写进前端环境变量。

## 生产构建

构建命令：

```bash
npm run build
```

本项目是 Next.js 静态导出，生产输出目录是：

```text
out
```

不是 Vite 项目的 `dist`。

## Cloudflare Pages 部署

1. 将代码推送到 GitHub。
2. 打开 Cloudflare Dashboard，进入 Workers & Pages。
3. 创建 Pages 项目，选择连接 GitHub 仓库。
4. Framework preset 可选择 Next.js 或 None。
5. Build command 填：

```text
npm run build
```

6. Build output directory 填：

```text
out
```

7. 在 Cloudflare Pages 的环境变量中配置：

```env
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
NEXT_PUBLIC_USE_MOCK_AI=false
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

8. 部署完成后访问 Cloudflare Pages 提供的 HTTPS 地址。

部署后不需要运行 `npm run dev`。Cloudflare Pages 会托管 `out` 中的静态页面，并自动挂载 `functions/api/*` 下的 AI 和 Supabase 同步接口。

## Vercel 兼容部署

继续使用原来的 Vercel 生产网址时，将本次修复推送到已连接的 GitHub 仓库。仓库中的 `vercel.json` 会选择 `npm run build:vercel`，使用 Next.js 服务端构建；不要把 Vercel 的输出目录固定成 `out`。

Vercel Production 环境配置与上面相同的 `DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL`、`DEEPSEEK_MODEL`、`SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY`。旧的 `NEXT_PUBLIC_SUPABASE_URL` 仍兼容读取。修改环境变量后重新部署。

本地检查 Vercel 构建：

```bash
npm run build:vercel
npm run start
```

`src/pages/api/` 是 Vercel / Next.js 入口，转交给 `functions/api/` 的同一套处理逻辑。Cloudflare 继续运行 `npm run build` 导出 `out`，保持原来的部署方式；两种平台均由服务端访问 Supabase，Key 不会进入前端。

## API Route

Cloudflare Pages Functions 和 Next.js API 提供相同接口：

- `POST /api/analyze`：DeepSeek 待办分析。
- `POST /api/exam-requirements`：DeepSeek 排考要求整理。
- `POST /api/course-requirements`：DeepSeek 排课要求整理。
- `GET /api/tasks`：读取 Supabase 待办任务。
- `POST /api/tasks`：新增或更新 Supabase 待办任务。
- `DELETE /api/tasks?id=xxx`：删除 Supabase 待办任务。
- `DELETE /api/tasks/clear`：清空 Supabase 待办任务。
- `GET /api/requirements?type=exam|course`：读取排考 / 排课要求。
- `POST /api/requirements`：保存排考 / 排课要求。
- `DELETE /api/requirements?type=exam|course`：清空排考 / 排课要求。

## 功能说明

- 待办事项：AI 分析、手动新建、编辑、删除、状态修改、拖拽排序、localStorage 缓存、Supabase 云同步。
- 排考要求整理：AI 整理、手动新增、单条编辑、单条删除、复制完整结果、localStorage 缓存、Supabase 云同步。
- 排课要求整理：AI 整理、手动新增、单条编辑、单条删除、复制完整结果、localStorage 缓存、Supabase 云同步。
- 本地数据备份：导出 `agenda-backup.json`，导入前确认，导入成功后自动刷新。
- PWA：安卓 Chrome 可添加到主屏幕。
- 前台提醒：页面打开时检查本地任务提醒，不是后台 Push。

## 同步验证

1. 在电脑端打开部署地址，新增或编辑一个待办。
2. 在手机端打开同一个部署地址，刷新页面或点击底部“从云端同步”。
3. 手机端应看到电脑端的任务变化。
4. 在手机端修改或删除任务。
5. 电脑端刷新页面或点击“从云端同步”，应看到手机端变化。
6. 对排考要求、排课要求重复同样流程。

如果同步失败，页面底部会显示具体错误。本地数据仍会保存在浏览器 `localStorage` 中。

页面可见时每 30 秒刷新一次云端数据；切回应用、窗口重新获得焦点或网络恢复时会立即检查。上传失败的修改保存在本地待同步队列，刷新和恢复网络后先重试上传，再拉取云端，避免旧数据覆盖尚未上传的修改。同一设备的写入按顺序发送，防止连续编辑或拖动时旧请求覆盖新内容。

首次启用同步时，如果云端为空但本机有历史内容，不会自动把缓存回填到云端；确认本机数据完整后使用“上传本机数据”迁移。已初始化设备会接受云端空列表，防止已删除的数据重新出现。

排查部署问题时，分别访问部署地址的 `/api/tasks` 和 `/api/requirements?type=exam`：应该返回 JSON。404 或 HTML 通常表示 Pages Functions 未部署；503 表示环境变量未配置；Supabase 401 表示 Key 有问题；连接失败时检查 Supabase Dashboard 中项目是否已暂停、URL 是否正确。电脑和手机应访问同一生产部署地址，并连接同一个 Supabase 项目。

## 数据备份

页面底部“数据备份与同步”面板提供：

- 从云端同步：手动拉取 Supabase 数据并覆盖本地缓存。
- 上传本机数据：把当前浏览器本地数据上传到 Supabase。
- 导出数据：下载 `agenda-backup.json`，包含所有 `agenda_generate_*` 本地数据。
- 导入数据：选择备份 JSON，确认后覆盖当前本地数据并刷新页面。

导出的数据包含待办事项、排考要求、排课要求、提醒日志、颜色配置和用户设置。

## PWA 安装

安卓 Chrome：

1. 打开部署后的 HTTPS 地址。
2. 点击右上角菜单。
3. 选择“添加到主屏幕”或“安装应用”。
4. 安装后从桌面图标打开。

如果没有看到安装入口，请确认：

- 页面通过 HTTPS 访问。
- `/manifest.json` 可访问。
- `/sw.js` 可访问。
- `/icons/icon-192.png` 和 `/icons/icon-512.png` 可访问。

## 当前局限

- 本版不加登录、不加同步密钥；知道接口的人理论上可能读写你的云端数据。
- 跨设备冲突不做复杂合并，最后一次成功同步的数据优先。
- 前台提醒只在页面打开时运行，不是后台 Push。
- 没有多用户、权限系统、Google Calendar、Excel 导出或 Word 导出。
