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

  const imageBytes = Buffer.byteLength(imageBase64, "base64");
  if (imageBytes === 0 || imageBytes > MAX_IMAGE_BYTES) {
    return { ok: false, message: "Image size must be between 1 byte and 5 MB." };
  }

  return { ok: true, imageBytes };
}

export function normalizeOcrResponse(payload) {
  if (payload?.error_code) {
    return {
      ok: false,
      message: payload.error_msg || "Baidu OCR rejected the request.",
      code: payload.error_code
    };
  }

  const wordsResult = Array.isArray(payload?.words_result) ? payload.words_result.filter((item) => item?.words) : [];
  const lines = wordsResult.map((item) => item.words);
  const plainText = lines.join("\n");
  const layoutText = formatTextByLayout(wordsResult) || plainText;

  return { ok: true, lines, text: layoutText, plainText, layoutText, hasLayout: layoutText !== plainText, wordsCount: payload?.words_result_num ?? lines.length };
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
