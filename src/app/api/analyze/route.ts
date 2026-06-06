import { NextResponse } from "next/server";
import {
  analyzeTextWithDeepSeek,
  DeepSeekConfigError,
  DeepSeekHttpError,
  DeepSeekResponseParseError,
} from "@/lib/deepseek";

function logAnalyzeError(error: unknown) {
  if (error instanceof Error) {
    console.error("Analyze API failed.", {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...(error instanceof DeepSeekHttpError
        ? { deepseekStatus: error.status, deepseekSummary: error.summary }
        : {}),
    });
    return;
  }

  console.error("Analyze API failed with non-error value.", error);
}

function getErrorName(error: unknown) {
  return error instanceof Error ? error.name : "";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "";
}

function isDeepSeekConfigError(error: unknown) {
  return (
    error instanceof DeepSeekConfigError ||
    getErrorName(error) === "DeepSeekConfigError" ||
    getErrorMessage(error) === "Missing DEEPSEEK_API_KEY."
  );
}

function isDeepSeekHttpError(error: unknown): error is DeepSeekHttpError {
  return (
    error instanceof DeepSeekHttpError ||
    (getErrorName(error) === "DeepSeekHttpError" &&
      typeof (error as DeepSeekHttpError).status === "number" &&
      typeof (error as DeepSeekHttpError).summary === "string")
  );
}

function isDeepSeekResponseParseError(error: unknown) {
  return (
    error instanceof DeepSeekResponseParseError ||
    getErrorName(error) === "DeepSeekResponseParseError"
  );
}

function createAnalyzeErrorResponse(error: unknown) {
  if (isDeepSeekConfigError(error)) {
    return NextResponse.json(
      {
        error: "未配置 DeepSeek API Key",
      },
      { status: 500 },
    );
  }

  if (isDeepSeekHttpError(error)) {
    return NextResponse.json(
      {
        error: `DeepSeek 请求失败（HTTP ${error.status}）：${error.summary}`,
      },
      { status: 502 },
    );
  }

  if (isDeepSeekResponseParseError(error)) {
    return NextResponse.json(
      {
        error: "AI 返回格式解析失败",
      },
      { status: 502 },
    );
  }

  return NextResponse.json(
    {
      error: "AI 分析失败，请稍后重试",
    },
    { status: 500 },
  );
}

export async function POST(request: Request) {
  try {
    let body: { text?: unknown };

    try {
      body = (await request.json()) as { text?: unknown };
    } catch (error) {
      console.error("Analyze API received invalid JSON.", error);
      return NextResponse.json({ error: "请求 JSON 格式不正确" }, { status: 400 });
    }

    const text = typeof body.text === "string" ? body.text.trim() : "";

    if (!text) {
      return NextResponse.json({ error: "请先输入任务内容。" }, { status: 400 });
    }

    const tasks = await analyzeTextWithDeepSeek(text);

    return NextResponse.json(tasks);
  } catch (error) {
    logAnalyzeError(error);

    return createAnalyzeErrorResponse(error);
  }
}
