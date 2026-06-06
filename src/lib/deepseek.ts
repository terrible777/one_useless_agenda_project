import "server-only";

import { SYSTEM_PROMPT } from "@/lib/taskExtractionPrompt";
import type { Task } from "@/types/task";

export type ExtractedTask = Omit<Task, "id">;

type DeepSeekResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

type RawExtractedTask = {
  title?: unknown;
  deadlineDate?: unknown;
  deadlineTime?: unknown;
  status?: unknown;
  note?: unknown;
  sourceText?: unknown;
};

export class DeepSeekConfigError extends Error {
  constructor(message = "Missing DEEPSEEK_API_KEY.") {
    super(message);
    this.name = "DeepSeekConfigError";
  }
}

export class DeepSeekHttpError extends Error {
  status: number;
  summary: string;

  constructor(status: number, summary: string) {
    super(`DeepSeek HTTP ${status}: ${summary}`);
    this.name = "DeepSeekHttpError";
    this.status = status;
    this.summary = summary;
  }
}

export class DeepSeekResponseParseError extends Error {
  constructor(message = "AI response is not valid JSON.") {
    super(message);
    this.name = "DeepSeekResponseParseError";
  }
}

function getShanghaiDateString() {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Shanghai",
    year: "numeric",
  }).format(new Date());
}

function getDeepSeekConfig() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const baseUrl = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
  const model = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";

  if (!apiKey) {
    throw new DeepSeekConfigError();
  }

  return {
    apiKey,
    baseUrl: baseUrl.replace(/\/+$/, ""),
    model,
  };
}

function sanitizeErrorText(text: string) {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/("api[_-]?key"\s*:\s*")[^"]+(")/gi, "$1[redacted]$2")
    .replace(/(api[_-]?key=)[^&\s]+/gi, "$1[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
}

async function readSafeErrorSummary(response: Response) {
  try {
    const text = await response.text();
    const sanitizedText = sanitizeErrorText(text);

    if (!sanitizedText) {
      return response.statusText || "No error body";
    }

    try {
      const parsed = JSON.parse(sanitizedText) as {
        error?: { message?: unknown; type?: unknown; code?: unknown };
        message?: unknown;
      };
      const message =
        typeof parsed.error?.message === "string"
          ? parsed.error.message
          : typeof parsed.message === "string"
            ? parsed.message
            : sanitizedText;
      const type = typeof parsed.error?.type === "string" ? parsed.error.type : "";
      const code = typeof parsed.error?.code === "string" ? parsed.error.code : "";

      return sanitizeErrorText([message, type, code].filter(Boolean).join(" / "));
    } catch {
      return sanitizedText;
    }
  } catch {
    return response.statusText || "Unable to read error body";
  }
}

function extractJsonArray(content: string) {
  const trimmedContent = content.trim();
  const startIndex = trimmedContent.indexOf("[");
  const endIndex = trimmedContent.lastIndexOf("]");

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    throw new DeepSeekResponseParseError("DeepSeek response does not contain a JSON array.");
  }

  return trimmedContent.slice(startIndex, endIndex + 1);
}

function nullableDate(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function nullableTime(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : null;
}

function normalizeExtractedTask(task: RawExtractedTask, sourceText: string): ExtractedTask | null {
  if (typeof task.title !== "string" || !task.title.trim()) {
    return null;
  }

  return {
    title: task.title.trim(),
    deadlineDate: nullableDate(task.deadlineDate),
    deadlineTime: nullableTime(task.deadlineTime),
    status: "not_started",
    note: typeof task.note === "string" ? task.note.trim() : "",
    sourceText:
      typeof task.sourceText === "string" && task.sourceText.trim()
        ? task.sourceText
        : sourceText,
  };
}

export async function analyzeTextWithDeepSeek(text: string): Promise<ExtractedTask[]> {
  const { apiKey, baseUrl, model } = getDeepSeekConfig();
  const sourceText = text.trim();
  const currentDate = getShanghaiDateString();

  const response = await fetch(`${baseUrl}/chat/completions`, {
    body: JSON.stringify({
      max_tokens: 2000,
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: `当前日期（Asia/Shanghai）：${currentDate}\n用户输入：\n${sourceText}`,
        },
      ],
      model,
      temperature: 0.1,
    }),
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new DeepSeekHttpError(response.status, await readSafeErrorSummary(response));
  }

  let data: DeepSeekResponse;

  try {
    data = (await response.json()) as DeepSeekResponse;
  } catch (error) {
    throw new DeepSeekResponseParseError(
      error instanceof Error ? error.message : "DeepSeek API JSON response parse failed.",
    );
  }

  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new DeepSeekResponseParseError("DeepSeek API response is empty.");
  }

  let parsedTasks: unknown;

  try {
    parsedTasks = JSON.parse(extractJsonArray(content)) as unknown;
  } catch (error) {
    throw new DeepSeekResponseParseError(
      error instanceof Error ? error.message : "DeepSeek task JSON parse failed.",
    );
  }

  if (!Array.isArray(parsedTasks)) {
    throw new DeepSeekResponseParseError("DeepSeek response JSON is not an array.");
  }

  const normalizedTasks = parsedTasks
    .map((task) => normalizeExtractedTask(task as RawExtractedTask, sourceText))
    .filter((task): task is ExtractedTask => task !== null);

  if (normalizedTasks.length === 0) {
    throw new DeepSeekResponseParseError("DeepSeek did not return any valid task.");
  }

  // The product rule is one task per user input, so never expose extra model items.
  return normalizedTasks.slice(0, 1);
}
