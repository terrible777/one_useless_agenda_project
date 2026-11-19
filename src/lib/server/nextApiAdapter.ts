import type { NextApiHandler, NextApiRequest } from "next";
import type { DeepSeekEnv } from "../../../functions/_lib/deepseek";
import type { SupabaseEnv } from "../../../functions/_lib/supabase";

type ApiEnvironment = DeepSeekEnv & SupabaseEnv;
type ApiHandler = (context: { env: ApiEnvironment; request: Request }) => Promise<Response>;

function getEnvironment(): ApiEnvironment {
  return {
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
    DEEPSEEK_BASE_URL: process.env.DEEPSEEK_BASE_URL,
    DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL,
    SUPABASE_URL: process.env.SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

async function readBody(request: NextApiRequest) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 1024 * 1024) throw new Error("Request body exceeds 1 MB");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

// Reuse the Pages Functions handlers so both hosts share validation and database behavior.
export function createNextApiHandler(handlers: Record<string, ApiHandler>): NextApiHandler {
  return async (request, response) => {
    const method = request.method ?? "GET";
    const handler = handlers[method === "HEAD" ? "GET" : method];
    if (!handler) {
      response.setHeader("Allow", Object.keys(handlers).join(", "));
      response.status(405).json({ error: "不支持此请求方法" });
      return;
    }

    try {
      const headers = new Headers();
      for (const [name, value] of Object.entries(request.headers)) {
        for (const item of Array.isArray(value) ? value : value ? [value] : []) {
          headers.append(name, item);
        }
      }
      const webRequest = new Request(new URL(request.url ?? "/", "http://localhost"), {
        method,
        headers,
        body: method === "GET" || method === "HEAD" ? undefined : await readBody(request),
      });
      const result = await handler({ env: getEnvironment(), request: webRequest });
      result.headers.forEach((value, name) => response.setHeader(name, value));
      response.status(result.status);
      if (method === "HEAD") response.end();
      else response.send(Buffer.from(await result.arrayBuffer()));
    } catch (error) {
      console.error("Next.js API adapter failed.", error);
      response.setHeader("Cache-Control", "no-store");
      response.status(500).json({ error: "接口处理失败，请查看服务端日志" });
    }
  };
}
