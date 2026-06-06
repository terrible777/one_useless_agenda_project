import { NextResponse } from "next/server";
import {
  clearCloudTasks,
  SupabaseConfigError,
  SupabaseRequestError,
} from "@/lib/supabaseTasks";

function createErrorResponse(error: unknown) {
  if (error instanceof SupabaseConfigError) {
    return NextResponse.json({ error: "云端同步尚未配置" }, { status: 503 });
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
  return NextResponse.json({ error: "云端同步失败" }, { status: 500 });
}

export async function DELETE() {
  try {
    await clearCloudTasks();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return createErrorResponse(error);
  }
}
