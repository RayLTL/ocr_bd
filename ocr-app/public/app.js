const input = document.querySelector("#file-input");
const preview = document.querySelector("#preview");
const uploadCopy = document.querySelector("#upload-copy");
const recognize = document.querySelector("#recognize");
const status = document.querySelector("#status");
const resultText = document.querySelector("#result-text");
const copy = document.querySelector("#copy");
const layoutMode = document.querySelector("#layout-mode");
const plainMode = document.querySelector("#plain-mode");
const serviceSearch = document.querySelector("#service-search");
const serviceList = document.querySelector("#service-list");
const serviceDescription = document.querySelector("#service-description");
const settingsDialog = document.querySelector("#settings-dialog");
const profileSelect = document.querySelector("#profile-select");
const profileName = document.querySelector("#profile-name");
const apiKey = document.querySelector("#api-key");
const secretKey = document.querySelector("#secret-key");
const profileHint = document.querySelector("#profile-hint");
let selectedImage;
let recognizedResult;
let profiles = [];
let activeProfileId;
let services = [];
let selectedService;

function setStatus(message) { status.textContent = message; }

async function api(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "请求失败。");
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

function currentProfile() { return profiles.find((profile) => profile.id === profileSelect.value); }

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

function renderProfiles() {
  profileSelect.replaceChildren(...profiles.map((profile) => {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = `${profile.name}${profile.isActive ? "（当前）" : ""}`;
    return option;
  }));
  profileSelect.value = activeProfileId || profiles[0]?.id || "";
  loadSelectedProfile();
}

function loadSelectedProfile() {
  const profile = currentProfile();
  if (!profile) {
    profileName.value = "";
    apiKey.value = "";
    secretKey.value = "";
    profileHint.textContent = "尚未保存 API 配置。新建配置后即可识别。";
    return;
  }
  profileName.value = profile.name;
  apiKey.value = "";
  secretKey.value = "";
  apiKey.placeholder = `当前：${profile.apiKeyHint}，留空则保留`;
  secretKey.placeholder = "留空则保留当前 Secret Key";
  profileHint.textContent = profile.isActive ? "当前用于 OCR 识别的配置。" : "保存后可切换为当前识别配置。";
}

async function refreshProfiles() {
  const data = await api("/api/profiles");
  profiles = data.profiles;
  activeProfileId = data.activeProfileId;
  renderProfiles();
}

input.addEventListener("change", () => selectFile(input.files[0]));
document.querySelector("#dropzone").addEventListener("dragover", (event) => event.preventDefault());
document.querySelector("#dropzone").addEventListener("drop", (event) => { event.preventDefault(); selectFile(event.dataTransfer.files[0]); });

recognize.addEventListener("click", async () => {
  if (!selectedImage) return;
  recognize.disabled = true;
  copy.disabled = true;
  setStatus("正在识别...");
  resultText.textContent = "";
  try {
    const imageBase64 = await toBase64(selectedImage);
    const result = await api("/api/ocr", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageBase64, mimeType: selectedImage.type, serviceId: selectedService?.id }) });
    recognizedResult = result;
    showResult("layout");
    copy.disabled = !result.layoutText;
    layoutMode.disabled = !result.hasLayout;
    plainMode.disabled = !result.hasLayout;
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

serviceSearch.addEventListener("focus", () => { serviceSearch.select(); renderServices(serviceSearch.value); serviceList.hidden = false; });
serviceSearch.addEventListener("input", () => { renderServices(serviceSearch.value); serviceList.hidden = false; });
serviceList.addEventListener("mousedown", (event) => event.preventDefault());
serviceList.addEventListener("click", (event) => {
  const option = event.target.closest(".service-option");
  if (!option) return;
  selectService(services.find((service) => service.id === option.dataset.serviceId));
});

document.querySelector("#api-settings").addEventListener("click", async () => { await refreshProfiles(); settingsDialog.showModal(); });
document.querySelector("#close-settings").addEventListener("click", () => settingsDialog.close());
profileSelect.addEventListener("change", loadSelectedProfile);
document.querySelector("#new-profile").addEventListener("click", () => {
  profileSelect.value = "";
  profileName.value = "";
  apiKey.value = "";
  secretKey.value = "";
  apiKey.placeholder = "请输入新的 API Key";
  secretKey.placeholder = "请输入新的 Secret Key";
  profileHint.textContent = "保存后将自动成为当前识别配置。";
});
document.querySelector("#activate-profile").addEventListener("click", async () => {
  if (!currentProfile()) return;
  await api(`/api/profiles/${encodeURIComponent(currentProfile().id)}/activate`, { method: "POST" });
  await refreshProfiles();
});
document.querySelector("#delete-profile").addEventListener("click", async () => {
  if (!currentProfile() || !confirm(`删除“${currentProfile().name}”吗？`)) return;
  await api(`/api/profiles/${encodeURIComponent(currentProfile().id)}`, { method: "DELETE" });
  await refreshProfiles();
});
document.querySelector("#settings-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = { name: profileName.value, apiKey: apiKey.value, secretKey: secretKey.value };
  const profile = currentProfile();
  if (profile) await api(`/api/profiles/${encodeURIComponent(profile.id)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  else await api("/api/profiles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  await refreshProfiles();
});

loadServices().catch((error) => setStatus(error.message));
