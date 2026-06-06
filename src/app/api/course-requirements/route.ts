import { NextResponse } from "next/server";
import { COURSE_REQUIREMENT_PROMPT } from "@/lib/courseRequirementPrompt";
import {
  DeepSeekConfigError,
  DeepSeekHttpError,
  DeepSeekResponseParseError,
  organizeTextWithDeepSeek,
} from "@/lib/deepseek";

function logRequirementError(error: unknown) {
  if (error instanceof Error) {
    console.error("Course requirements API failed.", {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...(error instanceof DeepSeekHttpError
        ? { deepseekStatus: error.status, deepseekSummary: error.summary }
        : {}),
    });
    return;
  }

  console.error("Course requirements API failed with non-error value.", error);
}

function createErrorResponse(error: unknown) {
  if (error instanceof DeepSeekConfigError) {
    return NextResponse.json({ error: "未配置 DeepSeek API Key" }, { status: 500 });
  }

  if (error instanceof DeepSeekHttpError) {
    return NextResponse.json(
      { error: `DeepSeek 请求失败（HTTP ${error.status}）：${error.summary}` },
      { status: 502 },
    );
  }

  if (error instanceof DeepSeekResponseParseError) {
    return NextResponse.json({ error: "AI 返回内容解析失败" }, { status: 502 });
  }

  return NextResponse.json({ error: "排课要求整理失败，请稍后重试" }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    let body: { text?: unknown };

    try {
      body = (await request.json()) as { text?: unknown };
    } catch (error) {
      console.error("Course requirements API received invalid JSON.", error);
      return NextResponse.json({ error: "请求 JSON 格式不正确" }, { status: 400 });
    }

    const text = typeof body.text === "string" ? body.text.trim() : "";

    if (!text) {
      return NextResponse.json({ error: "请先输入排课要求内容" }, { status: 400 });
    }

    const result = await organizeTextWithDeepSeek(text, COURSE_REQUIREMENT_PROMPT);

    return NextResponse.json({ result });
  } catch (error) {
    logRequirementError(error);

    return createErrorResponse(error);
  }
}
