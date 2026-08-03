import { DEMO_STOCKS, demoDetail } from "./demo-data.mjs";
import { buildArchiveEntries, buildStockDetail, fetchAnalysisSnapshot, fetchTracker } from "./tracker-contract.mjs";

export class SetupRequiredError extends Error {
  constructor() { super("Google data access is not configured for this PWA yet."); this.name = "SetupRequiredError"; }
}

export class AuthorizationRequiredError extends Error {
  constructor() { super("Connect Google to read the private Tracker."); this.name = "AuthorizationRequiredError"; }
}

let liveTracker = null;
let liveSpreadsheetId = "";

function assertLiveConfiguration(config, accessToken) {
  if (!config?.googleClientId || !config?.trackerSpreadsheetId) throw new SetupRequiredError();
  if (!accessToken) throw new AuthorizationRequiredError();
}

async function ensureTracker({ config, accessToken, force = false }) {
  assertLiveConfiguration(config, accessToken);
  if (force || !liveTracker || liveSpreadsheetId !== config.trackerSpreadsheetId) {
    liveTracker = await fetchTracker({ accessToken, spreadsheetId: config.trackerSpreadsheetId });
    liveSpreadsheetId = config.trackerSpreadsheetId;
  }
  return liveTracker;
}

export async function loadWatchlist({ demo, config, accessToken }) {
  if (demo) return { stocks: DEMO_STOCKS, updatedAt: new Date().toISOString(), mode: "DEMO", automaticUpdateEnabled: false };
  const tracker = await ensureTracker({ config, accessToken, force: true });
  return {
    stocks: tracker.stocks,
    updatedAt: new Date().toISOString(),
    mode: "LIVE",
    automaticUpdateEnabled: String(tracker.settings.automatic_market_update_enabled || "FALSE").toUpperCase() === "TRUE"
  };
}

export async function loadDetail({ demo, instrumentId, analysisId = "", config, accessToken }) {
  if (demo) return demoDetail(instrumentId);
  const tracker = await ensureTracker({ config, accessToken });
  const detail = buildStockDetail(tracker.stocks, tracker.analyses, tracker.trackRecords, instrumentId, analysisId);
  if (detail.selectedAnalysis) {
    detail.selectedAnalysis = {
      ...detail.selectedAnalysis,
      snapshot: await fetchAnalysisSnapshot({
        accessToken,
        spreadsheetId: config.trackerSpreadsheetId,
        sheetRow: detail.selectedAnalysis.sheetRow
      })
    };
    detail.currentAnalysis = detail.selectedAnalysis;
  }
  return detail;
}

export async function loadArchive({ demo, config, accessToken }) {
  if (demo) return [];
  const tracker = await ensureTracker({ config, accessToken });
  return buildArchiveEntries(tracker.stocks, tracker.analyses, tracker.trackRecords);
}

export function clearLiveTracker() {
  liveTracker = null;
  liveSpreadsheetId = "";
}
