import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { extname, join, normalize } from "node:path";
import { recognizeOcrService, requestAccessToken, validateImagePayload } from "./lib/baidu.js";
import { findOcrService, publicOcrServices } from "./lib/services.js";

loadEnvironment();

const port = Number(process.env.PORT || 3000);
const publicDir = join(import.meta.dirname, "public");
const configPath = join(import.meta.dirname, ".ocr-api-config.json");
const tokenCache = new Map();
let apiConfig = loadApiConfig();

function loadEnvironment() {
  const envPath = join(import.meta.dirname, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

function loadApiConfig() {
  if (existsSync(configPath)) {
    const saved = JSON.parse(readFileSync(configPath, "utf8"));
    if (Array.isArray(saved.profiles)) return saved;
  }
  const profile = process.env.BAIDU_OCR_API_KEY && process.env.BAIDU_OCR_SECRET_KEY
    ? { id: randomUUID(), name: "Default API", apiKey: process.env.BAIDU_OCR_API_KEY, secretKey: process.env.BAIDU_OCR_SECRET_KEY }
    : null;
  const config = { activeProfileId: profile?.id || null, profiles: profile ? [profile] : [] };
  saveApiConfig(config);
  return config;
}

function saveApiConfig(config = apiConfig) {
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function getActiveProfile() {
  const profile = apiConfig.profiles.find((item) => item.id === apiConfig.activeProfileId);
  if (!profile) throw new Error("Create and activate a Baidu OCR API configuration before using OCR.");
  return profile;
}

function profileSummary(profile) {
  const apiKey = profile.apiKey || "";
  const hint = apiKey.length > 8 ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}` : "Configured";
  return { id: profile.id, name: profile.name, apiKeyHint: hint, isActive: profile.id === apiConfig.activeProfileId };
}

async function getAccessToken(profile) {
  const cached = tokenCache.get(profile.id);
  if (cached && cached.expiresAt > Date.now()) return cached.token;
  const result = await requestAccessToken(profile.apiKey, profile.secretKey);
  tokenCache.set(profile.id, { token: result.token, expiresAt: Date.now() + Math.max(result.expiresIn - 300, 60) * 1000 });
  return result.token;
}

function sendJson(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 8 * 1024 * 1024) throw new Error("Request is too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function getProfile(pathname) {
  const id = decodeURIComponent(pathname.split("/")[3] || "");
  const profile = apiConfig.profiles.find((item) => item.id === id);
  if (!profile) throw new Error("API configuration not found.");
  return profile;
}

function updateProfile(profile, payload) {
  const name = typeof payload.name === "string" ? payload.name.trim() : profile.name;
  if (!name) throw new Error("Configuration name is required.");
  const apiKey = typeof payload.apiKey === "string" && payload.apiKey.trim() ? payload.apiKey.trim() : profile.apiKey;
  const secretKey = typeof payload.secretKey === "string" && payload.secretKey.trim() ? payload.secretKey.trim() : profile.secretKey;
  if (!apiKey || !secretKey) throw new Error("API Key and Secret Key are required.");
  Object.assign(profile, { name, apiKey, secretKey });
  tokenCache.delete(profile.id);
}

const contentTypes = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };

createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");
    const { pathname } = url;

    if (request.method === "POST" && pathname === "/api/ocr") {
      const payload = await readJson(request);
      const validation = validateImagePayload(payload);
      if (!validation.ok) return sendJson(response, 400, validation);
      const service = findOcrService(payload.serviceId || "accurate");
      if (!service) return sendJson(response, 400, { message: "Select a supported OCR service." });
      const profile = getActiveProfile();
      const result = await recognizeOcrService(await getAccessToken(profile), payload.imageBase64, service);
      return sendJson(response, result.ok ? 200 : 422, result);
    }

    if (request.method === "GET" && pathname === "/api/services") {
      return sendJson(response, 200, { services: publicOcrServices(), defaultServiceId: "accurate" });
    }

    if (request.method === "GET" && pathname === "/api/profiles") {
      return sendJson(response, 200, { profiles: apiConfig.profiles.map(profileSummary), activeProfileId: apiConfig.activeProfileId });
    }

    if (request.method === "POST" && pathname === "/api/profiles") {
      const payload = await readJson(request);
      const profile = { id: randomUUID(), name: "", apiKey: "", secretKey: "" };
      updateProfile(profile, payload);
      apiConfig.profiles.push(profile);
      apiConfig.activeProfileId = profile.id;
      saveApiConfig();
      return sendJson(response, 201, { profile: profileSummary(profile) });
    }

    if (request.method === "PUT" && /^\/api\/profiles\/[^/]+$/.test(pathname)) {
      const profile = getProfile(pathname);
      updateProfile(profile, await readJson(request));
      saveApiConfig();
      return sendJson(response, 200, { profile: profileSummary(profile) });
    }

    if (request.method === "POST" && /^\/api\/profiles\/[^/]+\/activate$/.test(pathname)) {
      const profile = getProfile(pathname.replace(/\/activate$/, ""));
      apiConfig.activeProfileId = profile.id;
      saveApiConfig();
      return sendJson(response, 200, { profile: profileSummary(profile) });
    }

    if (request.method === "DELETE" && /^\/api\/profiles\/[^/]+$/.test(pathname)) {
      const profile = getProfile(pathname);
      apiConfig.profiles = apiConfig.profiles.filter((item) => item.id !== profile.id);
      if (apiConfig.activeProfileId === profile.id) apiConfig.activeProfileId = apiConfig.profiles[0]?.id || null;
      tokenCache.delete(profile.id);
      saveApiConfig();
      return sendJson(response, 200, { activeProfileId: apiConfig.activeProfileId });
    }

    if (request.method === "GET" && pathname === "/api/health") {
      const activeProfile = apiConfig.profiles.find((profile) => profile.id === apiConfig.activeProfileId);
      return sendJson(response, 200, { ready: Boolean(activeProfile?.apiKey && activeProfile?.secretKey), activeProfile: activeProfile?.name || null });
    }

    if (request.method !== "GET") return sendJson(response, 405, { message: "Method not allowed." });
    const requestedPath = pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
    const filePath = normalize(join(publicDir, requestedPath));
    if (!filePath.startsWith(publicDir)) return sendJson(response, 403, { message: "Forbidden." });
    const content = await readFile(filePath);
    response.writeHead(200, { "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream" });
    response.end(content);
  } catch (error) {
    const status = error instanceof SyntaxError || error.message === "Request is too large." || error.message.includes("not found") || error.message.includes("required") ? 400 : 500;
    sendJson(response, status, { message: error.message || "Unexpected server error." });
  }
}).listen(port, () => console.log(`OCR app available at http://localhost:${port}`));
