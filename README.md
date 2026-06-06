# AI 待办助手

移动端优先的 PWA 待办工具，面向高校教务场景。当前版本使用浏览器 `localStorage` 保存数据，并通过 Cloudflare Pages Functions 保护 DeepSeek API Key。

## 当前架构

```text
浏览器页面
  ├─ localStorage：待办、排考要求、排课要求、提醒日志、颜色配置、用户设置
  ├─ PWA 静态资源：manifest、service worker、icons
  └─ Cloudflare Pages Functions：DeepSeek AI 分析接口
```

不再使用 Supabase、数据库、Vercel Functions 或任何云端任务同步。电脑和手机之间迁移数据请使用“导出数据 / 导入数据”。

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

本地 `next dev` 主要用于前端界面开发。Cloudflare Pages Functions 需要通过 Cloudflare Pages 环境运行；如果只是本地调 UI，可设置：

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
```

说明：

- `DEEPSEEK_API_KEY` 只在 Cloudflare Pages Functions 中读取，不会暴露到前端。
- `NEXT_PUBLIC_USE_MOCK_AI=true` 时，待办 AI 分析使用本地 mock。
- 已移除 Supabase，因此不再需要 `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`。

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
```

8. 部署完成后访问 Cloudflare Pages 提供的 HTTPS 地址。

部署后不需要运行 `npm run dev`。Cloudflare Pages 会托管 `out` 中的静态页面，并自动挂载 `functions/api/*` 下的 DeepSeek AI 接口。

因为数据全部保存在浏览器本地，本项目部署后不会产生数据库或服务器存储费用；真实 AI 调用只会消耗 DeepSeek API 额度。

## 功能说明

- 待办事项：AI 分析、手动新建、编辑、删除、状态修改、拖拽排序、localStorage 持久化。
- 排考要求整理：AI 整理、手动新增、单条编辑、单条删除、复制完整结果、localStorage 持久化。
- 排课要求整理：AI 整理、手动新增、单条编辑、单条删除、复制完整结果、localStorage 持久化。
- 本地数据备份：导出 `agenda-backup.json`，导入前确认，导入成功后自动刷新。
- PWA：安卓 Chrome 可添加到主屏幕。
- 前台提醒：页面打开时检查本地任务提醒，不是后台 Push。

## 数据备份

页面底部“本地数据”面板提供：

- 导出数据：下载 `agenda-backup.json`，包含所有 `agenda_generate_*` 本地数据。
- 导入数据：选择备份 JSON，确认后覆盖当前本地数据并刷新页面。

导出的数据包含待办事项、排考要求、排课要求、提醒日志、颜色配置和用户设置。换手机或换浏览器时，请先在旧设备导出，再在新设备导入。

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

- 数据只保存在当前浏览器本地，不再自动同步电脑和手机。
- 跨设备迁移需要手动导出/导入备份。
- 前台提醒只在页面打开时运行，不是后台 Push。
- 没有数据库、登录、多用户、权限系统或 Supabase Auth。
