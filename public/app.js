const input = document.querySelector("#file-input");
const preview = document.querySelector("#preview");
const uploadCopy = document.querySelector("#upload-copy");
const recognize = document.querySelector("#recognize");
const status = document.querySelector("#status");
const resultText = document.querySelector("#result-text");
const copy = document.querySelector("#copy");
const copyLatex = document.querySelector("#copy-latex");
const copyMathml = document.querySelector("#copy-mathml");
const btnExportTxt = document.querySelector("#export-txt");
const btnExportXlsx = document.querySelector("#export-xlsx");
const layoutMode = document.querySelector("#layout-mode");
const plainMode = document.querySelector("#plain-mode");
const serviceSearch = document.querySelector("#service-search");
const serviceList = document.querySelector("#service-list");
const serviceDescription = document.querySelector("#service-description");
const apiStatus = document.querySelector("#api-status");
let selectedImage;
let recognizedResult;
let services = [];
let selectedService;

function setStatus(message) { status.textContent = message; }

async function api(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || data.error || "请求失败。");
  return data;
}

function showResult(mode) {
  if (!recognizedResult) return;
  const usesLayout = mode === "layout";
  resultText.textContent = usesLayout ? recognizedResult.layoutText : recognizedResult.plainText;
  layoutMode.classList.toggle("active", usesLayout);
  plainMode.classList.toggle("active", !usesLayout);
}

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result).split(",", 2)[1]));
    reader.addEventListener("error", () => reject(reader.error || new Error("Unable to read image.")));
    reader.readAsDataURL(file);
  });
}

function selectFile(file) {
  if (!file) return;
  if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
    setStatus("请选择 5 MB 以内的图片文件。");
    return;
  }
  selectedImage = file;
  preview.src = URL.createObjectURL(file);
  preview.hidden = false;
  uploadCopy.hidden = true;
  recognize.disabled = false;
  setStatus(`${file.name}，已准备识别`);
}

function matchesService(service, query) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  const value = `${service.name} ${service.category} ${service.id}`.toLowerCase();
  if (value.includes(normalizedQuery)) return true;
  let position = 0;
  for (const character of normalizedQuery) {
    position = value.indexOf(character, position);
    if (position === -1) return false;
    position += 1;
  }
  return true;
}

function selectService(service) {
  selectedService = service;
  serviceSearch.value = service.name;
  serviceDescription.textContent = `${service.category} · 剩余免费 ${service.freeQuota} 次 · ${service.id}`;
  // 公式识别接口显示 LaTeX 相关按钮
  const isFormula = service.id === "formula";
  copyLatex.hidden = !isFormula;
  copyMathml.hidden = !isFormula;
  serviceList.hidden = true;
}

function renderServices(query = "") {
  const matches = services.filter((service) => matchesService(service, query)).slice(0, 16);
  serviceList.replaceChildren(...matches.map((service) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "service-option";
    option.dataset.serviceId = service.id;
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", String(service.id === selectedService?.id));
    option.innerHTML = `<strong>${service.name}</strong><span>${service.category} · 免费 ${service.freeQuota} 次</span>`;
    return option;
  }));
  if (!matches.length) serviceList.textContent = "没有匹配的接口";
}

async function loadServices() {
  const data = await api("/api/services");
  services = data.services;
  selectService(services.find((service) => service.id === data.defaultServiceId) || services[0]);
}

async function checkApiStatus() {
  try {
    const data = await api("/api/health");
    if (data.ready) {
      apiStatus.innerHTML = "&#9679; API 已就绪";
      apiStatus.className = "api-status ready";
    } else {
      apiStatus.innerHTML = "&#9679; API 未配置";
      apiStatus.className = "api-status error";
    }
  } catch {
    apiStatus.innerHTML = "&#9679; 连接失败";
    apiStatus.className = "api-status error";
  }
}

// ========== 导出功能（客户端） ==========

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function getCurrentText() {
  return resultText.textContent || "";
}

function getExportFileName(ext) {
  const base = selectedImage ? selectedImage.name.replace(/\.[^.]+$/, "") : "ocr_result";
  const serviceTag = selectedService ? selectedService.id : "unknown";
  return `${base}_${serviceTag}.${ext}`;
}

function exportTxt() {
  const text = getCurrentText();
  if (!text) return;
  const fileName = getExportFileName("txt");
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  downloadBlob(blob, fileName);
  setStatus(`已导出 ${fileName}`);
}

function exportXlsx() {
  const text = getCurrentText();
  if (!text) return;
  const fileName = getExportFileName("xlsx");

  if (typeof XLSX === "undefined") {
    setStatus("Excel 导出库未加载，请检查网络后重试");
    return;
  }

  // 检测是否有分列特征（>=2个空格），有则自动分列
  const lines = text.split("\n").filter((l) => l.trim());
  const hasMultiColumn = lines.some((line) => {
    let inGap = false, gapLen = 0;
    for (let i = line.length - 1; i >= 0; i--) {
      if (line[i] === " ") { if (!inGap) { inGap = true; gapLen = 1; } else { gapLen++; } }
      else { if (inGap && gapLen >= 2) return true; inGap = false; gapLen = 0; }
    }
    return false;
  });

  let data;
  if (hasMultiColumn && lines.length >= 2) {
    // 逐行分列
    const parts = lines.map((line) => {
      let gapEnd = -1, inGap = false;
      for (let i = line.length - 1; i >= 0; i--) {
        if (line[i] === " ") { if (!inGap) { inGap = true; gapEnd = i + 1; } }
        else { if (inGap && (gapEnd - (i + 1)) >= 2) return [line.slice(0, i + 1).trim(), line.slice(gapEnd).trim()]; inGap = false; }
      }
      return [line.trim()];
    });
    const maxCols = Math.max(...parts.map((p) => p.length));
    const headers = parts[0].length >= 2 ? parts[0] : Array.from({ length: maxCols }, (_, i) => `列 ${i + 1}`);
    data = [headers, ...parts.slice(1).map((p) => { while (p.length < maxCols) p.push(""); return p; })];
  } else {
    data = [["行号", "文本"], ...lines.map((line, i) => [i + 1, line.trim()])];
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = data[0].map((h) => ({ wch: Math.max(String(h).length * 2 + 4, 12) }));
  XLSX.utils.book_append_sheet(wb, ws, "OCR 结果");

  const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  downloadBlob(blob, fileName);
  setStatus(`已导出 ${fileName}`);
}

// ========== 事件绑定 ==========

input.addEventListener("change", () => selectFile(input.files[0]));

// 拖拽交互
const dropzone = document.querySelector("#dropzone");
function dragHighlight() { dropzone.classList.add("drag-over"); }
function dragUnhighlight() { dropzone.classList.remove("drag-over"); }
dropzone.addEventListener("dragenter", (event) => { event.preventDefault(); dragHighlight(); });
dropzone.addEventListener("dragover", (event) => { event.preventDefault(); dragHighlight(); });
dropzone.addEventListener("dragleave", (event) => { if (!dropzone.contains(event.relatedTarget)) dragUnhighlight(); });
dropzone.addEventListener("drop", (event) => { event.preventDefault(); dragUnhighlight(); selectFile(event.dataTransfer.files[0]); });

recognize.addEventListener("click", async () => {
  if (!selectedImage) return;
  recognize.disabled = true;
  copy.disabled = true;
  copyLatex.disabled = true;
  copyMathml.disabled = true;
  btnExportTxt.disabled = true;
  btnExportXlsx.disabled = true;
  setStatus("正在识别...");
  resultText.textContent = "";
  try {
    const imageBase64 = await toBase64(selectedImage);
    const result = await api("/api/ocr", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageBase64, mimeType: selectedImage.type, serviceId: selectedService?.id }) });
    recognizedResult = result;
    showResult("layout");
    copy.disabled = !result.layoutText;
    copyLatex.disabled = false;
    copyLatex.hidden = selectedService?.id !== "formula";
    copyMathml.disabled = false;
    copyMathml.hidden = selectedService?.id !== "formula";
    layoutMode.disabled = !result.hasLayout;
    plainMode.disabled = false;
    btnExportTxt.disabled = false;
    btnExportXlsx.disabled = false;
    setStatus(`已识别 ${result.wordsCount} 行文字`);
  } catch (error) {
    resultText.textContent = error.message;
    setStatus("识别失败");
  } finally {
    recognize.disabled = false;
  }
});

layoutMode.addEventListener("click", () => showResult("layout"));
plainMode.addEventListener("click", () => showResult("plain"));
copy.addEventListener("click", async () => { await navigator.clipboard.writeText(resultText.textContent); setStatus("已复制识别结果"); });
copyLatex.addEventListener("click", async () => {
  const latex = recognizedResult?.latexSource || resultText.textContent;
  await navigator.clipboard.writeText(latex);
  setStatus("已复制 LaTeX 源码");
});
copyMathml.addEventListener("click", async () => {
  const latex = recognizedResult?.latexSource || resultText.textContent;
  if (!latex) return;
  try {
    if (typeof katex === "undefined") {
      setStatus("KaTeX 库未加载，请检查网络");
      return;
    }

    // 将每行 LaTeX 分别转为 MathML
    const lines = latex.split("\n").filter(l => l.trim());
    const mathmlParts = lines.map(line => {
      return katex.renderToString(line.trim(), {
        output: "mathml",
        throwOnError: false,
        displayMode: true
      });
    });
    const combinedMathml = mathmlParts.join("");

    // 包装为 HTML，Word 打开 HTML 时识别 <math> 标签转为公式
    const wordHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-size:14pt">
${combinedMathml}
</body>
</html>`;

    // 方法1：ClipboardItem 写 text/html
    try {
      const htmlBlob = new Blob([wordHtml], { type: "text/html" });
      await navigator.clipboard.write([
        new ClipboardItem({ "text/html": htmlBlob })
      ]);
      setStatus("已复制，在 Word 中粘贴即可");
      return;
    } catch (_e) { /* 降级 */ }

    // 方法2：execCommand 复制 HTML
    try {
      const container = document.createElement("div");
      container.contentEditable = "true";
      container.innerHTML = wordHtml;
      container.style.cssText = "position:fixed;left:-9999px;top:0";
      document.body.appendChild(container);
      const range = document.createRange();
      range.selectNodeContents(container);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand("copy");
      sel.removeAllRanges();
      document.body.removeChild(container);
      setStatus("已复制，在 Word 中粘贴即可");
      return;
    } catch (_e2) { /* 降级 */ }

    // 方法3：兜底，复制 LaTeX 源码 + 使用说明
    await navigator.clipboard.writeText(latex);
    setStatus("已复制 LaTeX 源码，Word 中按 Alt+= 打开公式编辑器，粘贴后按 Enter");
  } catch (err) {
    setStatus("复制失败: " + err.message);
  }
});
btnExportTxt.addEventListener("click", exportTxt);
btnExportXlsx.addEventListener("click", exportXlsx);

serviceSearch.addEventListener("focus", () => { serviceSearch.select(); renderServices(serviceSearch.value); serviceList.hidden = false; });
serviceSearch.addEventListener("input", () => { renderServices(serviceSearch.value); serviceList.hidden = false; });
serviceSearch.addEventListener("blur", () => { setTimeout(() => { serviceList.hidden = true; }, 150); });
serviceList.addEventListener("mousedown", (event) => event.preventDefault());
serviceList.addEventListener("click", (event) => {
  const option = event.target.closest(".service-option");
  if (!option) return;
  selectService(services.find((service) => service.id === option.dataset.serviceId));
  serviceList.hidden = true;
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".service-picker")) serviceList.hidden = true;
});

// 初始化
loadServices().catch((error) => setStatus(error.message));
checkApiStatus();