export const STOCKS_HEADERS = Object.freeze([
  "Ticker", "Company", "Price", "Currency", "Fundamentals", "Sentiment", "Setup",
  "Score", "Action", "Price zone", "R/R", "Sentiment phase", "Growth",
  "Profitability", "Financial strength", "Execution", "Relative strength pp",
  "Earnings response", "Estimate direction", "Valuation", "Timing",
  "Primary catalyst", "Key risk", "Watch item", "Analysis date", "Instrument ID",
  "Exchange MIC", "Benchmark", "Analysis ID", "Analysis document URL"
]);

export const ANALYSES_HEADERS = Object.freeze([
  "analysis_id", "instrument_id", "analyzed_at", "source_cutoff_at", "reference_price",
  "fundamentals_star", "sentiment_star", "trade_setup_star", "star_count", "action",
  "sentiment_phase", "price_zone", "risk_reward_ratio", "primary_catalyst", "key_risk",
  "watch_item", "methodology_version", "schema_version", "analysis_document_url"
]);

export const TRACK_RECORD_HEADERS = Object.freeze([
  "analysis_id", "instrument_id", "analyzed_at", "action", "reference_price",
  "reference_price_at", "reference_price_basis", "bear_value", "base_value", "benchmark_id",
  "benchmark_start_price", "benchmark_start_at", "start_status", "latest_stock_price",
  "latest_stock_at", "latest_benchmark_price", "latest_benchmark_at", "latest_update_id",
  "base_first_observed_at", "bear_first_observed_at", "primary_outcome", "outcome_at",
  "outcome_stock_price", "outcome_benchmark_price", "outcome_benchmark_at", "outcome_update_id",
  "days_to_outcome", "stock_return_pct", "benchmark_return_pct", "excess_performance_pp",
  "state", "state_changed_at", "state_reason", "data_status", "data_reason", "updated_at"
]);

export const TRACKER_RANGES = Object.freeze([
  "Stocks!A1:AD",
  "Analyses!A1:S",
  "Settings!A1:B",
  "TrackRecord!A1:AJ"
]);

const EXPECTED_SETTINGS = Object.freeze({
  tracker_contract_version: "1.1.0",
  active_methodology_version: "v5.1-slim",
  active_schema_version: "3.0.0",
  benchmark_provider_MSCI_WORLD_EUR: "AMS:IWDA",
  benchmark_provider_MSCI_WORLD_USD: "LON:IWDA"
});

export class TrackerContractError extends Error {
  constructor(message) { super(message); this.name = "TrackerContractError"; }
}

export class GoogleSheetsError extends Error {
  constructor(message, status = 0) { super(message); this.name = "GoogleSheetsError"; this.status = status; }
}

export function normalizeSpreadsheetId(value) {
  const text = String(value || "").trim();
  const urlMatch = text.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/);
  if (urlMatch) return urlMatch[1];
  return /^[A-Za-z0-9_-]{20,}$/.test(text) ? text : "";
}

function assertHeaders(actual, expected, sheetName) {
  if (actual.length !== expected.length) throw new TrackerContractError(`${sheetName} header count does not match the tracker contract.`);
  expected.forEach((header, index) => {
    if (String(actual[index] || "") !== header) throw new TrackerContractError(`${sheetName} header mismatch at column ${index + 1}.`);
  });
}

function rowsToObjects(values, expectedHeaders, sheetName) {
  if (!Array.isArray(values) || !values.length) throw new TrackerContractError(`${sheetName} is empty.`);
  const headers = values[0].map(String);
  assertHeaders(headers, expectedHeaders, sheetName);
  return values.slice(1).map((row, index) => ({ row, sheetRow: index + 2 }))
    .filter(item => item.row.some(cell => cell !== "" && cell != null))
    .map(item => ({
      sheetRow: item.sheetRow,
      ...Object.fromEntries(headers.map((header, index) => [header, item.row[index]]))
    }));
}

function dateFromCell(value) {
  if (value === "" || value == null) return null;
  const date = typeof value === "number" && Number.isFinite(value) ? new Date((value - 25569) * 86400000) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TrackerContractError("Tracker contains an invalid date.");
  return date;
}

function isoOrNull(value) { return dateFromCell(value)?.toISOString() || null; }
function numberOrNull(value) { if (value === "" || value == null) return null; const n = Number(value); return Number.isFinite(n) ? n : null; }
function normalizeStar(value) { return value === true || value === "★" ? "★" : "☆"; }

function normalizeAutomaticUpdate(settings, nowMs) {
  const enabled = String(settings.automatic_market_update_enabled || "FALSE").toUpperCase() === "TRUE";
  const status = String(settings.automatic_update_last_status || "NEVER").toUpperCase();
  if (!["NEVER", "SUCCESS", "FAILED"].includes(status)) {
    throw new TrackerContractError("Tracker setting automatic_update_last_status must equal NEVER, SUCCESS, or FAILED.");
  }
  const lastRunAt = settings.automatic_update_last_run_at ? isoOrNull(settings.automatic_update_last_run_at) : null;
  const stale = enabled && (!lastRunAt || nowMs - Date.parse(lastRunAt) > 36 * 60 * 60 * 1000);
  return {
    enabled,
    status,
    lastRunAt,
    summary: String(settings.automatic_update_last_summary || ""),
    stale
  };
}

export function normalizeStockRows(values, nowMs = Date.now(), staleAfterDays = 90) {
  return rowsToObjects(values, STOCKS_HEADERS, "Stocks").map(row => {
    const analyzedAt = dateFromCell(row["Analysis date"]);
    const ageDays = Math.max(0, Math.floor((nowMs - analyzedAt.getTime()) / 86400000));
    return {
      ticker: String(row.Ticker || ""), company: String(row.Company || ""), price: numberOrNull(row.Price), currency: String(row.Currency || ""),
      stars: { fundamentals: normalizeStar(row.Fundamentals), sentiment: normalizeStar(row.Sentiment), setup: normalizeStar(row.Setup) },
      score: numberOrNull(row.Score) || 0, action: String(row.Action || "WAIT"), priceZone: String(row["Price zone"] || "WAIT"),
      riskReward: numberOrNull(row["R/R"]), sentimentPhase: String(row["Sentiment phase"] || ""),
      checks: { growth: String(row.Growth || ""), profitability: String(row.Profitability || ""), financialStrength: String(row["Financial strength"] || ""), execution: String(row.Execution || "") },
      relativeStrengthPp: numberOrNull(row["Relative strength pp"]), earningsResponse: String(row["Earnings response"] || ""),
      estimateDirection: String(row["Estimate direction"] || ""), valuation: String(row.Valuation || ""), timing: String(row.Timing || ""),
      primaryCatalyst: String(row["Primary catalyst"] || ""), keyRisk: String(row["Key risk"] || ""), watchItem: String(row["Watch item"] || ""),
      analyzedAt: analyzedAt.toISOString(), ageDays, stale: ageDays > staleAfterDays, instrumentId: String(row["Instrument ID"] || ""),
      exchangeMic: String(row["Exchange MIC"] || ""), benchmark: String(row.Benchmark || ""), analysisId: String(row["Analysis ID"] || ""),
      analysisDocumentUrl: String(row["Analysis document URL"] || "")
    };
  });
}

export function normalizeAnalysisRows(values) {
  return rowsToObjects(values, ANALYSES_HEADERS, "Analyses").map(row => ({
    sheetRow: row.sheetRow,
    analysisId: String(row.analysis_id || ""), instrumentId: String(row.instrument_id || ""), analyzedAt: isoOrNull(row.analyzed_at),
    sourceCutoffAt: isoOrNull(row.source_cutoff_at), referencePrice: numberOrNull(row.reference_price),
    stars: { fundamentals: normalizeStar(row.fundamentals_star), sentiment: normalizeStar(row.sentiment_star), setup: normalizeStar(row.trade_setup_star) },
    score: numberOrNull(row.star_count) || 0, action: String(row.action || "WAIT"), sentimentPhase: String(row.sentiment_phase || ""),
    priceZone: String(row.price_zone || "WAIT"), riskReward: numberOrNull(row.risk_reward_ratio), primaryCatalyst: String(row.primary_catalyst || ""),
    keyRisk: String(row.key_risk || ""), watchItem: String(row.watch_item || ""), methodologyVersion: String(row.methodology_version || ""),
    schemaVersion: String(row.schema_version || ""), analysisDocumentUrl: String(row.analysis_document_url || "")
  }));
}

export function normalizeTrackRecordRows(values) {
  return rowsToObjects(values, TRACK_RECORD_HEADERS, "TrackRecord").map(row => ({
    analysisId: String(row.analysis_id || ""), instrumentId: String(row.instrument_id || ""), analyzedAt: isoOrNull(row.analyzed_at), action: String(row.action || "WAIT"),
    referencePrice: numberOrNull(row.reference_price), referencePriceAt: isoOrNull(row.reference_price_at), referencePriceBasis: String(row.reference_price_basis || "UNKNOWN"),
    bearValue: numberOrNull(row.bear_value), baseValue: numberOrNull(row.base_value), benchmarkId: String(row.benchmark_id || ""),
    benchmarkStartPrice: numberOrNull(row.benchmark_start_price), benchmarkStartAt: isoOrNull(row.benchmark_start_at), startStatus: String(row.start_status || "MISSING"),
    latestStockPrice: numberOrNull(row.latest_stock_price), latestStockAt: isoOrNull(row.latest_stock_at), latestBenchmarkPrice: numberOrNull(row.latest_benchmark_price),
    latestBenchmarkAt: isoOrNull(row.latest_benchmark_at), latestUpdateId: String(row.latest_update_id || ""),
    baseFirstObservedAt: isoOrNull(row.base_first_observed_at), bearFirstObservedAt: isoOrNull(row.bear_first_observed_at), primaryOutcome: String(row.primary_outcome || "OPEN"),
    outcomeAt: isoOrNull(row.outcome_at), outcomeStockPrice: numberOrNull(row.outcome_stock_price), outcomeBenchmarkPrice: numberOrNull(row.outcome_benchmark_price),
    outcomeBenchmarkAt: isoOrNull(row.outcome_benchmark_at), outcomeUpdateId: String(row.outcome_update_id || ""), daysToOutcome: numberOrNull(row.days_to_outcome),
    stockReturnPct: numberOrNull(row.stock_return_pct), benchmarkReturnPct: numberOrNull(row.benchmark_return_pct), excessPerformancePp: numberOrNull(row.excess_performance_pp),
    state: String(row.state || "ACTIVE"), stateChangedAt: isoOrNull(row.state_changed_at), stateReason: String(row.state_reason || ""),
    dataStatus: String(row.data_status || "OK"), dataReason: String(row.data_reason || ""), updatedAt: isoOrNull(row.updated_at)
  }));
}

export function parseTrackerRanges(valueRanges, nowMs = Date.now()) {
  if (!Array.isArray(valueRanges) || valueRanges.length !== 4) throw new TrackerContractError("Google Sheets returned an incomplete Tracker response.");
  const [stockValues, analysisValues, settingsValues, trackRecordValues] = valueRanges.map(item => item.values || []);
  const settingsRows = rowsToObjects(settingsValues, ["Key", "Value"], "Settings");
  const settings = Object.fromEntries(settingsRows.map(row => [String(row.Key || ""), String(row.Value || "")]));
  Object.entries(EXPECTED_SETTINGS).forEach(([key, expected]) => {
    if (settings[key] !== expected) throw new TrackerContractError(`Tracker setting ${key} must equal ${expected}.`);
  });
  if (!["TRUE", "FALSE"].includes(String(settings.automatic_market_update_enabled || "").toUpperCase())) {
    throw new TrackerContractError("Tracker setting automatic_market_update_enabled must equal TRUE or FALSE.");
  }
  const configuredStaleAfterDays = Number(settings.stale_after_days || 90);
  const staleAfterDays = Number.isFinite(configuredStaleAfterDays) && configuredStaleAfterDays > 0 ? configuredStaleAfterDays : 90;
  const analyses = normalizeAnalysisRows(analysisValues);
  const trackRecords = normalizeTrackRecordRows(trackRecordValues);
  if (analyses.length !== trackRecords.length) throw new TrackerContractError("Analyses and TrackRecord row counts do not match.");
  const analysisIds = new Set(analyses.map(item => item.analysisId));
  const trackRecordIds = new Set(trackRecords.map(item => item.analysisId));
  if (analysisIds.size !== analyses.length || analysisIds.has("")) throw new TrackerContractError("Analyses contains a missing or duplicate analysis ID.");
  if (trackRecordIds.size !== trackRecords.length || trackRecordIds.has("")) throw new TrackerContractError("TrackRecord contains a missing or duplicate analysis ID.");
  if (trackRecords.some(item => !analysisIds.has(item.analysisId))) throw new TrackerContractError("TrackRecord contains an unknown analysis ID.");
  return {
    settings,
    automaticUpdate: normalizeAutomaticUpdate(settings, nowMs),
    staleAfterDays,
    stocks: normalizeStockRows(stockValues, nowMs, staleAfterDays),
    analyses,
    trackRecords
  };
}

export function buildStockDetail(stocks, analyses, trackRecords, instrumentId, selectedAnalysisId = "") {
  const stock = stocks.find(item => item.instrumentId === instrumentId);
  if (!stock) throw new TrackerContractError("The selected instrument is not in the current Tracker.");
  const trackById = new Map(trackRecords.map(item => [item.analysisId, item]));
  const history = analyses.filter(item => item.instrumentId === instrumentId).map(item => ({ ...item, trackRecord: trackById.get(item.analysisId) || null }))
    .sort((a, b) => Date.parse(b.analyzedAt) - Date.parse(a.analyzedAt));
  const activeHistory = history.filter(item => item.trackRecord?.state === "ACTIVE");
  const selectedAnalysis = history.find(item => item.analysisId === selectedAnalysisId)
    || activeHistory.find(item => item.analysisId === stock.analysisId) || activeHistory[0] || history[0] || null;
  return { stock, selectedAnalysis, currentAnalysis: selectedAnalysis, history, activeHistory };
}

export function buildArchiveEntries(stocks, analyses, trackRecords) {
  const stockByInstrument = new Map(stocks.map(stock => [stock.instrumentId, stock]));
  const analysisById = new Map(analyses.map(analysis => [analysis.analysisId, analysis]));
  return trackRecords.filter(record => record.state === "ARCHIVED").map(record => ({
    ...analysisById.get(record.analysisId),
    trackRecord: record,
    stock: stockByInstrument.get(record.instrumentId) || null
  })).filter(item => item.analysisId).sort((a, b) => Date.parse(b.analyzedAt) - Date.parse(a.analyzedAt));
}

async function sheetsGet({ accessToken, url, fetchImpl }) {
  const response = await fetchImpl(url, { method: "GET", headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer" });
  if (!response.ok) {
    const message = response.status === 401 ? "Google authorization expired. Connect Google again."
      : response.status === 403 ? "Google denied read-only access to the Tracker." : "The Tracker could not be read from Google Sheets.";
    throw new GoogleSheetsError(message, response.status);
  }
  return response.json();
}

export async function fetchTracker({ accessToken, spreadsheetId, fetchImpl = fetch, nowMs = Date.now() }) {
  if (!accessToken) throw new GoogleSheetsError("Google authorization is required.", 401);
  const normalizedId = normalizeSpreadsheetId(spreadsheetId);
  if (!normalizedId) throw new TrackerContractError("A valid Google Tracker URL or spreadsheet ID is required.");
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(normalizedId)}/values:batchGet`);
  TRACKER_RANGES.forEach(range => url.searchParams.append("ranges", range));
  url.searchParams.set("majorDimension", "ROWS");
  url.searchParams.set("valueRenderOption", "UNFORMATTED_VALUE");
  url.searchParams.set("dateTimeRenderOption", "SERIAL_NUMBER");
  const payload = await sheetsGet({ accessToken, url, fetchImpl });
  return parseTrackerRanges(payload.valueRanges, nowMs);
}

export async function fetchAnalysisSnapshot({ accessToken, spreadsheetId, sheetRow, fetchImpl = fetch }) {
  if (!Number.isInteger(sheetRow) || sheetRow < 2) throw new TrackerContractError("Analysis row is invalid.");
  const normalizedId = normalizeSpreadsheetId(spreadsheetId);
  if (!accessToken || !normalizedId) throw new GoogleSheetsError("Google authorization is required.", 401);
  const range = encodeURIComponent(`Analyses!T${sheetRow}`);
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(normalizedId)}/values/${range}`);
  url.searchParams.set("valueRenderOption", "UNFORMATTED_VALUE");
  const payload = await sheetsGet({ accessToken, url, fetchImpl });
  const value = payload.values?.[0]?.[0];
  try { return JSON.parse(String(value || "{}")); }
  catch { throw new TrackerContractError("Tracker contains invalid snapshot JSON."); }
}
