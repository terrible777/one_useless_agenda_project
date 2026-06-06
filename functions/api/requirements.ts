import {
  clearRequirementNote,
  createJsonResponse,
  createSupabaseErrorResponse,
  getRequirementNote,
  readRequirementKind,
  type SupabaseEnv,
  upsertRequirementNote,
} from "../_lib/supabase";

type PagesFunctionContext = {
  env: SupabaseEnv;
  request: Request;
};

function getTypeFromUrl(request: Request) {
  const url = new URL(request.url);

  return readRequirementKind(url.searchParams.get("type"));
}

export async function onRequestGet({ env, request }: PagesFunctionContext) {
  try {
    return createJsonResponse(await getRequirementNote(env, getTypeFromUrl(request)));
  } catch (error) {
    console.error("GET /api/requirements failed.", error);
    return createSupabaseErrorResponse(error, "读取云端要求失败");
  }
}

export async function onRequestPost({ env, request }: PagesFunctionContext) {
  try {
    let body: { content?: unknown; type?: unknown };

    try {
      body = (await request.json()) as { content?: unknown; type?: unknown };
    } catch (error) {
      console.error("POST /api/requirements received invalid JSON.", error);
      return createJsonResponse({ error: "请求 JSON 格式不正确" }, 400);
    }

    const type = readRequirementKind(typeof body.type === "string" ? body.type : null);
    const content = typeof body.content === "string" ? body.content : "";

    return createJsonResponse(await upsertRequirementNote(env, type, content));
  } catch (error) {
    console.error("POST /api/requirements failed.", error);
    return createSupabaseErrorResponse(error, "保存云端要求失败");
  }
}

export async function onRequestDelete({ env, request }: PagesFunctionContext) {
  try {
    return createJsonResponse(await clearRequirementNote(env, getTypeFromUrl(request)));
  } catch (error) {
    console.error("DELETE /api/requirements failed.", error);
    return createSupabaseErrorResponse(error, "清空云端要求失败");
  }
}
