import assert from "node:assert/strict";
import test from "node:test";
import { createPrivateSetupUrl, decodePrivateSetup, encodePrivateSetup, readPrivateSetupFromHash } from "../src/device-setup.mjs";

const config = {
  googleClientId: "12345678-example.apps.googleusercontent.com",
  trackerSpreadsheetId: "12345678901234567890",
  appsScriptDeploymentId: "AKfycb12345678901234567890",
  gptUrl: "https://chatgpt.com/g/example"
};

test("round-trips a private device setup without adding credentials", () => {
  const encoded = encodePrivateSetup(config);
  assert.deepEqual(decodePrivateSetup(encoded), config);
  assert.doesNotMatch(encoded, /apps\.googleusercontent|spreadsheets|chatgpt/);
});

test("places private setup in the URL fragment, never the request URL", () => {
  const setupUrl = new URL(createPrivateSetupUrl("https://snaxico.github.io/investment-tool-pwa/?demo=0", config));
  assert.equal(setupUrl.origin + setupUrl.pathname + setupUrl.search, "https://snaxico.github.io/investment-tool-pwa/?demo=0");
  assert.match(setupUrl.hash, /^#setup=/);
  assert.deepEqual(readPrivateSetupFromHash(setupUrl.hash), config);
});

test("rejects malformed and unsupported setup payloads", () => {
  assert.throws(() => decodePrivateSetup("not-valid-base64"), /ungültig/);
  const unsupported = encodePrivateSetup(config);
  const decoded = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(unsupported.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(unsupported.length / 4) * 4, "=")), char => char.charCodeAt(0))));
  decoded.version = 99;
  const value = btoa(JSON.stringify(decoded)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  assert.throws(() => decodePrivateSetup(value), /nicht unterstützt/);
});
