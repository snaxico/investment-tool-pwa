import assert from "node:assert/strict";
import test from "node:test";
import {
  ANALYSES_HEADERS, STOCKS_HEADERS, TRACKER_RANGES, TRACK_RECORD_HEADERS, TrackerContractError,
  buildArchiveEntries, buildStockDetail, fetchAnalysisSnapshot, fetchTracker, normalizeSpreadsheetId, parseTrackerRanges
} from "../src/tracker-contract.mjs";

const stockRow = [
  "TEST", "Test Company", 100, "USD", "★", "☆", "★", 2, "BUY", "BUY", 2,
  "EARLY_RERATING", "POSITIVE", "POSITIVE", "POSITIVE", "POSITIVE", 4,
  "POSITIVE", "UP", "ATTRACTIVE", "SENSIBLE", "Catalyst", "Risk", "Watch",
  46000, "XNAS:TEST", "XNAS", "MSCI_WORLD_USD", "analysis-1", ""
];
const analysisRow = [
  "analysis-1", "XNAS:TEST", 46000, 46000, 100, "★", "☆", "★", 2, "BUY",
  "EARLY_RERATING", "BUY", 2, "Catalyst", "Risk", "Watch", "v5.1-slim", "3.0.0", ""
];
const trackRecordRow = [
  "analysis-1", "XNAS:TEST", 46000, "BUY", 100, 46000, "INTRADAY", 80, 140, "MSCI_WORLD_USD",
  90, 46000, "EXACT", 120, 46100, 99, 46100, "update-1", "", "", "OPEN", "", "", "", "", "", "",
  20, 10, 10, "ACTIVE", 46000, "", "OK", "", 46100
];
const settings = [
  ["Key", "Value"], ["tracker_contract_version", "1.1.0"], ["active_methodology_version", "v5.1-slim"],
  ["active_schema_version", "3.0.0"], ["benchmark_provider_MSCI_WORLD_EUR", "AMS:IWDA"],
  ["benchmark_provider_MSCI_WORLD_USD", "LON:IWDA"], ["automatic_market_update_enabled", "FALSE"]
];
const valueRanges = [
  { values: [STOCKS_HEADERS, stockRow] },
  { values: [ANALYSES_HEADERS, analysisRow] },
  { values: settings },
  { values: [TRACK_RECORD_HEADERS, trackRecordRow] }
];

test("fixtures match the 1.1 tracker widths", () => {
  assert.equal(stockRow.length, STOCKS_HEADERS.length);
  assert.equal(analysisRow.length, ANALYSES_HEADERS.length);
  assert.equal(trackRecordRow.length, TRACK_RECORD_HEADERS.length);
});

test("normalizes a spreadsheet URL without exposing it to public source", () => {
  assert.equal(normalizeSpreadsheetId("https://docs.google.com/spreadsheets/d/12345678901234567890/edit"), "12345678901234567890");
  assert.equal(normalizeSpreadsheetId("not-a-sheet"), "");
});

test("validates, joins, and maps the live Tracker contract", () => {
  const tracker = parseTrackerRanges(valueRanges, Date.parse("2026-08-02T00:00:00Z"));
  assert.equal(tracker.stocks[0].instrumentId, "XNAS:TEST");
  assert.equal(tracker.stocks[0].stars.sentiment, "☆");
  assert.equal(tracker.analyses[0].sheetRow, 2);
  const detail = buildStockDetail(tracker.stocks, tracker.analyses, tracker.trackRecords, "XNAS:TEST");
  assert.equal(detail.activeHistory.length, 1);
  assert.equal(detail.selectedAnalysis.trackRecord.excessPerformancePp, 10);
});

test("builds archive entries without deleting the analysis", () => {
  const archived = structuredClone(valueRanges);
  archived[3].values[1][30] = "ARCHIVED";
  const tracker = parseTrackerRanges(archived);
  const entries = buildArchiveEntries(tracker.stocks, tracker.analyses, tracker.trackRecords);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].analysisId, "analysis-1");
});

test("rejects a Tracker whose active schema differs", () => {
  const broken = structuredClone(valueRanges);
  broken[2].values[3][1] = "2.0.0";
  assert.throws(() => parseTrackerRanges(broken), TrackerContractError);
});

test("rejects an invalid automatic-update setting or duplicate analysis IDs", () => {
  const invalidSetting = structuredClone(valueRanges);
  invalidSetting[2].values[6][1] = "MAYBE";
  assert.throws(() => parseTrackerRanges(invalidSetting), /automatic_market_update_enabled/);
  const duplicate = structuredClone(valueRanges);
  duplicate[1].values.push([...analysisRow]);
  duplicate[3].values.push([...trackRecordRow]);
  assert.throws(() => parseTrackerRanges(duplicate), /duplicate analysis ID/);
});

test("uses one read-only, no-store Sheets batch request", async () => {
  let observed;
  const fetchImpl = async (url, options) => {
    observed = { url, options };
    return { ok: true, json: async () => ({ valueRanges }) };
  };
  const tracker = await fetchTracker({ accessToken: "memory-only-token", spreadsheetId: "12345678901234567890", fetchImpl });
  assert.equal(tracker.trackRecords.length, 1);
  assert.deepEqual(observed.url.searchParams.getAll("ranges"), TRACKER_RANGES);
  assert.equal(observed.options.method, "GET");
  assert.equal(observed.options.cache, "no-store");
  assert.equal(observed.options.credentials, "omit");
  assert.equal(observed.options.headers.Authorization, "Bearer memory-only-token");
});

test("loads snapshot JSON lazily from only the selected analysis row", async () => {
  let observed;
  const snapshot = await fetchAnalysisSnapshot({
    accessToken: "token", spreadsheetId: "12345678901234567890", sheetRow: 7,
    fetchImpl: async (url, options) => {
      observed = { url, options };
      return { ok: true, json: async () => ({ values: [[JSON.stringify({ analysis_id: "analysis-7" })]] }) };
    }
  });
  assert.equal(snapshot.analysis_id, "analysis-7");
  assert.match(decodeURIComponent(observed.url.pathname), /Analyses!T7$/);
  assert.equal(observed.options.cache, "no-store");
});
