import {
  analyzeTextWithDeepSeek,
  createDeepSeekErrorResponse,
  createJsonResponse,
  type DeepSeekEnv,
} from "../_lib/deepseek";
import { SYSTEM_PROMPT } from "../../src/lib/taskExtractionPrompt";

type PagesFunctionContext = {
  env: DeepSeekEnv;
  request: Request;
};

export async function onRequestPost({ env, request }: PagesFunctionContext) {
  try {
    let body: { text?: unknown };

    try {
      body = (await request.json()) as { text?: unknown };
    } catch (error) {
      console.error("Analyze function received invalid JSON.", error);
      return createJsonResponse({ error: "请求 JSON 格式不正确" }, 400);
    }

    const text = typeof body.text === "string" ? body.text.trim() : "";

    if (!text) {
      return createJsonResponse({ error: "请先输入任务内容" }, 400);
    }

    return createJsonResponse(await analyzeTextWithDeepSeek(text, SYSTEM_PROMPT, env));
  } catch (error) {
    console.error("Analyze function failed.", error);
    return createDeepSeekErrorResponse(error, "AI 分析失败，请稍后重试");
  }
}
