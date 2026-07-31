import test from "node:test";
import assert from "node:assert/strict";
import { formatTextByLayout, normalizeOcrResponse, recognizeOcrService, validateImagePayload } from "../lib/baidu.js";
import { findOcrService, publicOcrServices } from "../lib/services.js";

test("accepts a valid small PNG payload", () => {
  const payload = { mimeType: "image/png", imageBase64: Buffer.from("png").toString("base64") };
  assert.equal(validateImagePayload(payload).ok, true);
});

test("rejects a payload without an image", () => {
  assert.deepEqual(validateImagePayload({ mimeType: "image/png" }), { ok: false, message: "Choose an image before recognizing." });
});

test("normalizes words returned by Baidu OCR", () => {
  assert.deepEqual(normalizeOcrResponse({ words_result_num: 2, words_result: [{ words: "Hello" }, { words: "世界" }] }), { ok: true, lines: ["Hello", "世界"], text: "Hello\n世界", plainText: "Hello\n世界", layoutText: "Hello\n世界", hasLayout: false, wordsCount: 2 });
});

test("reconstructs rows, indent, and column spacing from OCR locations", () => {
  const result = formatTextByLayout([
    { words: "项目", location: { left: 0, top: 0, width: 20, height: 10 } },
    { words: "金额", location: { left: 100, top: 0, width: 20, height: 10 } },
    { words: "苹果", location: { left: 20, top: 20, width: 20, height: 10 } },
    { words: "100", location: { left: 100, top: 20, width: 30, height: 10 } }
  ]);
  assert.equal(result, "项目        金额\n  苹果      100");
});

test("uses the selected accurate endpoint with location-aware request options", async () => {
  let request;
  await recognizeOcrService("test-token", "encoded-image", findOcrService("accurate"), async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ words_result_num: 0, words_result: [] }), { status: 200 });
  });
  assert.match(request.url, /\/ocr\/v1\/accurate\?access_token=test-token$/);
  assert.equal(request.options.body.get("vertexes_location"), "false");
  assert.equal(request.options.body.get("char_probability"), "false");
});

test("publishes only whitelisted OCR services", () => {
  const services = publicOcrServices();
  assert.ok(services.length > 50);
  assert.equal(findOcrService("idcard").params.id_card_side, "front");
  assert.equal(findOcrService("not-an-api"), undefined);
  assert.equal("path" in services[0], false);
});
