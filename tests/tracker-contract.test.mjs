import assert from "node:assert/strict";
import test from "node:test";
import {
  ANALYSES_HEADERS, STOCKS_HEADERS, TRACKER_RANGES, TrackerContractError,
  buildStockDetail, fetchTracker, normalizeSpreadsheetId, parseTrackerRanges
} from "../src/tracker-contract.mjs";

const stockRow = [
  "TEST", "Test Company", 100, "USD", "★", "☆", "★", 2, "BUY", "BUY", 2,
  "EARLY_RERATING", "POSITIVE", "POSITIVE", "POSITIVE", "POSITIVE", 4,
  "POSITIVE", "UP", "ATTRACTIVE", "SENSIBLE", "Catalyst", "Risk", "Watch",
  46000, "XNAS:TEST", "XNAS", "SPY", "analysis-1", ""
];
const analysisRow = [
  "analysis-1", "XNAS:TEST", 46000, 46000, 100, "★", "☆", "★", 2, "BUY",
  "EARLY_RERATING", "BUY", 2, "Catalyst", "Risk", "Watch", "v5.1-slim", "3.0.0", "", "{}"
];
const valueRanges = [
  { values: [STOCKS_HEADERS, stockRow] },
  { values: [ANALYSES_HEADERS, analysisRow] },
  { values: [["Key", "Value"], ["tracker_contract_version", "1.0.0"], ["active_methodology_version", "v5.1-slim"], ["active_schema_version", "3.0.0"]] }
];

test("normalizes a spreadsheet URL without exposing it to public source", () => {
  assert.equal(normalizeSpreadsheetId("https://docs.google.com/spreadsheets/d/12345678901234567890/edit"), "12345678901234567890");
  assert.equal(normalizeSpreadsheetId("not-a-sheet"), "");
});

test("validates and maps the live Tracker contract", () => {
  const tracker = parseTrackerRanges(valueRanges, Date.parse("2026-08-02T00:00:00Z"));
  assert.equal(tracker.stocks[0].instrumentId, "XNAS:TEST");
  assert.equal(tracker.stocks[0].stars.sentiment, "☆");
  assert.equal(tracker.analyses[0].analysisId, "analysis-1");
  assert.equal(buildStockDetail(tracker.stocks, tracker.analyses, "XNAS:TEST").history.length, 1);
});

test("rejects a Tracker whose active schema differs", () => {
  const broken = structuredClone(valueRanges);
  broken[2].values[3][1] = "2.0.0";
  assert.throws(() => parseTrackerRanges(broken), TrackerContractError);
});

test("uses one read-only, no-store Sheets batch request", async () => {
  let observed;
  const fetchImpl = async (url, options) => {
    observed = { url, options };
    return { ok: true, json: async () => ({ valueRanges }) };
  };
  const tracker = await fetchTracker({
    accessToken: "memory-only-token",
    spreadsheetId: "12345678901234567890",
    fetchImpl
  });
  assert.equal(tracker.stocks.length, 1);
  assert.deepEqual(observed.url.searchParams.getAll("ranges"), TRACKER_RANGES);
  assert.equal(observed.options.method, "GET");
  assert.equal(observed.options.cache, "no-store");
  assert.equal(observed.options.credentials, "omit");
  assert.equal(observed.options.headers.Authorization, "Bearer memory-only-token");
});
