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

```bash
npm install
copy .env.example .env.local
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
SUPABASE_SERVICE_ROLE_KEY=你的 Supabase service_role key
```

说明：

- `DEEPSEEK_API_KEY` 只在服务端读取，不会暴露到前端。
- `NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 用于基础 Supabase 配置。
- `SUPABASE_SERVICE_ROLE_KEY` 只在服务端读取，不能以 `NEXT_PUBLIC_` 开头，也不能写入前端代码。
- 服务端写任务时优先使用 `SUPABASE_SERVICE_ROLE_KEY`，避免 anon key 被 RLS 或权限限制导致“能读但不能写”。
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

create table if not exists public.requirement_notes (
  id text primary key,
  type text not null check (type in ('exam', 'course')),
  content text not null,
  created_at text not null,
  updated_at text not null
);
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
- 同步失败时页面会显示具体错误，例如 `云端同步失败：POST /api/tasks 返回 502：...`。

为什么电脑和手机会自动同步：

- 电脑和手机访问同一个 Vercel 部署地址。
- 两端都会调用同一组 Next.js API Routes。
- API Routes 读写同一个 Supabase `tasks` 表。
- 所以一端修改任务后，另一端刷新、回到前台或点击“手动同步”即可看到云端数据。

## 排考/排课要求整理（云同步版）

首页待办列表下方提供两个独立入口：

- `排考要求`：整理老师关于排考、监考、考试时间安排的要求。
- `排课要求`：整理老师关于排课、上课时间、教室、课程安排的要求。

使用方式：

1. 点击对应入口打开弹窗。
2. 粘贴老师的口语化要求。
3. 点击 `AI整理排考要求` 或 `AI整理排课要求`。
4. 在结果区编辑最终汇总文本。
5. 点击保存后先写入浏览器 localStorage，再通过 `/api/requirements` 同步到 Supabase。
6. 点击 `复制结果` 可复制当前结果区全文。

本地保存 key：

```text
agenda_generate_exam_requirements
agenda_generate_course_requirements
```

要求整理云同步 API Route：

```text
GET /api/requirements?type=exam
GET /api/requirements?type=course
POST /api/requirements
DELETE /api/requirements?type=exam
DELETE /api/requirements?type=course

POST /api/exam-requirements
POST /api/course-requirements
```

`/api/exam-requirements` 和 `/api/course-requirements` 用于调用 DeepSeek 整理文本；`/api/requirements` 用于读写 Supabase `requirement_notes` 表。所有 Supabase 写入都通过 Next.js API Route 在服务端完成，`SUPABASE_SERVICE_ROLE_KEY` 不会进入前端 bundle。

同步规则：

- 打开排考/排课弹窗时，先显示 localStorage 缓存。
- 随后请求 `GET /api/requirements?type=exam` 或 `GET /api/requirements?type=course` 拉取云端内容。
- 如果云端已有记录，会覆盖本地缓存并写回 localStorage。
- 保存时先写 localStorage，再 `POST /api/requirements` 写入 Supabase。
- 清空时先清空 localStorage，再 `DELETE /api/requirements?type=...` 清空云端内容。
- 云端同步失败不会影响本地保存；页面会显示“云端同步失败，已保存在本地”及具体错误摘要。

部署后电脑和手机访问同一个 Vercel 地址，即可看到同一份排考/排课要求。验证方式：电脑端保存排考或排课要求，手机端打开同一弹窗并等待云端拉取；手机端清空后，电脑端重新打开对应弹窗应显示为空。

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

```bash
npm run lint
npm run build
npm run start
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
SUPABASE_SERVICE_ROLE_KEY=
```

6. Deploy。

部署后不需要运行 `npm run dev`。`npm run dev` 只用于本地开发；Vercel 会自动运行 `npm run build`，并托管页面、PWA 静态资源和 Next.js Serverless API Routes。

## 验证云端写入

1. 打开页面新增一个任务。
2. 访问：

```text
https://你的域名/api/tasks
```

3. 应该能看到新增任务。
4. 编辑任务后再次访问 `/api/tasks`，应能看到更新后的字段。
5. 删除任务后再次访问 `/api/tasks`，该任务应消失。

如果页面同步状态面板显示 `POST /api/tasks 返回 502`，优先检查 Vercel 是否配置了 `SUPABASE_SERVICE_ROLE_KEY`。

验证排考/排课要求云同步：

1. 本地或线上打开页面，点击 `排考要求` 或 `排课要求`。
2. 编辑整理结果并保存。
3. 访问：

```text
https://你的域名/api/requirements?type=exam
https://你的域名/api/requirements?type=course
```

4. 应能看到对应 `content`。
5. 在另一台设备打开同一个 Vercel 地址，再打开对应弹窗，应自动拉取云端内容。
6. 点击清空后，再访问对应 `/api/requirements?type=...`，`content` 应为空字符串。

## Vercel 兼容性说明

- `/api/analyze` 只从 `process.env` 读取 DeepSeek 环境变量，适合 Vercel Serverless。
- `/api/tasks` 和 `/api/tasks/clear` 只从 `process.env` 读取 Supabase 环境变量，适合 Vercel Serverless。
- `/api/requirements` 只从 `process.env` 读取 Supabase 环境变量，适合 Vercel Serverless。
- 所有 API Route 都不依赖本地终端或本地文件写入。
- DeepSeek API Key 和 Supabase service role key 不会进入前端 bundle。
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

这些文件都位于 `public/`，部署到 Vercel 后会从站点根路径访问。

## 安卓 Chrome 安装 PWA

1. 用安卓 Chrome 打开 Vercel HTTPS 地址。
2. 等页面加载完成。
3. 打开 Chrome 菜单。
4. 点击“安装应用”或“添加到主屏幕”。
5. 从主屏幕打开应用，确认它以独立窗口运行。

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
