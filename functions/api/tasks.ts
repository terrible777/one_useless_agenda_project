import {
  createJsonResponse,
  createSupabaseErrorResponse,
  deleteTask,
  getTasks,
  type SupabaseEnv,
  upsertTask,
} from "../_lib/supabase";
import type { Task } from "../../src/types/task";

type PagesFunctionContext = {
  env: SupabaseEnv;
  request: Request;
};

function getApiErrorMessage(data: unknown) {
  if (typeof data === "object" && data !== null) {
    const candidate = data as { error?: unknown; message?: unknown };

    if (typeof candidate.error === "string" && candidate.error.trim()) {
      return candidate.error;
    }

    if (typeof candidate.message === "string" && candidate.message.trim()) {
      return candidate.message;
    }
  }

  return "请求格式不正确";
}

function isTaskLike(value: unknown): value is Task {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const task = value as Partial<Task>;

  return (
    typeof task.id === "string" &&
    typeof task.title === "string" &&
    typeof task.status === "string" &&
    typeof task.note === "string" &&
    typeof task.sourceText === "string"
  );
}

export async function onRequestGet({ env }: PagesFunctionContext) {
  try {
    return createJsonResponse(await getTasks(env));
  } catch (error) {
    console.error("GET /api/tasks failed.", error);
    return createSupabaseErrorResponse(error, "读取云端任务失败");
  }
}

export async function onRequestPost({ env, request }: PagesFunctionContext) {
  try {
    let body: unknown;

    try {
      body = await request.json();
    } catch (error) {
      console.error("POST /api/tasks received invalid JSON.", error);
      return createJsonResponse({ error: "请求 JSON 格式不正确" }, 400);
    }

    const task = isTaskLike(body)
      ? body
      : typeof body === "object" && body !== null && "task" in body && isTaskLike(body.task)
        ? body.task
        : null;

    if (!task) {
      return createJsonResponse({ error: getApiErrorMessage(body) }, 400);
    }

    return createJsonResponse(await upsertTask(env, task));
  } catch (error) {
    console.error("POST /api/tasks failed.", error);
    return createSupabaseErrorResponse(error, "保存云端任务失败");
  }
}

export async function onRequestDelete({ env, request }: PagesFunctionContext) {
  try {
    const url = new URL(request.url);
    const taskId = url.searchParams.get("id")?.trim();

    if (!taskId) {
      return createJsonResponse({ error: "缺少任务 id" }, 400);
    }

    await deleteTask(env, taskId);

    return createJsonResponse({ ok: true });
  } catch (error) {
    console.error("DELETE /api/tasks failed.", error);
    return createSupabaseErrorResponse(error, "删除云端任务失败");
  }
}
