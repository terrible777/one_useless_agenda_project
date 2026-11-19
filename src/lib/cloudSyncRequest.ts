export async function cloudSyncRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = init.method ?? "GET";
  let response: Response;

  try {
    response = await fetch(path, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    const isTimeout = error instanceof Error && /timeout|abort/i.test(error.name);
    throw new Error(`${method} ${path}：${isTimeout ? "请求超时" : "网络连接失败，请检查网络"}`);
  }

  const isJson = response.headers.get("content-type")?.includes("application/json");
  let data: unknown;

  try {
    data = isJson ? await response.json() : null;
  } catch {
    throw new Error(`${method} ${path} 返回 ${response.status}：响应 JSON 格式不正确`);
  }

  if (!response.ok) {
    const body = data as { error?: unknown; message?: unknown } | null;
    const message = typeof body?.error === "string" ? body.error : body?.message;
    throw new Error(
      `${method} ${path} 返回 ${response.status}：${
        typeof message === "string" ? message.slice(0, 500) : "同步接口不可用，请检查部署及环境变量"
      }`,
    );
  }

  if (!isJson) {
    throw new Error(`${method} ${path} 未返回 JSON，请确认部署包含 Cloudflare Pages Functions`);
  }

  return data as T;
}
