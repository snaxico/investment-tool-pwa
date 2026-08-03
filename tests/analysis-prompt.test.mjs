import test from "node:test";
import assert from "node:assert/strict";
import { buildFullAnalysisPrompt, normalizeAnalysisTicker } from "../src/analysis-prompt.mjs";

test("normalizes a supported ticker", () => {
  assert.equal(normalizeAnalysisTicker(" brk.b "), "BRK.B");
  assert.equal(normalizeAnalysisTicker("etr:sap"), "ETR:SAP");
});

test("rejects empty or unsafe ticker input", () => {
  assert.throws(() => normalizeAnalysisTicker(""), /gültigen Ticker/);
  assert.throws(() => normalizeAnalysisTicker("NVDA please"), /gültigen Ticker/);
});

test("builds the strict complete v5.1 analysis command", () => {
  const prompt = buildFullAnalysisPrompt("nvda");
  assert.match(prompt, /^FULL_ANALYSIS: NVDA/);
  assert.match(prompt, /complete Investment Tool v5\.1-slim workflow now/);
  assert.match(prompt, /first workflow action must be current Web Search/);
  assert.match(prompt, /free public sources/);
  assert.match(prompt, /Do not first acknowledge/);
  assert.match(prompt, /every required schema-v3 field and calculation/);
  assert.match(prompt, /validate and save the finished snapshot/);
  assert.match(prompt, /Do not ask for a separate approval/);
  assert.doesNotMatch(prompt, /PREVIEW|COMMIT/);
});
