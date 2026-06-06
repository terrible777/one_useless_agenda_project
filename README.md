# AI 待办助手

移动端优先的 Next.js + TypeScript PWA 待办应用，面向高校教务场景。

当前功能：

- DeepSeek AI 分析自然语言任务
- 待确认任务卡片
- 任务新增、编辑、删除、状态修改、拖拽排序
- localStorage 本地缓存
- Supabase 单用户自动云端同步
- 同步状态面板：最近成功时间、最近失败原因、手动同步
- PWA manifest、service worker、安卓 Chrome 添加到主屏幕
- 页面打开时的前台提醒调度
- 不显示通知权限状态面板

> 当前提醒功能仍是“前台提醒测试版”：只有页面打开时才会每 30 秒检查一次提醒，不是后台 Push。

## 项目架构

```text
浏览器
  ↓
Next.js 页面与 API Routes
  ↓
Supabase tasks 表
```

浏览器不会直接读写 Supabase 任务表。任务同步统一通过 Next.js API Route：

- `GET /api/tasks`：读取云端任务
- `POST /api/tasks`：创建或更新任务
- `DELETE /api/tasks?id=xxx`：删除单个任务
- `DELETE /api/tasks/clear`：清空云端任务

## 本地开发

安装依赖：

```bash
npm install
```

复制环境变量模板：

```bash
copy .env.example .env.local
```

启动开发服务器：

```bash
npm run dev
```

访问：

```text
http://localhost:3000
```

## 环境变量

`.env.local` 示例：

```text
DEEPSEEK_API_KEY=你的 DeepSeek API Key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
NEXT_PUBLIC_USE_MOCK_AI=false

NEXT_PUBLIC_SUPABASE_URL=你的 Supabase Project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=你的 Supabase anon key
```

说明：

- `DEEPSEEK_API_KEY` 只在服务端读取，不会暴露到前端。
- `NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 用于 Next.js API Route 访问 Supabase。
- 当前版本不需要同步密钥，不需要登录，不需要注册。
- 修改 `.env.local` 后需要重启 `npm run dev`。

## Supabase 建表

1. 打开 Supabase 并创建项目。
2. 进入 SQL Editor。
3. 执行以下 SQL：

```sql
create table if not exists public.tasks (
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

create index if not exists tasks_sort_order_idx
  on public.tasks (sort_order);

alter table public.tasks disable row level security;
```

当前项目只给单用户使用，不做 Supabase Auth、多用户、注册或登录。部署地址本身请妥善保管。

## 自动同步

同步规则：

- 页面加载时先读取 localStorage，快速显示本地缓存。
- 然后自动请求 `GET /api/tasks` 拉取 Supabase 云端任务。
- 新增任务后自动 `POST /api/tasks`。
- 编辑任务后自动 `POST /api/tasks`。
- 状态修改后自动 `POST /api/tasks`。
- 拖拽排序后自动 `POST /api/tasks`。
- 删除任务后自动 `DELETE /api/tasks?id=xxx`。
- 页面重新获得焦点或从后台回到前台时，会再次尝试拉取云端任务。
- 同步失败不会影响本地使用；任务会保存在 localStorage。
- 同步失败时页面会显示：`云端同步失败，已保存在本地`。

为什么电脑和手机会自动同步：

- 电脑和手机访问同一个 Vercel 部署地址。
- 两端都会调用同一组 Next.js API Routes。
- API Routes 读写同一个 Supabase `tasks` 表。
- 所以一端修改任务后，另一端刷新、回到前台或点击“手动同步”即可看到云端数据。

## DeepSeek AI

真实 AI：

```text
NEXT_PUBLIC_USE_MOCK_AI=false
```

Mock 模式：

```text
NEXT_PUBLIC_USE_MOCK_AI=true
```

Mock 模式不会请求 `/api/analyze`，也不会调用 DeepSeek。

## 生产构建

本地检查生产构建：

```bash
npm run lint
npm run build
npm run start
```

访问：

```text
http://localhost:3000
```

## Vercel 部署

1. 将项目提交到 GitHub。
2. 在 Vercel 新建项目并导入仓库。
3. Framework Preset 选择 `Next.js`。
4. Build Command 使用默认值：

```bash
npm run build
```

5. 在 Vercel Project Settings 的 Environment Variables 中添加：

```text
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
NEXT_PUBLIC_USE_MOCK_AI=false

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

6. Deploy。

部署后不需要运行 `npm run dev`。原因是：

- `npm run dev` 只用于本地开发。
- Vercel 会在部署时运行 `npm run build`。
- 部署完成后，Vercel 自动托管静态页面、PWA 资源和 Next.js Serverless API Routes。
- `/api/analyze`、`/api/tasks`、`/api/tasks/clear` 都会在 Vercel Serverless 环境中按需运行。

## Vercel 兼容性说明

- `/api/analyze` 只从 `process.env` 读取 DeepSeek 环境变量，适合 Vercel Serverless。
- `/api/tasks` 和 `/api/tasks/clear` 只从 `process.env` 读取 Supabase 环境变量，适合 Vercel Serverless。
- 所有 API Route 都不依赖本地终端或本地文件写入。
- DeepSeek API Key 不会进入前端 bundle。
- Supabase 请求由服务端 API Route 发起。

## PWA 检查

生产环境需要能访问：

```text
/manifest.json
/sw.js
/icons/icon-192.png
/icons/icon-512.png
```

当前 service worker 注册路径：

```ts
navigator.serviceWorker.register("/sw.js");
```

这些文件都位于 `public/`，部署到 Vercel 后会从站点根路径访问，不存在额外路径前缀问题。

## 安卓 Chrome 安装 PWA

1. 用安卓 Chrome 打开 Vercel HTTPS 地址。
2. 等页面加载完成。
3. 打开 Chrome 菜单。
4. 点击“安装应用”或“添加到主屏幕”。
5. 从主屏幕打开应用，确认它以独立窗口运行。

如果没有看到安装入口，请检查：

- 是否通过 HTTPS 访问。
- `/manifest.json` 是否可访问。
- `/sw.js` 是否注册成功。
- 图标路径是否可访问。

## 当前同步方案局限

- 只适合单用户。
- 没有账号系统。
- 没有 Supabase Auth。
- 没有复杂冲突合并；重新拉取云端时会以云端数据为准。
- 按当前需求不使用同步密钥，部署地址本身需要妥善保管。
- 更严格的生产安全方案应引入 Vercel 访问保护、正式登录系统、Supabase Auth 或 RLS 策略。

## 当前提醒功能局限

- 只在页面打开时检查提醒。
- 默认每 30 秒检查一次 localStorage 中的任务。
- 不支持后台 Push、VAPID、服务端定时任务。
- 页面关闭、浏览器进程被杀或手机休眠时不会可靠提醒。
