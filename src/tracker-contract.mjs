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
  "watch_item", "methodology_version", "schema_version", "analysis_document_url",
  "snapshot_json"
]);

export const TRACKER_RANGES = Object.freeze([
  "Stocks!A1:AD",
  "Analyses!A1:T",
  "Settings!A1:B"
]);

const EXPECTED_SETTINGS = Object.freeze({
  tracker_contract_version: "1.0.0",
  active_methodology_version: "v5.1-slim",
  active_schema_version: "3.0.0"
});

export class TrackerContractError extends Error {
  constructor(message) {
    super(message);
    this.name = "TrackerContractError";
  }
}

export class GoogleSheetsError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "GoogleSheetsError";
    this.status = status;
  }
}

export function normalizeSpreadsheetId(value) {
  const text = String(value || "").trim();
  const urlMatch = text.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/);
  if (urlMatch) return urlMatch[1];
  return /^[A-Za-z0-9_-]{20,}$/.test(text) ? text : "";
}

function assertHeaders(actual, expected, sheetName) {
  if (actual.length !== expected.length) {
    throw new TrackerContractError(`${sheetName} header count does not match the tracker contract.`);
  }
  expected.forEach((header, index) => {
    if (String(actual[index] || "") !== header) {
      throw new TrackerContractError(`${sheetName} header mismatch at column ${index + 1}.`);
    }
  });
}

function rowsToObjects(values, expectedHeaders, sheetName) {
  if (!Array.isArray(values) || !values.length) throw new TrackerContractError(`${sheetName} is empty.`);
  const headers = values[0].map(String);
  assertHeaders(headers, expectedHeaders, sheetName);
  return values.slice(1).filter(row => row.some(cell => cell !== "" && cell != null)).map(row => {
    const result = {};
    headers.forEach((header, index) => { result[header] = row[index]; });
    return result;
  });
}

function dateFromCell(value) {
  const date = typeof value === "number" && Number.isFinite(value)
    ? new Date((value - 25569) * 86400000)
    : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TrackerContractError("Tracker contains an invalid date.");
  return date;
}

function numberOrNull(value) {
  if (value === "" || value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeStar(value) {
  return value === true || value === "★" ? "★" : "☆";
}

export function normalizeStockRows(values, nowMs = Date.now(), staleAfterDays = 90) {
  const rows = rowsToObjects(values, STOCKS_HEADERS, "Stocks");
  return rows.map(row => {
    const analyzedAt = dateFromCell(row["Analysis date"]);
    const ageDays = Math.max(0, Math.floor((nowMs - analyzedAt.getTime()) / 86400000));
    return {
      ticker: String(row.Ticker || ""),
      company: String(row.Company || ""),
      price: numberOrNull(row.Price),
      currency: String(row.Currency || ""),
      stars: {
        fundamentals: normalizeStar(row.Fundamentals),
        sentiment: normalizeStar(row.Sentiment),
        setup: normalizeStar(row.Setup)
      },
      score: numberOrNull(row.Score) || 0,
      action: String(row.Action || "WAIT"),
      priceZone: String(row["Price zone"] || "WAIT"),
      riskReward: numberOrNull(row["R/R"]),
      sentimentPhase: String(row["Sentiment phase"] || ""),
      checks: {
        growth: String(row.Growth || ""),
        profitability: String(row.Profitability || ""),
        financialStrength: String(row["Financial strength"] || ""),
        execution: String(row.Execution || "")
      },
      relativeStrengthPp: numberOrNull(row["Relative strength pp"]),
      earningsResponse: String(row["Earnings response"] || ""),
      estimateDirection: String(row["Estimate direction"] || ""),
      valuation: String(row.Valuation || ""),
      timing: String(row.Timing || ""),
      primaryCatalyst: String(row["Primary catalyst"] || ""),
      keyRisk: String(row["Key risk"] || ""),
      watchItem: String(row["Watch item"] || ""),
      analyzedAt: analyzedAt.toISOString(),
      ageDays,
      stale: ageDays > staleAfterDays,
      instrumentId: String(row["Instrument ID"] || ""),
      exchangeMic: String(row["Exchange MIC"] || ""),
      benchmark: String(row.Benchmark || ""),
      analysisId: String(row["Analysis ID"] || ""),
      analysisDocumentUrl: String(row["Analysis document URL"] || "")
    };
  });
}

export function normalizeAnalysisRows(values) {
  const rows = rowsToObjects(values, ANALYSES_HEADERS, "Analyses");
  return rows.map(row => {
    let snapshot;
    try {
      snapshot = JSON.parse(String(row.snapshot_json || "{}"));
    } catch {
      throw new TrackerContractError("Tracker contains invalid snapshot JSON.");
    }
    return {
      analysisId: String(row.analysis_id || ""),
      instrumentId: String(row.instrument_id || ""),
      analyzedAt: dateFromCell(row.analyzed_at).toISOString(),
      sourceCutoffAt: dateFromCell(row.source_cutoff_at).toISOString(),
      referencePrice: numberOrNull(row.reference_price),
      stars: {
        fundamentals: normalizeStar(row.fundamentals_star),
        sentiment: normalizeStar(row.sentiment_star),
        setup: normalizeStar(row.trade_setup_star)
      },
      score: numberOrNull(row.star_count) || 0,
      action: String(row.action || "WAIT"),
      sentimentPhase: String(row.sentiment_phase || ""),
      priceZone: String(row.price_zone || "WAIT"),
      riskReward: numberOrNull(row.risk_reward_ratio),
      primaryCatalyst: String(row.primary_catalyst || ""),
      keyRisk: String(row.key_risk || ""),
      watchItem: String(row.watch_item || ""),
      methodologyVersion: String(row.methodology_version || ""),
      schemaVersion: String(row.schema_version || ""),
      analysisDocumentUrl: String(row.analysis_document_url || ""),
      snapshot
    };
  });
}

export function parseTrackerRanges(valueRanges, nowMs = Date.now()) {
  if (!Array.isArray(valueRanges) || valueRanges.length !== 3) {
    throw new TrackerContractError("Google Sheets returned an incomplete Tracker response.");
  }
  const [stockValues, analysisValues, settingsValues] = valueRanges.map(item => item.values || []);
  const settingsRows = rowsToObjects(settingsValues, ["Key", "Value"], "Settings");
  const settings = Object.fromEntries(settingsRows.map(row => [String(row.Key || ""), String(row.Value || "")]));
  Object.entries(EXPECTED_SETTINGS).forEach(([key, expected]) => {
    if (settings[key] !== expected) throw new TrackerContractError(`Tracker setting ${key} must equal ${expected}.`);
  });
  const configuredStaleAfterDays = Number(settings.stale_after_days || 90);
  const staleAfterDays = Number.isFinite(configuredStaleAfterDays) && configuredStaleAfterDays > 0 ? configuredStaleAfterDays : 90;
  return {
    settings,
    staleAfterDays,
    stocks: normalizeStockRows(stockValues, nowMs, staleAfterDays),
    analyses: normalizeAnalysisRows(analysisValues)
  };
}

export function buildStockDetail(stocks, analyses, instrumentId) {
  const stock = stocks.find(item => item.instrumentId === instrumentId);
  if (!stock) throw new TrackerContractError("The selected instrument is not in the current Tracker.");
  const history = analyses.filter(item => item.instrumentId === instrumentId)
    .sort((a, b) => Date.parse(b.analyzedAt) - Date.parse(a.analyzedAt));
  const currentAnalysis = history.find(item => item.analysisId === stock.analysisId) || history[0] || null;
  return { stock, currentAnalysis, history };
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
  const response = await fetchImpl(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    credentials: "omit",
    referrerPolicy: "no-referrer"
  });
  if (!response.ok) {
    const message = response.status === 401
      ? "Google authorization expired. Connect Google again."
      : response.status === 403
        ? "Google denied read-only access to the Tracker."
        : "The Tracker could not be read from Google Sheets.";
    throw new GoogleSheetsError(message, response.status);
  }
  const payload = await response.json();
  return parseTrackerRanges(payload.valueRanges, nowMs);
}
