# AI 待办助手

移动端优先的 PWA 待办工具，面向高校教务场景。当前版本使用 Cloudflare Pages 托管静态页面和 Pages Functions，DeepSeek API Key 与 Supabase service role key 都只在服务端环境变量中读取。

## 当前架构

```text
浏览器
  ├─ localStorage：本地缓存、离线兜底、导入导出备份
  └─ /api/*
      ├─ Cloudflare Pages Functions：AI 接口、同步接口
      ├─ DeepSeek：待办 / 排考 / 排课 AI 整理
      └─ Supabase：待办和排考 / 排课云端存储
```

电脑和手机访问同一个 Cloudflare Pages 地址时，会通过 Supabase 同步同一份待办、排考要求和排课要求。当前版本不做登录、不做 Supabase Auth、不做同步密钥保护。

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

本地 `next dev` 适合调前端页面。Cloudflare Pages Functions 在正式部署后由 Cloudflare 运行；本地如果只调 UI，可以设置：

```env
NEXT_PUBLIC_USE_MOCK_AI=true
```

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

## API Route

Cloudflare Pages Functions 提供：

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
