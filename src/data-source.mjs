import { DEMO_STOCKS, demoDetail } from "./demo-data.mjs";
import { buildStockDetail, fetchTracker } from "./tracker-contract.mjs";

export class SetupRequiredError extends Error {
  constructor() {
    super("Google data access is not configured for this PWA yet.");
    this.name = "SetupRequiredError";
  }
}

export class AuthorizationRequiredError extends Error {
  constructor() {
    super("Connect Google to read the private Tracker.");
    this.name = "AuthorizationRequiredError";
  }
}

let liveTracker = null;
let liveSpreadsheetId = "";

function assertLiveConfiguration(config, accessToken) {
  if (!config?.googleClientId || !config?.trackerSpreadsheetId) throw new SetupRequiredError();
  if (!accessToken) throw new AuthorizationRequiredError();
}

export async function loadWatchlist({ demo, config, accessToken }) {
  if (demo) return { stocks: DEMO_STOCKS, updatedAt: new Date().toISOString(), mode: "DEMO" };
  assertLiveConfiguration(config, accessToken);
  liveTracker = await fetchTracker({ accessToken, spreadsheetId: config.trackerSpreadsheetId });
  liveSpreadsheetId = config.trackerSpreadsheetId;
  return { stocks: liveTracker.stocks, updatedAt: new Date().toISOString(), mode: "LIVE" };
}

export async function loadDetail({ demo, instrumentId, config, accessToken }) {
  if (demo) return demoDetail(instrumentId);
  assertLiveConfiguration(config, accessToken);
  if (!liveTracker || liveSpreadsheetId !== config.trackerSpreadsheetId) {
    liveTracker = await fetchTracker({ accessToken, spreadsheetId: config.trackerSpreadsheetId });
    liveSpreadsheetId = config.trackerSpreadsheetId;
  }
  return buildStockDetail(liveTracker.stocks, liveTracker.analyses, instrumentId);
}
