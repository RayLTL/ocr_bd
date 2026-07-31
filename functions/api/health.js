/**
 * GET /api/health
 * 健康检查 + API 配置状态
 */

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "GET") {
    return new Response(JSON.stringify({ message: "Method not allowed" }), {
      status: 405, headers: { "Content-Type": "application/json" }
    });
  }

  const ready = Boolean(env.BAIDU_OCR_API_KEY && env.BAIDU_OCR_SECRET_KEY);

  return new Response(JSON.stringify({
    ready,
    activeProfile: ready ? "Cloudflare Pages 配置" : null
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}