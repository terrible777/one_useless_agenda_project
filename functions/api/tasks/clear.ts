import {
  clearTasks,
  createJsonResponse,
  createSupabaseErrorResponse,
  type SupabaseEnv,
} from "../../_lib/supabase";

type PagesFunctionContext = {
  env: SupabaseEnv;
};

export async function onRequestDelete({ env }: PagesFunctionContext) {
  try {
    await clearTasks(env);

    return createJsonResponse({ ok: true });
  } catch (error) {
    console.error("DELETE /api/tasks/clear failed.", error);
    return createSupabaseErrorResponse(error, "清空云端任务失败");
  }
}
