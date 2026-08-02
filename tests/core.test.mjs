import assert from "node:assert/strict";
import test from "node:test";
import { filterAndSortStocks, isStale, phaseLabel, phaseMeaning, safeHttpsUrl } from "../src/core.mjs";
import { DEMO_STOCKS, demoDetail } from "../src/demo-data.mjs";

test("filters and sorts the watchlist without mutating source data", () => {
  const original = [...DEMO_STOCKS];
  assert.deepEqual(filterAndSortStocks(DEMO_STOCKS, "BUY").map(item => item.ticker), ["ACRN"]);
  assert.deepEqual(filterAndSortStocks(DEMO_STOCKS, "ALL", "action").map(item => item.action), ["BUY", "WAIT", "AVOID"]);
  assert.deepEqual(filterAndSortStocks(DEMO_STOCKS, "ALL", "ticker").map(item => item.ticker), ["ACRN", "HALO", "ORBT"]);
  assert.deepEqual(DEMO_STOCKS, original);
});

test("keeps phase explanations and URLs safe", () => {
  assert.equal(phaseLabel("NARRATIVE_RESET"), "NARRATIVE RESET");
  assert.match(phaseMeaning("CROWDED_BULLISH"), /eingepreist/);
  assert.equal(safeHttpsUrl("https://example.com/a"), "https://example.com/a");
  assert.equal(safeHttpsUrl("javascript:alert(1)"), "");
});

test("marks stale analyses deterministically", () => {
  const analyzedAt = "2026-01-01T00:00:00Z";
  assert.equal(isStale(analyzedAt, Date.parse("2026-03-01T00:00:00Z"), 90), false);
  assert.equal(isStale(analyzedAt, Date.parse("2026-05-01T00:00:00Z"), 90), true);
});

test("demo details contain history and no live identifiers", () => {
  const detail = demoDetail("XNAS:ACRN");
  assert.equal(detail.stock.ticker, "ACRN");
  assert.equal(detail.history.length, 1);
  assert.match(detail.currentAnalysis.analysisId, /^demo-/);
});

