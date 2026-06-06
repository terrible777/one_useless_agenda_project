import { NextResponse } from "next/server";
import {
  clearRequirementNote,
  getRequirementNote,
  isRequirementNoteType,
  RequirementSupabaseConfigError,
  RequirementSupabaseRequestError,
  upsertRequirementNote,
  type RequirementNoteType,
} from "@/lib/requirementNotes";

type RequirementRequestBody = {
  content?: unknown;
  type?: unknown;
};

function logRequirementsError(action: string, error: unknown) {
  if (error instanceof Error) {
    console.error(`Requirements API ${action} failed.`, {
      message: error.message,
      name: error.name,
      stack: error.stack,
      ...(error instanceof RequirementSupabaseRequestError
        ? { supabaseStatus: error.status, supabaseSummary: error.summary }
        : {}),
    });
    return;
  }

  console.error(`Requirements API ${action} failed with non-error value.`, error);
}

function createErrorResponse(error: unknown) {
  if (error instanceof RequirementSupabaseConfigError) {
    return NextResponse.json({ error: "云端同步尚未配置" }, { status: 503 });
  }

  if (error instanceof RequirementSupabaseRequestError) {
    return NextResponse.json(
      { error: `Supabase 请求失败（HTTP ${error.status}）：${error.summary}` },
      { status: 502 },
    );
  }

  return NextResponse.json({ error: "要求整理云端同步失败" }, { status: 500 });
}

function readTypeFromUrl(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");

  return isRequirementNoteType(type) ? type : null;
}

function createNoteResponse(type: RequirementNoteType, content: string, updatedAt: string | null) {
  return NextResponse.json({
    content,
    type,
    updatedAt,
  });
}

export async function GET(request: Request) {
  const type = readTypeFromUrl(request);

  if (!type) {
    return NextResponse.json({ error: "请提供正确的 type：exam 或 course" }, { status: 400 });
  }

  try {
    const note = await getRequirementNote(type);

    return createNoteResponse(type, note?.content ?? "", note?.updatedAt ?? null);
  } catch (error) {
    logRequirementsError("GET", error);

    return createErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    let body: RequirementRequestBody;

    try {
      body = (await request.json()) as RequirementRequestBody;
    } catch (error) {
      console.error("Requirements API received invalid JSON.", error);
      return NextResponse.json({ error: "请求 JSON 格式不正确" }, { status: 400 });
    }

    if (!isRequirementNoteType(body.type)) {
      return NextResponse.json({ error: "请提供正确的 type：exam 或 course" }, { status: 400 });
    }

    if (typeof body.content !== "string") {
      return NextResponse.json({ error: "content 必须是字符串" }, { status: 400 });
    }

    const note = await upsertRequirementNote(body.type, body.content);

    return createNoteResponse(note.type, note.content, note.updatedAt);
  } catch (error) {
    logRequirementsError("POST", error);

    return createErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  const type = readTypeFromUrl(request);

  if (!type) {
    return NextResponse.json({ error: "请提供正确的 type：exam 或 course" }, { status: 400 });
  }

  try {
    const note = await clearRequirementNote(type);

    return createNoteResponse(note.type, note.content, note.updatedAt);
  } catch (error) {
    logRequirementsError("DELETE", error);

    return createErrorResponse(error);
  }
}
