const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/bmp"]);

function median(values) {
  const sorted = [...values].sort((first, second) => first - second);
  return sorted[Math.floor(sorted.length / 2)] || 1;
}

export function formatTextByLayout(wordsResult) {
  const items = wordsResult
    .filter((item) => item?.words && Number.isFinite(item.location?.left) && Number.isFinite(item.location?.top))
    .map((item) => ({
      text: item.words,
      left: item.location.left,
      top: item.location.top,
      width: Math.max(item.location.width || 1, 1),
      height: Math.max(item.location.height || 1, 1)
    }));

  if (items.length !== wordsResult.length || items.length === 0) return null;

  const characterWidth = median(items.map((item) => item.width / Math.max([...item.text].length, 1)));
  const pageLeft = Math.min(...items.map((item) => item.left));
  const rows = [];

  for (const item of items.sort((first, second) => first.top - second.top || first.left - second.left)) {
    const row = rows.at(-1);
    const centerY = item.top + item.height / 2;
    if (row && Math.abs(centerY - row.centerY) <= Math.max(item.height, row.height) * 0.6) {
      row.items.push(item);
      row.centerY = (row.centerY * (row.items.length - 1) + centerY) / row.items.length;
      row.height = Math.max(row.height, item.height);
      row.bottom = Math.max(row.bottom, item.top + item.height);
    } else {
      rows.push({ items: [item], centerY, height: item.height, top: item.top, bottom: item.top + item.height });
    }
  }

  const output = [];
  for (const [index, row] of rows.entries()) {
    if (index > 0) {
      const previousRow = rows[index - 1];
      const verticalGap = row.top - previousRow.bottom;
      const blankLineCount = Math.min(2, Math.max(0, Math.round(verticalGap / Math.max(row.height, previousRow.height)) - 1));
      output.push(...Array(blankLineCount).fill(""));
    }

    const rowItems = row.items.sort((first, second) => first.left - second.left);
    const indent = Math.min(20, Math.max(0, Math.round((rowItems[0].left - pageLeft) / characterWidth)));
    let text = " ".repeat(indent) + rowItems[0].text;
    for (let itemIndex = 1; itemIndex < rowItems.length; itemIndex += 1) {
      const previousItem = rowItems[itemIndex - 1];
      const item = rowItems[itemIndex];
      const gap = item.left - (previousItem.left + previousItem.width);
      const spaceCount = Math.min(30, Math.max(1, Math.round(gap / characterWidth)));
      text += " ".repeat(spaceCount) + item.text;
    }
    output.push(text);
  }

  return output.join("\n");
}

export function validateImagePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return { ok: false, message: "Request body must be JSON." };
  }

  const { imageBase64, mimeType } = payload;
  if (typeof imageBase64 !== "string" || imageBase64.length === 0) {
    return { ok: false, message: "Choose an image before recognizing." };
  }
  if (!IMAGE_TYPES.has(mimeType)) {
    return { ok: false, message: "Use a JPG, PNG, WebP, or BMP image." };
  }

  const imageBytes = Math.ceil(imageBase64.length * 3 / 4);
  if (imageBytes === 0 || imageBytes > MAX_IMAGE_BYTES) {
    return { ok: false, message: "Image size must be between 1 byte and 5 MB." };
  }

  return { ok: true, imageBytes };
}

/**
 * 从各种格式的 OCR 响应中提取文本行列表
 * 返回 { lines: string[], hasLocation: boolean }
 */
function extractLines(payload) {
  // PPOCR 格式: page_result[0].lines
  if (Array.isArray(payload?.page_result) && payload.page_result.length > 0) {
    return { lines: payload.page_result[0].lines || [], hasLocation: false };
  }

  // 二维码识别: codes_result[].text
  if (Array.isArray(payload?.codes_result)) {
    const lines = payload.codes_result.flatMap((c) => (Array.isArray(c.text) ? c.text : [c.text || ""]));
    return { lines, hasLocation: false };
  }

  // 银行卡识别: result.bank_card_number
  if (payload?.result && typeof payload.result.bank_card_number === "string") {
    const result = payload.result;
    const lines = [];
    if (result.bank_card_number) lines.push("银行卡号: " + result.bank_card_number);
    if (result.bank_name) lines.push("银行: " + result.bank_name);
    if (result.holder_name) lines.push("持卡人: " + result.holder_name);
    if (result.valid_date && result.valid_date !== "NO VALID") lines.push("有效期: " + result.valid_date);
    return { lines, hasLocation: false };
  }

  // 印章识别: result[]
  if (Array.isArray(payload?.result) && payload.result.length > 0) {
    const lines = payload.result.filter((r) => typeof r === "string").map((r) => r);
    return { lines, hasLocation: false };
  }

  // 通用卡证票据识别: results{key: [{words: [...]}]}
  if (payload?.results && typeof payload.results === "object" && !Array.isArray(payload.results)) {
    const lines = [];
    for (const key of Object.keys(payload.results)) {
      const item = payload.results[key];
      if (typeof item === "object") {
        for (const fieldName of Object.keys(item)) {
          const field = item[fieldName];
          if (Array.isArray(field)) {
            for (const entry of field) {
              if (entry?.words) {
                const words = Array.isArray(entry.words) ? entry.words.join(" ") : entry.words;
                lines.push(fieldName + ": " + words);
              }
            }
          }
        }
      }
    }
    return { lines, hasLocation: false };
  }

  // 试卷分析与识别: results[].words.word + words_location
  if (Array.isArray(payload?.results) && payload.results.length > 0 && payload.results[0]?.words?.word) {
    const items = payload.results
      .filter((r) => r?.words?.word)
      .map((r) => ({
        words: r.words.word,
        location: r.words.words_location || null
      }));
    const lines = items.map((i) => i.words);
    const hasLocation = items.some((i) => i.location && i.location.left !== undefined);
    return { lines, items, hasLocation };
  }

  // 表格文字识别 V2: table_num + results 或 body
  if (payload?.table_num !== undefined) {
    const lines = [];
    if (Array.isArray(payload?.results)) {
      for (const table of payload.results) {
        if (Array.isArray(table?.body)) {
          for (const cell of table.body) {
            if (cell?.word) lines.push(cell.word);
          }
        }
      }
    }
    return { lines: lines.length > 0 ? lines : ["（未检测到表格内容）"], hasLocation: false };
  }

  // 标准格式: words_result[]
  if (Array.isArray(payload?.words_result)) {
    const items = payload.words_result.filter((item) => item?.words);
    const lines = items.map((item) => item.words);
    const hasLocation = items.some((item) => item.location?.left !== undefined);
    return { lines, items, hasLocation };
  }

  return { lines: [], hasLocation: false };
}

export function normalizeOcrResponse(payload) {
  if (payload?.error_code) {
    return {
      ok: false,
      message: payload.error_msg || "Baidu OCR rejected the request.",
      code: payload.error_code
    };
  }

  const { lines, items, hasLocation } = extractLines(payload);
  const plainText = lines.join("\n");

  let layoutText = plainText;
  let actualHasLayout = false;

  // 有位置信息时尝试版式重建
  if (hasLocation && items && items.length > 0) {
    // 统一位置字段名: words_result 用 location, doc_analysis 用 words_location
    const normalized = items.map((item) => ({
      words: item.words,
      location: item.location || item.words_location
    }));
    const rebuilt = formatTextByLayout(normalized);
    if (rebuilt) {
      layoutText = rebuilt;
      actualHasLayout = true;
    }
  }

  return {
    ok: true,
    lines,
    text: layoutText,
    plainText,
    layoutText,
    hasLayout: actualHasLayout,
    wordsCount: lines.length
  };
}

export async function requestAccessToken(apiKey, secretKey, fetchFn = fetch) {
  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: apiKey,
    client_secret: secretKey
  });
  const response = await fetchFn(`https://aip.baidubce.com/oauth/2.0/token?${params}`, { method: "POST" });
  const data = await response.json();
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error_msg || "Unable to obtain a Baidu access token.");
  }
  return { token: data.access_token, expiresIn: Number(data.expires_in) || 0 };
}

export async function recognizeOcrService(accessToken, imageBase64, service, fetchFn = fetch) {
  const response = await fetchFn(
    `https://aip.baidubce.com/rest/2.0/${service.path}?access_token=${encodeURIComponent(accessToken)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ image: imageBase64, detect_direction: "false", vertexes_location: "false", paragraph: "false", probability: "false", char_probability: "false", multidirectional_recognize: "false", ...service.params })
    }
  );
  const data = await response.json();
  if (!response.ok && !data.error_code) {
    throw new Error("Baidu OCR service request failed.");
  }
  return normalizeOcrResponse(data);
}