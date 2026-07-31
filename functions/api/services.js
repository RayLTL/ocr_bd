/**
 * GET /api/services
 * 返回 OCR 服务列表
 */
import { publicOcrServices } from "../../lib/services.js";

export async function onRequest(context) {
  const { request } = context;

  if (request.method !== "GET") {
    return new Response(JSON.stringify({ message: "Method not allowed" }), {
      status: 405, headers: { "Content-Type": "application/json" }
    });
  }

  return new Response(JSON.stringify({
    services: publicOcrServices(),
    defaultServiceId: "accurate"
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}