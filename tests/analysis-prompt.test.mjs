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
  assert.match(prompt, /v5\.1-slim is the only active methodology/);
  assert.match(prompt, /schema v3\) is only the data contract/);
  assert.match(prompt, /MSCI_WORLD_EUR/);
  assert.match(prompt, /MSCI_WORLD_USD/);
  assert.match(prompt, /begin Web Search immediately/);
  assert.match(prompt, /free public sources/);
  assert.match(prompt, /intraday quote/);
  assert.match(prompt, /weekends or market holidays/);
  assert.match(prompt, /runInvestmentToolAnalysisAction succeeds in PREVIEW/);
  assert.match(prompt, /approval to save/);
});
