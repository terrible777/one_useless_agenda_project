import "server-only";

export type RequirementNoteType = "exam" | "course";

type RequirementNoteRow = {
  content: string;
  created_at: string;
  id: string;
  type: string;
  updated_at: string;
};

export type RequirementNote = {
  content: string;
  createdAt: string;
  type: RequirementNoteType;
  updatedAt: string;
};

type SupabaseConfig = {
  key: string;
  url: string;
};

export class RequirementSupabaseConfigError extends Error {
  constructor() {
    super("Missing Supabase environment variables.");
    this.name = "RequirementSupabaseConfigError";
  }
}

export class RequirementSupabaseRequestError extends Error {
  status: number;
  summary: string;

  constructor(status: number, summary: string) {
    super(`Supabase HTTP ${status}: ${summary}`);
    this.name = "RequirementSupabaseRequestError";
    this.status = status;
    this.summary = summary;
  }
}

export function isRequirementNoteType(value: unknown): value is RequirementNoteType {
  return value === "exam" || value === "course";
}

function getRequirementNoteId(type: RequirementNoteType) {
  return `requirement_${type}`;
}

function getSupabaseConfig(): SupabaseConfig {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const key = serviceRoleKey || anonKey;

  if (!url || !key) {
    throw new RequirementSupabaseConfigError();
  }

  return {
    key,
    url: url.replace(/\/+$/, ""),
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

async function assertSupabaseOk(response: Response) {
  if (!response.ok) {
    throw new RequirementSupabaseRequestError(
      response.status,
      await readSafeErrorSummary(response),
    );
  }
}

function rowToNote(row: RequirementNoteRow): RequirementNote {
  return {
    content: row.content,
    createdAt: row.created_at,
    type: isRequirementNoteType(row.type) ? row.type : "exam",
    updatedAt: row.updated_at,
  };
}

export async function getRequirementNote(type: RequirementNoteType) {
  const { url } = getSupabaseConfig();
  const response = await fetch(
    `${url}/rest/v1/requirement_notes?id=eq.${getRequirementNoteId(type)}&select=*`,
    {
      cache: "no-store",
      headers: getSupabaseHeaders(),
    },
  );

  await assertSupabaseOk(response);

  const rows = (await response.json()) as RequirementNoteRow[];
  const row = rows[0];

  return row ? rowToNote(row) : null;
}

export async function upsertRequirementNote(type: RequirementNoteType, content: string) {
  const { url } = getSupabaseConfig();
  const now = new Date().toISOString();
  const currentNote = await getRequirementNote(type);
  const row: RequirementNoteRow = {
    content,
    created_at: currentNote?.createdAt ?? now,
    id: getRequirementNoteId(type),
    type,
    updated_at: now,
  };
  const response = await fetch(`${url}/rest/v1/requirement_notes?on_conflict=id`, {
    body: JSON.stringify(row),
    cache: "no-store",
    headers: getSupabaseHeaders({
      Prefer: "resolution=merge-duplicates,return=representation",
    }),
    method: "POST",
  });

  await assertSupabaseOk(response);

  const rows = (await response.json()) as RequirementNoteRow[];

  return rowToNote(rows[0] ?? row);
}

export function clearRequirementNote(type: RequirementNoteType) {
  return upsertRequirementNote(type, "");
}
