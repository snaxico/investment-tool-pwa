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

test("builds the proven concise analysis command", () => {
  const prompt = buildFullAnalysisPrompt("nvda");
  assert.equal(prompt, "Analyze NVDA based on the methodology and execute the work Flow.");
});
