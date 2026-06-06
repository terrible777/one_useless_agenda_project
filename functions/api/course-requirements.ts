import {
  createDeepSeekErrorResponse,
  createJsonResponse,
  organizeTextWithDeepSeek,
  type DeepSeekEnv,
} from "../_lib/deepseek";
import { COURSE_REQUIREMENT_PROMPT } from "../../src/lib/courseRequirementPrompt";

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
      console.error("Course requirements function received invalid JSON.", error);
      return createJsonResponse({ error: "请求 JSON 格式不正确" }, 400);
    }

    const text = typeof body.text === "string" ? body.text.trim() : "";

    if (!text) {
      return createJsonResponse({ error: "请先输入排课要求内容" }, 400);
    }

    return createJsonResponse({
      result: await organizeTextWithDeepSeek(text, COURSE_REQUIREMENT_PROMPT, env),
    });
  } catch (error) {
    console.error("Course requirements function failed.", error);
    return createDeepSeekErrorResponse(error, "排课要求整理失败，请稍后重试");
  }
}
