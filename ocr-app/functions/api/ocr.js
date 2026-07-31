/**
 * POST /api/ocr
 * OCR 识别接口：接收图片，调用百度 OCR API，返回识别结果
 */
import { recognizeOcrService, requestAccessToken, validateImagePayload } from "../../lib/baidu.js";
import { findOcrService } from "../../lib/services.js";

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ message: "Method not allowed" }), {
      status: 405, headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const apiKey = env.BAIDU_OCR_API_KEY;
    const secretKey = env.BAIDU_OCR_SECRET_KEY;
    if (!apiKey || !secretKey) {
      return new Response(JSON.stringify({ ok: false, message: "请在 Cloudflare Pages 环境变量中配置 BAIDU_OCR_API_KEY 和 BAIDU_OCR_SECRET_KEY" }), {
        status: 400, headers: { "Content-Type": "application/json" }
      });
    }

    const payload = await request.json();
    const validation = validateImagePayload(payload);
    if (!validation.ok) {
      return new Response(JSON.stringify(validation), {
        status: 400, headers: { "Content-Type": "application/json" }
      });
    }

    const service = findOcrService(payload.serviceId || "accurate");
    if (!service) {
      return new Response(JSON.stringify({ message: "Select a supported OCR service." }), {
        status: 400, headers: { "Content-Type": "application/json" }
      });
    }

    const { token } = await requestAccessToken(apiKey, secretKey);
    const result = await recognizeOcrService(token, payload.imageBase64, service);

    return new Response(JSON.stringify(result), {
      status: result.ok ? 200 : 422,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, message: error.message || "Unexpected server error." }), {
      status: 500, headers: { "Content-Type": "application/json" }
    });
  }
}