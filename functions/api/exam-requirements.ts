import {
  createDeepSeekErrorResponse,
  createJsonResponse,
  organizeTextWithDeepSeek,
  type DeepSeekEnv,
} from "../_lib/deepseek";
import { EXAM_REQUIREMENT_PROMPT } from "../../src/lib/examRequirementPrompt";

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
      console.error("Exam requirements function received invalid JSON.", error);
      return createJsonResponse({ error: "请求 JSON 格式不正确" }, 400);
    }

    const text = typeof body.text === "string" ? body.text.trim() : "";

    if (!text) {
      return createJsonResponse({ error: "请先输入排考要求内容" }, 400);
    }

    return createJsonResponse({
      result: await organizeTextWithDeepSeek(text, EXAM_REQUIREMENT_PROMPT, env),
    });
  } catch (error) {
    console.error("Exam requirements function failed.", error);
    return createDeepSeekErrorResponse(error, "排考要求整理失败，请稍后重试");
  }
}
