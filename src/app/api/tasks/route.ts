import { NextRequest, NextResponse } from "next/server";
import {
  deleteCloudTask,
  getSupabaseSyncMode,
  listCloudTasks,
  SupabaseConfigError,
  SupabaseRequestError,
  upsertCloudTasks,
} from "@/lib/supabaseTasks";
import type { Task, TaskStatus } from "@/types/task";

export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTaskStatus(value: unknown): value is TaskStatus {
  return value === "not_started" || value === "in_progress" || value === "completed";
}

function readNullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function readOptionalString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function readOptionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseIncomingTask(value: unknown): Task | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.id !== "string" ||
    typeof value.title !== "string" ||
    !value.title.trim() ||
    !isTaskStatus(value.status)
  ) {
    return null;
  }

  return {
    id: value.id,
    title: value.title.trim(),
    deadlineDate: readNullableString(value.deadlineDate),
    deadlineTime: readNullableString(value.deadlineTime),
    deadlineAt: readNullableString(value.deadlineAt),
    status: value.status,
    note: typeof value.note === "string" ? value.note : "",
    sourceText: typeof value.sourceText === "string" ? value.sourceText : "",
    sortOrder: readOptionalNumber(value.sortOrder),
    createdAt: readOptionalString(value.createdAt),
    updatedAt: readOptionalString(value.updatedAt),
  };
}

function parseTaskBody(body: unknown) {
  const rawTasks = Array.isArray(body)
    ? body
    : isRecord(body) && Array.isArray(body.tasks)
      ? body.tasks
      : isRecord(body) && body.task
        ? [body.task]
        : [body];

  const tasks = rawTasks.map(parseIncomingTask);

  if (tasks.some((task) => task === null)) {
    return null;
  }

  return tasks as Task[];
}

function createErrorResponse(error: unknown) {
  if (error instanceof SupabaseConfigError) {
    console.error("Supabase task API is not configured.", error);
    return NextResponse.json({ error: "云端同步尚未配置：缺少 Supabase 环境变量" }, { status: 503 });
  }

  if (error instanceof SupabaseRequestError) {
    console.error("Supabase task API failed.", {
      status: error.status,
      summary: error.summary,
    });

    return NextResponse.json(
      { error: `Supabase 请求失败（${error.status}）：${error.summary}` },
      { status: 502 },
    );
  }

  console.error("Task sync API failed.", error);
  return NextResponse.json({ error: "云端同步失败：任务 API 出错" }, { status: 500 });
}

export async function GET() {
  try {
    return NextResponse.json(await listCloudTasks());
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as unknown;
    const tasks = parseTaskBody(body);

    if (!tasks) {
      return NextResponse.json({ error: "任务数据格式无效" }, { status: 400 });
    }

    console.info("Upserting tasks to Supabase.", {
      count: tasks.length,
      mode: getSupabaseSyncMode(),
    });

    return NextResponse.json(await upsertCloudTasks(tasks));
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  const taskId = request.nextUrl.searchParams.get("id");

  if (!taskId) {
    return NextResponse.json({ error: "缺少任务 id" }, { status: 400 });
  }

  try {
    console.info("Deleting task from Supabase.", {
      mode: getSupabaseSyncMode(),
      taskId,
    });

    await deleteCloudTask(taskId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return createErrorResponse(error);
  }
}
