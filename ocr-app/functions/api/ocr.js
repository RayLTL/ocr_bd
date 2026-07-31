/**
 * POST /api/ocr
 * OCR 识别接口
 */

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/bmp"]);
const FETCH_TIMEOUT = 15000;

// OCR 服务目录
const SERVICES = [
  ["accurate", "通用文字识别（高精度含位置版）", "通用文字", "ocr/v1/accurate", "500"],
  ["accurate_basic", "通用文字识别（高精度版）", "通用文字", "ocr/v1/accurate_basic", "997"],
  ["general", "通用文字识别（标准含位置版）", "通用文字", "ocr/v1/general", "1000"],
  ["general_basic", "通用文字识别（标准版）", "通用文字", "ocr/v1/general_basic", "1000"],
  ["webimage", "网络图片文字识别", "通用文字", "ocr/v1/webimage", "1000"],
  ["webimage_loc", "网络图片文字识别（含位置版）", "通用文字", "ocr/v1/webimage_loc", "500"],
  ["pp_ocrv5", "PPOCR-v6", "通用文字", "ocr/v1/pp_ocrv5", "1000"],
  ["general_ocr", "通用卡证票据识别", "通用文字", "ocr/v1/general_ocr", "200"],
  ["handwriting", "手写文字识别", "通用文字", "ocr/v1/handwriting", "500"],
  ["numbers", "数字识别", "通用文字", "ocr/v1/numbers", "1000"],
  ["formula", "公式识别", "通用文字", "ocr/v1/formula", "1000"],
  ["idcard", "身份证识别", "证件", "ocr/v1/idcard", "1000", { id_card_side: "front" }],
  ["bankcard", "银行卡识别", "证件", "ocr/v1/bankcard", "1000"],
  ["driving_license", "驾驶证识别", "证件", "ocr/v1/driving_license", "1000"],
  ["vehicle_license", "行驶证识别", "证件", "ocr/v1/vehicle_license", "1000"],
  ["license_plate", "车牌识别", "交通", "ocr/v1/license_plate", "1000"],
  ["passport", "护照识别", "证件", "ocr/v1/passport", "200"],
  ["overseas_passport", "海外护照识别", "证件", "ocr/v1/overseas_passport", "200"],
  ["household_register", "户口本识别", "证件", "ocr/v1/household_register", "200"],
  ["birth_certificate", "出生证明识别", "证件", "ocr/v1/birth_certificate", "200"],
  ["marriage_certificate", "结婚证识别", "证件", "ocr/v1/marriage_certificate", "200"],
  ["divorce_certificate", "离婚证识别", "证件", "ocr/v1/divorce_certificate", "200"],
  ["social_security_card", "社保卡识别", "证件", "ocr/v1/social_security_card", "200"],
  ["HK_Macau_exitentrypermit", "港澳通行证识别", "证件", "ocr/v1/HK_Macau_exitentrypermit", "200"],
  ["taiwan_exitentrypermit", "台湾通行证识别", "证件", "ocr/v1/taiwan_exitentrypermit", "200"],
  ["receipt", "通用票据识别", "票据", "ocr/v1/receipt", "1000"],
  ["invoice", "通用机打发票识别", "票据", "ocr/v1/invoice", "200"],
  ["vat_invoice", "增值税发票识别", "票据", "ocr/v1/vat_invoice", "1000"],
  ["quota_invoice", "定额发票识别", "票据", "ocr/v1/quota_invoice", "200"],
  ["vehicle_invoice", "机动车销售发票识别", "票据", "ocr/v1/vehicle_invoice", "200"],
  ["used_vehicle_invoice", "二手车销售发票识别", "票据", "ocr/v1/used_vehicle_invoice", "200"],
  ["taxi_receipt", "出租车票识别", "票据", "ocr/v1/taxi_receipt", "200"],
  ["toll_invoice", "过路过桥费发票识别", "票据", "ocr/v1/toll_invoice", "200"],
  ["shopping_receipt", "购物小票识别", "票据", "ocr/v1/shopping_receipt", "200"],
  ["business_license", "营业执照识别", "商业", "ocr/v1/business_license", "1000"],
  ["business_card", "名片识别", "商业", "ocr/v1/business_card", "500"],
  ["train_ticket", "火车票识别", "交通", "ocr/v1/train_ticket", "200"],
  ["air_ticket", "飞机行程单识别", "交通", "ocr/v1/air_ticket", "200"],
  ["bus_ticket", "汽车票识别", "交通", "ocr/v1/bus_ticket", "200"],
  ["ferry_ticket", "船票识别", "交通", "ocr/v1/ferry_ticket", "200"],
  ["vin_code", "VIN 码识别", "交通", "ocr/v1/vin_code", "200"],
  ["vehicle_certificate", "车辆合格证识别", "交通", "ocr/v1/vehicle_certificate", "200"],
  ["vehicle_registration_certificate", "机动车登记证书识别", "交通", "ocr/v1/vehicle_registration_certificate", "200"],
  ["road_transport_certificate", "道路运输证识别", "交通", "ocr/v1/road_transport_certificate", "200"],
  ["qrcode", "二维码识别", "场景文字", "ocr/v1/qrcode", "500"],
  ["facade", "门脸文字识别", "场景文字", "ocr/v1/facade", "500"],
  ["meter", "仪器仪表盘读数识别", "场景文字", "ocr/v1/meter", "500"],
  ["seal", "印章识别", "场景文字", "ocr/v1/seal", "500"],
  ["waybill", "快递面单识别", "场景文字", "ocr/v1/waybill", "200"],
  ["weight_note", "磅单识别", "场景文字", "ocr/v1/weight_note", "200"],
  ["pen", "词典笔文字识别", "场景文字", "ocr/v1/pen", "500"],
  ["table", "表格文字识别 V2", "文档", "ocr/v1/table", "500"],
  ["doc_analysis", "试卷分析与识别", "文档", "ocr/v1/doc_analysis", "500"],
  ["doc_analysis_office", "办公文档识别", "文档", "ocr/v1/doc_analysis_office", "500"],
  ["doc_classify", "文件检测分类", "文档", "ocr/v1/doc_classify", "200"],
  ["smart_struct", "智能结构化", "文档", "ocr/v1/smart_struct", "200"],
  ["medical_record", "病案首页识别", "医疗", "ocr/v1/medical_record", "200"],
  ["medical_statement", "医疗费用结算单识别", "医疗", "ocr/v1/medical_statement", "200"],
  ["medical_invoice", "医疗发票识别", "医疗", "ocr/v1/medical_invoice", "200"],
  ["medical_detail", "医疗费用明细识别", "医疗", "ocr/v1/medical_detail", "200"],
  ["medical_report_detection", "医疗检验报告单识别", "医疗", "ocr/v1/medical_report_detection", "200"],
  ["medical_summary", "出院小结识别", "医疗", "ocr/v1/medical_summary", "200"],
  ["health_report", "诊断报告单识别", "医疗", "ocr/v1/health_report", "200"]
];

function findService(id) {
  return SERVICES.find((s) => s[0] === id);
}

function publicServices() {
  return SERVICES.map(([id, name, category, , freeQuota]) => ({ id, name, category, freeQuota }));
}

// 带超时的 fetch
async function fetchWithTimeout(url, options, timeout = FETCH_TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

// 获取 Baidu access token
async function getAccessToken(apiKey, secretKey) {
  const params = new URLSearchParams({ grant_type: "client_credentials", client_id: apiKey, client_secret: secretKey });
  const response = await fetchWithTimeout(`https://aip.baidubce.com/oauth/2.0/token?${params}`, { method: "POST" });
  const data = await response.json();
  if (!data.access_token) throw new Error(data.error_description || data.error_msg || "获取 Baidu token 失败");
  return data.access_token;
}

// 从各种 OCR 响应格式中提取文本
function extractText(data) {
  // PPOCR
  if (data.page_result && data.page_result[0]?.lines) return data.page_result[0].lines;
  // 标准格式
  if (Array.isArray(data.words_result)) return data.words_result.map((w) => w.words).filter(Boolean);
  // 二维码
  if (Array.isArray(data.codes_result)) return data.codes_result.flatMap((c) => c.text || []);
  // 银行卡
  if (data.result?.bank_card_number) {
    const r = data.result;
    const lines = [];
    if (r.bank_card_number) lines.push("银行卡号: " + r.bank_card_number);
    if (r.bank_name) lines.push("银行: " + r.bank_name);
    if (r.holder_name) lines.push("持卡人: " + r.holder_name);
    return lines;
  }
  // 通用卡证
  if (data.results && typeof data.results === "object" && !Array.isArray(data.results)) {
    const lines = [];
    for (const key of Object.keys(data.results)) {
      const item = data.results[key];
      if (typeof item === "object") {
        for (const fname of Object.keys(item)) {
          const field = item[fname];
          if (Array.isArray(field)) {
            for (const entry of field) {
              if (entry?.words) {
                const txt = Array.isArray(entry.words) ? entry.words.join(" ") : entry.words;
                lines.push(fname + ": " + txt);
              }
            }
          }
        }
      }
    }
    return lines;
  }
  // 文档分析
  if (Array.isArray(data.results) && data.results[0]?.words?.word) {
    return data.results.map((r) => r.words.word).filter(Boolean);
  }
  return [];
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, message: "仅支持 POST 请求" }), {
      status: 405, headers: { "Content-Type": "application/json" }
    });
  }

  try {
    // 检查 API 密钥
    const apiKey = env.BAIDU_OCR_API_KEY;
    const secretKey = env.BAIDU_OCR_SECRET_KEY;
    if (!apiKey || !secretKey) {
      return new Response(JSON.stringify({ ok: false, message: "请在 Cloudflare Pages 环境变量中配置 BAIDU_OCR_API_KEY 和 BAIDU_OCR_SECRET_KEY" }), {
        status: 400, headers: { "Content-Type": "application/json" }
      });
    }

    // 解析请求
    const payload = await request.json();
    const { imageBase64, mimeType, serviceId } = payload;

    if (!imageBase64) {
      return new Response(JSON.stringify({ ok: false, message: "请选择图片后再识别" }), {
        status: 400, headers: { "Content-Type": "application/json" }
      });
    }
    if (!IMAGE_TYPES.has(mimeType)) {
      return new Response(JSON.stringify({ ok: false, message: "仅支持 JPG、PNG、WebP、BMP 格式" }), {
        status: 400, headers: { "Content-Type": "application/json" }
      });
    }
    const imgBytes = Math.ceil(imageBase64.length * 3 / 4);
    if (imgBytes > MAX_IMAGE_BYTES) {
      return new Response(JSON.stringify({ ok: false, message: "图片大小不能超过 5 MB" }), {
        status: 400, headers: { "Content-Type": "application/json" }
      });
    }

    const service = findService(serviceId || "accurate");
    if (!service) {
      return new Response(JSON.stringify({ ok: false, message: "不支持的 OCR 接口" }), {
        status: 400, headers: { "Content-Type": "application/json" }
      });
    }

    // 获取 Baidu token
    const token = await getAccessToken(apiKey, secretKey);

    // 调用 OCR API
    const body = new URLSearchParams({ image: imageBase64 });
    const extraParams = service[5] || {};
    for (const [k, v] of Object.entries(extraParams)) body.set(k, v);

    const ocrRes = await fetchWithTimeout(
      `https://aip.baidubce.com/rest/2.0/${service[3]}?access_token=${encodeURIComponent(token)}`,
      { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body }
    );
    const ocrData = await ocrRes.json();

    if (ocrData.error_code) {
      return new Response(JSON.stringify({ ok: false, message: ocrData.error_msg || "OCR 识别失败", code: ocrData.error_code }), {
        status: 422, headers: { "Content-Type": "application/json" }
      });
    }

    const lines = extractText(ocrData);
    const plainText = lines.join("\n");

    return new Response(JSON.stringify({
      ok: true, lines, wordsCount: lines.length, text: plainText, plainText, layoutText: plainText, hasLayout: false
    }), {
      status: 200, headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    if (err.name === "AbortError") {
      return new Response(JSON.stringify({ ok: false, message: "百度 OCR 接口请求超时，请稍后重试" }), {
        status: 504, headers: { "Content-Type": "application/json" }
      });
    }
    return new Response(JSON.stringify({ ok: false, message: err.message || "服务器内部错误" }), {
      status: 500, headers: { "Content-Type": "application/json" }
    });
  }
}