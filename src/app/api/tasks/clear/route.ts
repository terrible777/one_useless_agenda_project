import { NextResponse } from "next/server";
import {
  clearCloudTasks,
  getSupabaseSyncMode,
  SupabaseConfigError,
  SupabaseRequestError,
} from "@/lib/supabaseTasks";

export const dynamic = "force-dynamic";

function createErrorResponse(error: unknown) {
  if (error instanceof SupabaseConfigError) {
    console.error("Supabase task clear API is not configured.", error);
    return NextResponse.json({ error: "云端同步尚未配置：缺少 Supabase 环境变量" }, { status: 503 });
  }

  if (error instanceof SupabaseRequestError) {
    console.error("Supabase task clear failed.", {
      status: error.status,
      summary: error.summary,
    });

    return NextResponse.json(
      { error: `Supabase 清空失败（${error.status}）：${error.summary}` },
      { status: 502 },
    );
  }

  console.error("Task clear API failed.", error);
  return NextResponse.json({ error: "云端同步失败：清空任务 API 出错" }, { status: 500 });
}

export async function DELETE() {
  try {
    console.info("Clearing Supabase tasks.", {
      mode: getSupabaseSyncMode(),
    });

    await clearCloudTasks();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return createErrorResponse(error);
  }
}
