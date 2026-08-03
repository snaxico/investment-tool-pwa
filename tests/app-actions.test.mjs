import assert from "node:assert/strict";
import test from "node:test";
import { AppsScriptActionError, normalizeDeploymentId, runAppsScriptAction } from "../src/app-actions.mjs";

test("validates private Apps Script deployment identifiers", () => {
  assert.equal(normalizeDeploymentId("AKfycb12345678901234567890"), "AKfycb12345678901234567890");
  assert.equal(normalizeDeploymentId("https://script.google.com/example"), "");
});

test("runs only the fixed runAppAction entry point", async () => {
  let observed;
  const result = await runAppsScriptAction({
    accessToken: "write-token", deploymentId: "AKfycb12345678901234567890", request: { action: "UPDATE_MARKET_DATA" },
    fetchImpl: async (url, options) => {
      observed = { url, options };
      return { ok: true, json: async () => ({ response: { result: { updateId: "run-1" } } }) };
    }
  });
  assert.equal(result.updateId, "run-1");
  assert.match(observed.url, /script\.googleapis\.com\/v1\/scripts\/AKfy/);
  assert.deepEqual(JSON.parse(observed.options.body), {
    function: "runAppAction", parameters: [{ action: "UPDATE_MARKET_DATA" }], devMode: false
  });
  assert.equal(observed.options.credentials, "omit");
});

test("rejects actions without an in-memory write token", async () => {
  await assert.rejects(() => runAppsScriptAction({ deploymentId: "AKfycb12345678901234567890", request: {} }), AppsScriptActionError);
});
