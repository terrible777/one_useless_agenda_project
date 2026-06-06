import "server-only";

import { sortTasksByDeadline } from "@/lib/taskSorting";
import type { Task, TaskStatus } from "@/types/task";

type SupabaseTaskRow = {
  id: string;
  title: string;
  deadline_date: string | null;
  deadline_time: string | null;
  deadline_at: string | null;
  status: string;
  note: string | null;
  source_text: string | null;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
};

type SupabaseConfig = {
  key: string;
  url: string;
  usesServiceRole: boolean;
};

export class SupabaseConfigError extends Error {
  constructor() {
    super("Missing Supabase environment variables.");
    this.name = "SupabaseConfigError";
  }
}

export class SupabaseRequestError extends Error {
  status: number;
  summary: string;

  constructor(status: number, summary: string) {
    super(`Supabase HTTP ${status}: ${summary}`);
    this.name = "SupabaseRequestError";
    this.status = status;
    this.summary = summary;
  }
}

function getSupabaseConfig(): SupabaseConfig {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const key = serviceRoleKey || anonKey;

  if (!url || !key) {
    throw new SupabaseConfigError();
  }

  return {
    key,
    url: url.replace(/\/+$/, ""),
    usesServiceRole: Boolean(serviceRoleKey),
  };
}

function getSupabaseHeaders(extraHeaders: Record<string, string> = {}) {
  const { key } = getSupabaseConfig();

  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extraHeaders,
  };
}

function isTaskStatus(value: string): value is TaskStatus {
  return value === "not_started" || value === "in_progress" || value === "completed";
}

function sanitizeSupabaseError(text: string) {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/("api[_-]?key"\s*:\s*")[^"]+(")/gi, "$1[redacted]$2")
    .replace(/("apikey"\s*:\s*")[^"]+(")/gi, "$1[redacted]$2")
    .replace(/(api[_-]?key=)[^&\s]+/gi, "$1[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

async function readSafeErrorSummary(response: Response) {
  try {
    const text = await response.text();
    return sanitizeSupabaseError(text) || response.statusText || "No error body";
  } catch {
    return response.statusText || "Unable to read error body";
  }
}

function buildDeadlineAt(task: Pick<Task, "deadlineDate" | "deadlineTime">) {
  if (!task.deadlineDate) {
    return null;
  }

  return `${task.deadlineDate}T${task.deadlineTime ?? "15:00"}:00+08:00`;
}

function taskToRow(task: Task, index: number): SupabaseTaskRow {
  const now = new Date().toISOString();

  return {
    id: task.id,
    title: task.title.trim(),
    deadline_date: task.deadlineDate,
    deadline_time: task.deadlineTime,
    deadline_at: task.deadlineAt ?? buildDeadlineAt(task),
    status: task.status,
    note: task.note,
    source_text: task.sourceText,
    sort_order: typeof task.sortOrder === "number" ? task.sortOrder : index,
    created_at: task.createdAt ?? now,
    updated_at: task.updatedAt ?? now,
  };
}

function rowToTask(row: SupabaseTaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    deadlineDate: row.deadline_date,
    deadlineTime: row.deadline_time,
    deadlineAt: row.deadline_at,
    status: isTaskStatus(row.status) ? row.status : "not_started",
    note: row.note ?? "",
    sourceText: row.source_text ?? "",
    sortOrder: row.sort_order ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function assertSupabaseOk(response: Response) {
  if (!response.ok) {
    throw new SupabaseRequestError(response.status, await readSafeErrorSummary(response));
  }
}

export function getSupabaseSyncMode() {
  return getSupabaseConfig().usesServiceRole ? "service_role" : "anon";
}

export async function listCloudTasks() {
  const { url } = getSupabaseConfig();
  const response = await fetch(
    `${url}/rest/v1/tasks?select=*&order=deadline_at.asc.nullslast,sort_order.asc.nullslast,updated_at.desc`,
    {
      cache: "no-store",
      headers: getSupabaseHeaders(),
    },
  );

  await assertSupabaseOk(response);

  const rows = (await response.json()) as SupabaseTaskRow[];
  return sortTasksByDeadline(rows.map(rowToTask));
}

export async function upsertCloudTasks(tasks: Task[]) {
  const { url } = getSupabaseConfig();
  const rows = sortTasksByDeadline(tasks).map(taskToRow);

  if (rows.length === 0) {
    return [];
  }

  const response = await fetch(`${url}/rest/v1/tasks?on_conflict=id`, {
    body: JSON.stringify(rows),
    cache: "no-store",
    headers: getSupabaseHeaders({
      Prefer: "resolution=merge-duplicates,return=representation",
    }),
    method: "POST",
  });

  await assertSupabaseOk(response);

  const savedRows = (await response.json()) as SupabaseTaskRow[];
  return savedRows.map(rowToTask);
}

export async function deleteCloudTask(taskId: string) {
  const { url } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/tasks?id=eq.${encodeURIComponent(taskId)}`, {
    cache: "no-store",
    headers: getSupabaseHeaders({
      Prefer: "return=minimal",
    }),
    method: "DELETE",
  });

  await assertSupabaseOk(response);
}

export async function clearCloudTasks() {
  const { url } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/tasks?id=not.is.null`, {
    cache: "no-store",
    headers: getSupabaseHeaders({
      Prefer: "return=minimal",
    }),
    method: "DELETE",
  });

  await assertSupabaseOk(response);
}
