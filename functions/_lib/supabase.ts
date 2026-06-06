import type { Task, TaskStatus } from "../../src/types/task";

export type SupabaseEnv = {
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_URL?: string;
};

type SupabaseTaskRow = {
  created_at: string;
  deadline_at: string | null;
  deadline_date: string | null;
  deadline_time: string | null;
  id: string;
  note: string | null;
  sort_order: number | null;
  source_text: string | null;
  status: TaskStatus;
  title: string;
  updated_at: string;
};

type RequirementKind = "exam" | "course";

type RequirementNoteRow = {
  content: string;
  created_at: string;
  id: string;
  type: RequirementKind;
  updated_at: string;
};

export class SupabaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseConfigError";
  }
}

export class SupabaseHttpError extends Error {
  status: number;
  summary: string;

  constructor(status: number, summary: string) {
    super(`Supabase HTTP ${status}: ${summary}`);
    this.name = "SupabaseHttpError";
    this.status = status;
    this.summary = summary;
  }
}

export function createJsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    status,
  });
}

function sanitizeErrorText(text: string) {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/("apikey"\s*:\s*")[^"]+(")/gi, "$1[redacted]$2")
    .replace(/("api[_-]?key"\s*:\s*")[^"]+(")/gi, "$1[redacted]$2")
    .replace(/(api[_-]?key=)[^&\s]+/gi, "$1[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

async function readSafeErrorSummary(response: Response) {
  try {
    const text = sanitizeErrorText(await response.text());

    if (!text) {
      return response.statusText || "No error body";
    }

    try {
      const data = JSON.parse(text) as { error?: unknown; message?: unknown };
      const message =
        typeof data.message === "string"
          ? data.message
          : typeof data.error === "string"
            ? data.error
            : text;

      return sanitizeErrorText(message);
    } catch {
      return text;
    }
  } catch {
    return response.statusText || "Unable to read error body";
  }
}

function getSupabaseConfig(env: SupabaseEnv) {
  const supabaseUrl = env.SUPABASE_URL?.replace(/\/+$/, "");
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new SupabaseConfigError("缺少 SUPABASE_URL");
  }

  if (!serviceRoleKey) {
    throw new SupabaseConfigError("缺少 SUPABASE_SERVICE_ROLE_KEY");
  }

  return {
    restUrl: `${supabaseUrl}/rest/v1`,
    serviceRoleKey,
  };
}

async function requestSupabase<T>(
  env: SupabaseEnv,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const { restUrl, serviceRoleKey } = getSupabaseConfig(env);
  const headers = new Headers(init.headers);

  headers.set("apikey", serviceRoleKey);
  headers.set("Authorization", `Bearer ${serviceRoleKey}`);

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${restUrl}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    throw new SupabaseHttpError(response.status, await readSafeErrorSummary(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function encodeFilterValue(value: string) {
  return encodeURIComponent(value);
}

function rowToTask(row: SupabaseTaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    deadlineDate: row.deadline_date,
    deadlineTime: row.deadline_time,
    deadlineAt: row.deadline_at,
    status: row.status,
    note: row.note ?? "",
    sourceText: row.source_text ?? "",
    sortOrder: typeof row.sort_order === "number" ? row.sort_order : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function taskToRow(task: Task): SupabaseTaskRow {
  const now = new Date().toISOString();

  return {
    id: task.id,
    title: task.title,
    deadline_date: task.deadlineDate,
    deadline_time: task.deadlineTime,
    deadline_at: task.deadlineAt ?? null,
    status: task.status,
    note: task.note,
    source_text: task.sourceText,
    sort_order: typeof task.sortOrder === "number" ? task.sortOrder : null,
    created_at: task.createdAt ?? now,
    updated_at: task.updatedAt ?? now,
  };
}

function sortTasks(tasks: Task[]) {
  const hasManualOrder = tasks.some((task) => typeof task.sortOrder === "number");

  return [...tasks].sort((first, second) => {
    if (hasManualOrder) {
      const firstOrder =
        typeof first.sortOrder === "number" ? first.sortOrder : Number.POSITIVE_INFINITY;
      const secondOrder =
        typeof second.sortOrder === "number" ? second.sortOrder : Number.POSITIVE_INFINITY;

      if (firstOrder !== secondOrder) {
        return firstOrder - secondOrder;
      }
    }

    const firstTime = first.deadlineAt ? Date.parse(first.deadlineAt) : Number.POSITIVE_INFINITY;
    const secondTime = second.deadlineAt
      ? Date.parse(second.deadlineAt)
      : Number.POSITIVE_INFINITY;

    if (firstTime !== secondTime) {
      return firstTime - secondTime;
    }

    return (first.createdAt ?? "").localeCompare(second.createdAt ?? "");
  });
}

export async function getTasks(env: SupabaseEnv) {
  const rows = await requestSupabase<SupabaseTaskRow[]>(
    env,
    "/tasks?select=id,title,deadline_date,deadline_time,deadline_at,status,note,source_text,sort_order,created_at,updated_at",
  );

  return sortTasks(rows.map(rowToTask));
}

export async function upsertTask(env: SupabaseEnv, task: Task) {
  const rows = await requestSupabase<SupabaseTaskRow[]>(
    env,
    "/tasks?on_conflict=id",
    {
      body: JSON.stringify(taskToRow(task)),
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      method: "POST",
    },
  );

  return rowToTask(rows[0]);
}

export async function deleteTask(env: SupabaseEnv, taskId: string) {
  await requestSupabase<unknown>(
    env,
    `/tasks?id=eq.${encodeFilterValue(taskId)}`,
    {
      headers: {
        Prefer: "return=minimal",
      },
      method: "DELETE",
    },
  );
}

export async function clearTasks(env: SupabaseEnv) {
  await requestSupabase<unknown>(env, "/tasks?id=not.is.null", {
    headers: {
      Prefer: "return=minimal",
    },
    method: "DELETE",
  });
}

function isRequirementKind(value: string | null): value is RequirementKind {
  return value === "exam" || value === "course";
}

export function readRequirementKind(value: string | null) {
  if (!isRequirementKind(value)) {
    throw new Error("要求类型必须是 exam 或 course");
  }

  return value;
}

export async function getRequirementNote(env: SupabaseEnv, type: RequirementKind) {
  const rows = await requestSupabase<RequirementNoteRow[]>(
    env,
    `/requirement_notes?select=id,type,content,created_at,updated_at&type=eq.${type}&limit=1`,
  );
  const row = rows[0];

  return {
    content: row?.content ?? "",
    type,
    updatedAt: row?.updated_at ?? null,
  };
}

export async function upsertRequirementNote(
  env: SupabaseEnv,
  type: RequirementKind,
  content: string,
) {
  const now = new Date().toISOString();
  const rows = await requestSupabase<RequirementNoteRow[]>(
    env,
    "/requirement_notes?on_conflict=id",
    {
      body: JSON.stringify({
        id: type,
        type,
        content,
        created_at: now,
        updated_at: now,
      }),
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      method: "POST",
    },
  );
  const row = rows[0];

  return {
    content: row.content,
    type: row.type,
    updatedAt: row.updated_at,
  };
}

export async function clearRequirementNote(env: SupabaseEnv, type: RequirementKind) {
  await requestSupabase<unknown>(env, `/requirement_notes?type=eq.${type}`, {
    headers: {
      Prefer: "return=minimal",
    },
    method: "DELETE",
  });

  return {
    content: "",
    type,
    updatedAt: null,
  };
}

export function createSupabaseErrorResponse(error: unknown, fallbackMessage: string) {
  if (error instanceof SupabaseConfigError) {
    return createJsonResponse({ error: `云端同步尚未配置：${error.message}` }, 503);
  }

  if (error instanceof SupabaseHttpError) {
    return createJsonResponse(
      { error: `Supabase 请求失败（${error.status}）：${error.summary}` },
      502,
    );
  }

  if (error instanceof Error && error.message) {
    return createJsonResponse({ error: error.message }, 400);
  }

  return createJsonResponse({ error: fallbackMessage }, 500);
}
