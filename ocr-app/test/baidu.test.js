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

test("normalizes standard words_result format", () => {
  const result = normalizeOcrResponse({ words_result_num: 2, words_result: [{ words: "Hello" }, { words: "世界" }] });
  assert.equal(result.ok, true);
  assert.equal(result.wordsCount, 2);
  assert.equal(result.plainText, "Hello\n世界");
  assert.equal(result.hasLayout, false);
});

test("normalizes PPOCR page_result format", () => {
  const result = normalizeOcrResponse({ page_result: [{ lines: ["Hello", "World", "123"] }] });
  assert.equal(result.ok, true);
  assert.equal(result.wordsCount, 3);
  assert.equal(result.plainText, "Hello\nWorld\n123");
  assert.equal(result.hasLayout, false);
});

test("normalizes QR code codes_result format", () => {
  const result = normalizeOcrResponse({ codes_result: [{ text: ["ABC123", "DEF456"] }], codes_result_num: 2 });
  assert.equal(result.ok, true);
  assert.equal(result.wordsCount, 2);
  assert.equal(result.plainText, "ABC123\nDEF456");
});

test("normalizes bankcard result format", () => {
  const result = normalizeOcrResponse({ result: { bank_card_number: "6222021234567890", bank_name: "工商银行", holder_name: "张三", valid_date: "08/26" } });
  assert.equal(result.ok, true);
  assert.ok(result.plainText.includes("6222021234567890"));
  assert.ok(result.plainText.includes("工商银行"));
});

test("normalizes general_ocr results format", () => {
  const result = normalizeOcrResponse({ results: { "0": { "标题": [{ words: ["测试标题"] }], "金额": [{ words: ["￥100"] }] } } });
  assert.equal(result.ok, true);
  assert.ok(result.plainText.includes("测试标题"));
  assert.ok(result.plainText.includes("￥100"));
});

test("normalizes doc_analysis results format", () => {
  const result = normalizeOcrResponse({ results: [{ words: { word: "第一行", words_location: { left: 0, top: 0, width: 50, height: 20 } } }, { words: { word: "第二行", words_location: { left: 0, top: 30, width: 50, height: 20 } } }] });
  assert.equal(result.ok, true);
  assert.equal(result.wordsCount, 2);
  assert.equal(result.plainText, "第一行\n第二行");
  assert.equal(result.hasLayout, true);
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