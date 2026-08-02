const SETUP_VERSION = 1;
const MAX_PAYLOAD_LENGTH = 8192;

function toBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length > MAX_PAYLOAD_LENGTH) {
    throw new Error("Der private Einrichtungslink ist ungültig.");
  }
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodePrivateSetup(config) {
  const payload = {
    version: SETUP_VERSION,
    googleClientId: String(config.googleClientId || "").trim(),
    trackerSpreadsheetId: String(config.trackerSpreadsheetId || "").trim(),
    gptUrl: String(config.gptUrl || "").trim()
  };
  return toBase64Url(JSON.stringify(payload));
}

export function decodePrivateSetup(value) {
  let payload;
  try {
    payload = JSON.parse(fromBase64Url(String(value || "")));
  } catch (error) {
    if (error instanceof Error && error.message === "Der private Einrichtungslink ist ungültig.") throw error;
    throw new Error("Der private Einrichtungslink ist ungültig.");
  }
  if (!payload || payload.version !== SETUP_VERSION || typeof payload.googleClientId !== "string" || typeof payload.trackerSpreadsheetId !== "string" || typeof payload.gptUrl !== "string") {
    throw new Error("Der private Einrichtungslink wird von dieser App-Version nicht unterstützt.");
  }
  return Object.freeze({
    googleClientId: payload.googleClientId.trim(),
    trackerSpreadsheetId: payload.trackerSpreadsheetId.trim(),
    gptUrl: payload.gptUrl.trim()
  });
}

export function readPrivateSetupFromHash(hash) {
  const params = new URLSearchParams(String(hash || "").replace(/^#/, ""));
  const value = params.get("setup");
  return value ? decodePrivateSetup(value) : null;
}

export function createPrivateSetupUrl(currentUrl, config) {
  const url = new URL(currentUrl);
  url.hash = new URLSearchParams({ setup: encodePrivateSetup(config) }).toString();
  return url.toString();
}
