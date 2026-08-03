import { filterAndSortStocks, isStale, phaseLabel, phaseMeaning, safeHttpsUrl } from "./src/core.mjs";
import { AuthorizationRequiredError, clearLiveTracker, loadArchive, loadDetail, loadWatchlist, SetupRequiredError } from "./src/data-source.mjs";
import { createPrivateSetupUrl, readPrivateSetupFromHash } from "./src/device-setup.mjs";
import { AppsScriptActionError, normalizeDeploymentId, runAppsScriptAction } from "./src/app-actions.mjs";
import { GoogleActionAuthSession, GoogleAuthError, GoogleAuthSession } from "./src/google-auth.mjs";
import { GoogleSheetsError, normalizeSpreadsheetId } from "./src/tracker-contract.mjs";
import { buildFullAnalysisPrompt, normalizeAnalysisTicker } from "./src/analysis-prompt.mjs";

const DEVICE_CONFIG_KEY = "investment-tool.device-config.v2";
const ARCHIVE_PAGE_SIZE = 50;
const state = {
  stocks: [], archive: [], archiveVisible: ARCHIVE_PAGE_SIZE, archiveSearch: "", filter: "ALL", sort: "score",
  view: "WATCHLIST", config: {}, authSession: null, actionAuthSession: null, accessToken: "", actionAccessToken: "",
  automaticUpdateEnabled: false, demo: new URLSearchParams(location.search).get("demo") === "1"
};
const els = {
  grid: document.querySelector("#watchlist"), watchlistView: document.querySelector("#watchlist-view"), archiveView: document.querySelector("#archive-view"),
  archiveGrid: document.querySelector("#archive-list"), archiveSearch: document.querySelector("#archive-search"), archiveMore: document.querySelector("#archive-more"),
  notice: document.querySelector("#notice"), connection: document.querySelector("#connection"), install: document.querySelector("#install"),
  analyze: document.querySelector("#analyze"), refresh: document.querySelector("#refresh"), autoUpdate: document.querySelector("#auto-update"), connect: document.querySelector("#connect"),
  settings: document.querySelector("#settings"), settingsDialog: document.querySelector("#settings-dialog"), settingsForm: document.querySelector("#settings-form"),
  settingsClose: document.querySelector("#settings-close"), settingsError: document.querySelector("#settings-error"), disconnect: document.querySelector("#disconnect"),
  copySetup: document.querySelector("#copy-setup"), clientId: document.querySelector("#google-client-id"), trackerReference: document.querySelector("#tracker-reference"),
  deploymentId: document.querySelector("#apps-script-deployment-id"), gptUrl: document.querySelector("#gpt-url"), sort: document.querySelector("#sort"),
  dialog: document.querySelector("#detail-dialog"), detail: document.querySelector("#detail"), analysisDialog: document.querySelector("#analysis-dialog"),
  analysisForm: document.querySelector("#analysis-form"), analysisClose: document.querySelector("#analysis-close"), analysisCancel: document.querySelector("#analysis-cancel"),
  analysisTicker: document.querySelector("#analysis-ticker"), analysisError: document.querySelector("#analysis-error"), analysisPromptPreview: document.querySelector("#analysis-prompt-preview")
};
let installPrompt = null;
let setupImportResult = null;

const esc = value => String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
const fmtDate = value => value ? new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date(value)) : "–";
const fmtNumber = (value, digits = 2) => value == null ? "–" : new Intl.NumberFormat("de-DE", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
const fmtSigned = (value, suffix = "%") => value == null ? "–" : `${value > 0 ? "+" : ""}${fmtNumber(value)}${suffix}`;
const badge = action => `<span class="badge ${esc(action)}">${esc(action)}</span>`;
const starBox = (label, value, cls) => `<div class="starbox"><span>${label}</span><strong class="${cls}">${esc(value)}</strong></div>`;

function berlinCalendarDays(start, end) {
  if (!start || !end) return null;
  const parts = value => Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date(value)).filter(part => part.type !== "literal").map(part => [part.type, Number(part.value)]));
  const a = parts(start); const b = parts(end);
  return Math.max(0, Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86400000));
}

function normalizeDeviceConfig(config = {}) {
  const googleClientId = String(config.googleClientId || "").trim();
  const trackerSpreadsheetId = normalizeSpreadsheetId(config.trackerSpreadsheetId || config.trackerReference || "");
  const rawDeploymentId = String(config.appsScriptDeploymentId || "").trim();
  const appsScriptDeploymentId = rawDeploymentId ? normalizeDeploymentId(rawDeploymentId) : "";
  const gptUrl = String(config.gptUrl || "").trim();
  if (!trackerSpreadsheetId) throw new Error("Bitte eine gültige Google-Sheets-URL oder Spreadsheet ID eingeben.");
  if (rawDeploymentId && !appsScriptDeploymentId) throw new Error("Bitte eine gültige Apps-Script-Deployment-ID eingeben.");
  if (gptUrl && !safeHttpsUrl(gptUrl)) throw new Error("Der Custom-GPT-Link muss eine gültige HTTPS-URL sein.");
  new GoogleAuthSession(googleClientId);
  return Object.freeze({ googleClientId, trackerSpreadsheetId, appsScriptDeploymentId, gptUrl });
}

async function loadConfig() {
  const hasPrivateSetup = new URLSearchParams(location.hash.replace(/^#/, "")).has("setup");
  if (hasPrivateSetup) {
    try {
      const imported = normalizeDeviceConfig(readPrivateSetupFromHash(location.hash));
      localStorage.setItem(DEVICE_CONFIG_KEY, JSON.stringify(imported));
      setupImportResult = { ok: true };
    } catch (error) { setupImportResult = { ok: false, message: error.message || String(error) }; }
    finally { history.replaceState(null, "", `${location.pathname}${location.search}`); }
  }
  let fileConfig = {};
  try { fileConfig = (await import("./config.local.js")).default || {}; } catch {}
  let deviceConfig = {};
  try { deviceConfig = JSON.parse(localStorage.getItem(DEVICE_CONFIG_KEY) || localStorage.getItem("investment-tool.device-config.v1") || "{}"); } catch {}
  return Object.freeze({ ...fileConfig, ...deviceConfig });
}

function configureAuth() {
  state.accessToken = ""; state.actionAccessToken = ""; state.authSession = null; state.actionAuthSession = null;
  if (!state.config.googleClientId || !state.config.trackerSpreadsheetId) return;
  try {
    state.authSession = new GoogleAuthSession(state.config.googleClientId);
    state.actionAuthSession = new GoogleActionAuthSession(state.config.googleClientId);
  } catch (error) { showNotice(`<strong>Google-Konfiguration ungültig:</strong> ${esc(error.message)}`); }
}

function openSettings() {
  els.clientId.value = state.config.googleClientId || "";
  els.trackerReference.value = state.config.trackerSpreadsheetId || "";
  els.deploymentId.value = state.config.appsScriptDeploymentId || "";
  els.gptUrl.value = state.config.gptUrl || "";
  els.settingsError.hidden = true;
  els.settingsDialog.showModal();
}

function updateConnection() {
  const online = navigator.onLine; const connected = Boolean(state.accessToken);
  els.connection.className = `connection ${online && (state.demo || connected) ? "online" : online ? "" : "offline"}`;
  els.connection.textContent = !online ? "Offline · nur App-Shell" : state.demo ? "Demo · online" : connected ? "Tracker verbunden" : "Google nicht verbunden";
  els.connect.textContent = connected ? "Neu verbinden" : "Google verbinden";
  els.connect.hidden = state.demo;
  els.autoUpdate.disabled = state.demo || !connected || !state.config.appsScriptDeploymentId;
  els.autoUpdate.textContent = `Automatisch: ${state.automaticUpdateEnabled ? "An" : "Aus"}`;
  els.autoUpdate.setAttribute("aria-pressed", String(state.automaticUpdateEnabled));
  if (!online) showNotice("<strong>Offline:</strong> Die App-Oberfläche ist verfügbar, private Tracker-Daten und Änderungen benötigen aber eine Verbindung.");
}

function showNotice(html) { els.notice.hidden = false; els.notice.innerHTML = html; }

function renderWatchlist() {
  const stocks = filterAndSortStocks(state.stocks, state.filter, state.sort);
  if (!stocks.length) { els.grid.innerHTML = '<div class="state-card">Keine Aktien für diesen Filter.</div>'; return; }
  els.grid.innerHTML = stocks.map(stock => {
    const stale = stock.stale ?? isStale(stock.analyzedAt);
    return `<button class="card" type="button" data-instrument-id="${esc(stock.instrumentId)}" aria-label="${esc(`${stock.ticker} ${stock.company} ${stock.action}`)}">
      <div class="card-head"><div><div class="ticker">${esc(stock.ticker)}</div><div class="company">${esc(stock.company)}</div></div>${badge(stock.action)}</div>
      <div class="row card-price"><div class="price">${fmtNumber(stock.price)} ${esc(stock.currency)}</div><div class="${stale ? "stale" : "muted"}">${stale ? "Veraltet · " : ""}${fmtDate(stock.analyzedAt)}</div></div>
      <div class="scoreline">${starBox("Fundamentals", stock.stars.fundamentals, "f-star")}${starBox("Sentiment", stock.stars.sentiment, "s-star")}${starBox("Setup", stock.stars.setup, "t-star")}</div>
      <div class="facts"><span class="pill">${esc(stock.score)}/3</span><span class="pill">Zone ${esc(stock.priceZone)}</span><span class="pill">R/R ${fmtNumber(stock.riskReward)}×</span><span class="pill">${esc(phaseLabel(stock.sentimentPhase))}</span></div>
      <div class="summary"><b>Katalysator</b><p>${esc(stock.primaryCatalyst)}</p><b>Watch</b><p>${esc(stock.watchItem)}</p></div>
    </button>`;
  }).join("");
  els.grid.querySelectorAll("[data-instrument-id]").forEach(card => card.addEventListener("click", () => openDetail(card.dataset.instrumentId)));
}

async function openDetail(instrumentId, analysisId = "") {
  els.detail.innerHTML = '<button class="close" type="button" data-close>← Zurück</button><div class="state-card detail-loading">Detail wird geladen …</div>';
  if (!els.dialog.open) els.dialog.showModal();
  els.detail.querySelector("[data-close]").addEventListener("click", () => els.dialog.close());
  try { renderDetail(await loadDetail({ demo: state.demo, instrumentId, analysisId, config: state.config, accessToken: state.accessToken })); }
  catch (error) {
    els.detail.innerHTML = `<button class="close" type="button" data-close>← Zurück</button><div class="state-card detail-loading">${esc(error.message || error)}</div>`;
    els.detail.querySelector("[data-close]").addEventListener("click", () => els.dialog.close());
  }
}

function performancePanel(track, currency) {
  if (!track) return '<div class="panel muted">Für diese Analyse gibt es noch keinen Track-Record.</div>';
  const baseDays = berlinCalendarDays(track.referencePriceAt, track.baseFirstObservedAt);
  const bearDays = berlinCalendarDays(track.referencePriceAt, track.bearFirstObservedAt);
  const endAt = track.primaryOutcome === "OPEN" ? track.latestStockAt : track.outcomeAt;
  return `<div class="performance panel">
    <div class="performance-grid">
      <span>Suggestion</span><strong>${esc(track.action)}</strong>
      <span>Reference price</span><strong>${fmtNumber(track.referencePrice)} ${esc(currency)}</strong>
      <span>Base case</span><strong>${fmtNumber(track.baseValue)} ${esc(currency)}</strong>
      <span>Base reached after</span><strong>${baseDays == null ? "Noch nicht erreicht" : `${baseDays} Tage`}</strong>
      <span>Bear case</span><strong>${fmtNumber(track.bearValue)} ${esc(currency)}</strong>
      <span>Bear reached after</span><strong>${bearDays == null ? "Noch nicht erreicht" : `${bearDays} Tage`}</strong>
    </div>
    <div class="performance-returns">
      <div><span>Stock return</span><strong>${fmtSigned(track.stockReturnPct)}</strong></div>
      <div><span>Benchmark return</span><strong>${fmtSigned(track.benchmarkReturnPct)}</strong></div>
      <div><span>Excess performance</span><strong>${fmtSigned(track.excessPerformancePp, " pp")}</strong></div>
    </div>
    <div class="muted performance-note">${esc(track.benchmarkId)} · Stand ${fmtDate(endAt)}${track.dataStatus !== "OK" ? ` · ${esc(track.dataStatus)}` : ""}</div>
  </div>`;
}

function renderDetail(data) {
  const stock = data.stock; const analysis = data.selectedAnalysis || data.currentAnalysis; const snapshot = analysis?.snapshot; const track = analysis?.trackRecord;
  const rr = snapshot?.calculations?.risk_reward;
  const rrExplanation = rr ? `Möglicher Base-Case-Anstieg: ${fmtNumber(rr.upside_pct)}%. Möglicher Bear-Case-Rückgang: ${fmtNumber(rr.downside_pct)}%. R/R ${fmtNumber(rr.ratio)}× bedeutet: erwarteter Anstieg geteilt durch erwarteten Rückgang.` : "R/R vergleicht den möglichen Base-Case-Anstieg mit dem möglichen Bear-Case-Rückgang.";
  const rsExplanation = stock.relativeStrengthPp == null ? "Nicht genügend verifizierte Kursdaten für einen Drei-Monats-Vergleich." : `${fmtNumber(stock.relativeStrengthPp)} Prozentpunkte = Drei-Monats-Rendite der Aktie minus Drei-Monats-Rendite von ${esc(stock.benchmark)}.`;
  const checks = snapshot?.fundamentals ? [["Growth", snapshot.fundamentals.growth], ["Profitability", snapshot.fundamentals.profitability], ["Financial strength", snapshot.fundamentals.financial_strength], ["Execution", snapshot.fundamentals.execution]].map(([label, value]) => `<div class="check"><div class="check-label">${label}</div><b class="${esc(value.assessment)}">${esc(value.assessment)}</b><div class="muted">${esc(value.note)}</div></div>`).join("") : "";
  const visibleHistory = track?.state === "ARCHIVED" ? [analysis] : (data.activeHistory || data.history || []);
  const history = visibleHistory.map((item, index) => `<button class="analysis-card ${item.analysisId === analysis?.analysisId ? "selected" : ""}" type="button" data-analysis-id="${esc(item.analysisId)}" data-instrument-id="${esc(stock.instrumentId)}" style="--stack:${index}">
    <div class="row"><b>${fmtDate(item.analyzedAt)}</b>${badge(item.action)}</div><div class="muted">${item.score}/3 · ${esc(item.priceZone)} · R/R ${fmtNumber(item.riskReward)}× · ${fmtNumber(item.referencePrice)} ${esc(stock.currency)}</div>
  </button>`).join("");
  const sources = (snapshot?.sources || []).map(source => safeHttpsUrl(source.url) ? `<li><a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.title)}</a></li>` : "").join("");
  const newestActiveId = data.activeHistory?.[0]?.analysisId;
  const canArchive = !state.demo && track?.state === "ACTIVE" && analysis?.analysisId !== newestActiveId;
  const canRestore = !state.demo && track?.state === "ARCHIVED";

  els.detail.innerHTML = `<button class="close" type="button" data-close>← Zurück</button>
    <div class="detail-heading"><div><h2 id="detail-title">${esc(stock.ticker)} <span class="muted">${esc(stock.company)}</span></h2><div class="muted">Analyse vom ${fmtDate(analysis?.analyzedAt)}</div></div>${badge(analysis?.action || stock.action)}</div>
    <section class="section"><h3>Analyseverlauf</h3><div class="analysis-stack">${history || '<div class="muted">Keine Historie.</div>'}</div></section>
    <section class="section"><h3>Performance</h3>${performancePanel(track, stock.currency)}</section>
    <div class="scoreline">${starBox("Fundamentals", analysis?.stars?.fundamentals || stock.stars.fundamentals, "f-star")}${starBox("Sentiment", analysis?.stars?.sentiment || stock.stars.sentiment, "s-star")}${starBox("Setup", analysis?.stars?.setup || stock.stars.setup, "t-star")}</div>
    <div class="hero"><div class="panel"><div class="eyebrow">Entscheidung</div><p>${esc(snapshot?.decision?.rationale || "")}</p><b>Watch item</b><p class="muted">${esc(analysis?.watchItem || stock.watchItem)}</p></div><div class="panel"><div class="eyebrow">Setup</div><p><b>${esc(analysis?.priceZone || stock.priceZone)}</b> · R/R ${fmtNumber(analysis?.riskReward ?? stock.riskReward)}×</p><p class="muted">${esc(snapshot?.trade_setup?.rationale || "")}</p><div class="explain"><b>Was bedeutet R/R?</b><br>${rrExplanation}</div></div></div>
    <section class="section"><h3>Fundamentals</h3><div class="checks">${checks}</div><p class="muted">${esc(snapshot?.fundamentals?.rationale || "")}</p></section>
    <section class="section"><h3>Sentiment</h3><div class="panel"><p>${esc(snapshot?.sentiment?.rationale || "")}</p><div class="facts"><span class="pill">RS ${fmtNumber(stock.relativeStrengthPp)} pp</span><span class="pill">Earnings ${esc(stock.earningsResponse)}</span><span class="pill">${esc(phaseLabel(analysis?.sentimentPhase || stock.sentimentPhase))}</span></div><div class="explain"><b>Relative Strength</b><br>${rsExplanation}</div><div class="explain"><b>${esc(phaseLabel(analysis?.sentimentPhase || stock.sentimentPhase))}</b><br>${esc(phaseMeaning(analysis?.sentimentPhase || stock.sentimentPhase))}</div></div></section>
    <section class="section"><h3>Katalysator & Risiko</h3><div class="checks"><div class="check"><div class="check-label">Primary catalyst</div>${esc(analysis?.primaryCatalyst || stock.primaryCatalyst)}</div><div class="check"><div class="check-label">Key risk</div>${esc(analysis?.keyRisk || stock.keyRisk)}</div></div></section>
    ${sources ? `<section class="section"><h3>Quellen</h3><ul>${sources}</ul></section>` : ""}
    ${canArchive ? '<button class="button danger" type="button" data-state-action="ARCHIVED">Analyse archivieren</button>' : ""}
    ${canRestore ? '<button class="button ghost" type="button" data-state-action="ACTIVE">Analyse wiederherstellen</button>' : ""}`;
  els.detail.querySelector("[data-close]").addEventListener("click", () => els.dialog.close());
  els.detail.querySelectorAll("[data-analysis-id]").forEach(card => card.addEventListener("click", () => openDetail(card.dataset.instrumentId, card.dataset.analysisId)));
  els.detail.querySelector("[data-state-action]")?.addEventListener("click", event => changeAnalysisState(analysis.analysisId, event.currentTarget.dataset.stateAction));
}

function archiveMatches(entry) {
  const needle = state.archiveSearch.trim().toLocaleLowerCase("de-DE");
  if (!needle) return true;
  return [entry.analysisId, entry.instrumentId, entry.stock?.ticker, entry.stock?.company, entry.action, entry.trackRecord?.primaryOutcome].some(value => String(value || "").toLocaleLowerCase("de-DE").includes(needle));
}

function renderArchive() {
  const matches = state.archive.filter(archiveMatches); const shown = matches.slice(0, state.archiveVisible);
  els.archiveGrid.innerHTML = shown.length ? shown.map(entry => `<article class="archive-card">
    <button type="button" class="archive-open" data-instrument-id="${esc(entry.instrumentId)}" data-analysis-id="${esc(entry.analysisId)}">
      <div class="card-head"><div><div class="ticker">${esc(entry.stock?.ticker || entry.instrumentId)}</div><div class="company">${esc(entry.stock?.company || entry.instrumentId)}</div></div>${badge(entry.action)}</div>
      <div class="muted">${fmtDate(entry.analyzedAt)} · ${esc(entry.trackRecord?.primaryOutcome || "OPEN")}</div>
      <div class="performance-returns compact"><div><span>Stock</span><strong>${fmtSigned(entry.trackRecord?.stockReturnPct)}</strong></div><div><span>Benchmark</span><strong>${fmtSigned(entry.trackRecord?.benchmarkReturnPct)}</strong></div><div><span>Excess</span><strong>${fmtSigned(entry.trackRecord?.excessPerformancePp, " pp")}</strong></div></div>
    </button>
    <button class="button ghost" type="button" data-restore-id="${esc(entry.analysisId)}">Wiederherstellen</button>
  </article>`).join("") : '<div class="state-card">Keine archivierten Analysen gefunden.</div>';
  els.archiveMore.hidden = shown.length >= matches.length;
  els.archiveGrid.querySelectorAll("[data-instrument-id]").forEach(card => card.addEventListener("click", () => openDetail(card.dataset.instrumentId, card.dataset.analysisId)));
  els.archiveGrid.querySelectorAll("[data-restore-id]").forEach(button => button.addEventListener("click", () => changeAnalysisState(button.dataset.restoreId, "ACTIVE")));
}

async function selectView(view) {
  state.view = view;
  document.querySelectorAll("[data-view]").forEach(button => button.classList.toggle("active", button.dataset.view === view));
  els.watchlistView.hidden = view !== "WATCHLIST"; els.archiveView.hidden = view !== "ARCHIVE";
  if (view === "ARCHIVE") {
    try { state.archive = await loadArchive({ demo: state.demo, config: state.config, accessToken: state.accessToken }); renderArchive(); }
    catch (error) { els.archiveGrid.innerHTML = `<div class="state-card">${esc(error.message || error)}</div>`; }
  }
}

async function ensureActionToken() {
  if (!state.config.appsScriptDeploymentId) throw new AppsScriptActionError("Die Apps-Script-Deployment-ID fehlt in den Einstellungen.");
  state.actionAccessToken = state.actionAuthSession?.getAccessToken() || state.actionAccessToken;
  if (!state.actionAccessToken) state.actionAccessToken = await state.actionAuthSession.connect();
  return state.actionAccessToken;
}

async function runAction(request) {
  return runAppsScriptAction({ accessToken: await ensureActionToken(), deploymentId: state.config.appsScriptDeploymentId, request });
}

async function refresh({ updateMarketData = false } = {}) {
  els.refresh.disabled = true; let updateMessage = "";
  try {
    if (updateMarketData && !state.demo) {
      try {
        const result = await runAction({ action: "UPDATE_MARKET_DATA" });
        updateMessage = ` Marktdaten: ${result?.symbols?.updated ?? 0} Symbole aktualisiert, ${result?.symbols?.failed ?? 0} fehlgeschlagen.`;
      } catch (error) { updateMessage = ` Marktdaten wurden nicht aktualisiert: ${esc(error.message || error)}`; }
      clearLiveTracker();
    }
    const result = await loadWatchlist({ demo: state.demo, config: state.config, accessToken: state.accessToken });
    state.stocks = result.stocks; state.automaticUpdateEnabled = result.automaticUpdateEnabled; renderWatchlist(); updateConnection();
    if (state.view === "ARCHIVE") await selectView("ARCHIVE");
    if (result.mode === "DEMO") showNotice('<strong>Lokaler Demo-Modus:</strong> Die angezeigten Firmen sind synthetisch.');
    if (result.mode === "LIVE") showNotice(`<strong>Private Live-Daten:</strong> ${state.stocks.length} Aktien direkt aus Google Sheets geladen.${updateMessage}`);
  } catch (error) {
    state.stocks = [];
    if (error instanceof SetupRequiredError) {
      els.grid.innerHTML = '<div class="state-card"><strong>Einmalige Geräteeinrichtung erforderlich.</strong><br>Öffne „Einstellungen“, speichere die Google Web Client ID und die private Tracker-URL.</div>';
      showNotice('<strong>Keine privaten Kennungen im App-Bundle:</strong> Die Verbindung wird nur auf diesem Gerät gespeichert.');
    } else if (error instanceof AuthorizationRequiredError) {
      els.grid.innerHTML = '<div class="state-card"><strong>Google-Verbindung erforderlich.</strong><br>Klicke auf „Google verbinden“.</div>';
    } else if (error instanceof GoogleSheetsError && (error.status === 401 || error.status === 403)) {
      state.accessToken = ""; els.grid.innerHTML = `<div class="state-card"><strong>Google-Verbindung erneuern.</strong><br>${esc(error.message)}</div>`; updateConnection();
    } else els.grid.innerHTML = `<div class="state-card">${esc(error.message || error)}</div>`;
  } finally { els.refresh.disabled = false; }
}

async function changeAnalysisState(analysisId, targetState) {
  try {
    await runAction({ action: "SET_ANALYSIS_STATE", analysisId, state: targetState });
    clearLiveTracker(); els.dialog.close(); await refresh();
    if (targetState === "ARCHIVED") showNotice("<strong>Analyse archiviert.</strong> Sie ist weiterhin im Archiv verfügbar.");
    else { await selectView("ARCHIVE"); showNotice("<strong>Analyse wiederhergestellt.</strong>"); }
  } catch (error) { showNotice(`<strong>Änderung fehlgeschlagen:</strong> ${esc(error.message || error)}`); }
}

async function toggleAutomaticUpdate() {
  els.autoUpdate.disabled = true;
  try {
    const enabled = !state.automaticUpdateEnabled;
    await runAction({ action: "SET_AUTOMATIC_UPDATE", enabled });
    clearLiveTracker(); await refresh();
    showNotice(`<strong>Automatische Aktualisierung ${enabled ? "aktiviert" : "deaktiviert"}.</strong>${enabled ? " Der Lauf erfolgt täglich zwischen 23:00 und 00:00 Uhr (Europe/Berlin)." : ""}`);
  } catch (error) { showNotice(`<strong>Automatik konnte nicht geändert werden:</strong> ${esc(error.message || error)}`); }
  finally { updateConnection(); }
}

async function connectGoogle() {
  if (!state.authSession) { openSettings(); return; }
  els.connect.disabled = true;
  try { state.accessToken = await state.authSession.connect(); updateConnection(); await refresh(); }
  catch (error) { showNotice(`<strong>Google-Verbindung nicht hergestellt:</strong> ${esc(error instanceof GoogleAuthError ? error.message : "Google authorization failed.")}`); }
  finally { els.connect.disabled = false; }
}

function settingsValues() {
  return normalizeDeviceConfig({ googleClientId: els.clientId.value, trackerReference: els.trackerReference.value, appsScriptDeploymentId: els.deploymentId.value, gptUrl: els.gptUrl.value });
}

async function saveDeviceSettings(event) {
  event.preventDefault(); els.settingsError.hidden = true;
  try {
    const deviceConfig = settingsValues(); localStorage.setItem(DEVICE_CONFIG_KEY, JSON.stringify(deviceConfig));
    state.config = Object.freeze(deviceConfig); configureAuth(); els.analyze.disabled = !safeHttpsUrl(state.config.gptUrl); els.settingsDialog.close(); updateConnection();
    showNotice('<strong>Gerätekonfiguration gespeichert.</strong> Klicke jetzt auf „Google verbinden“.'); await refresh();
  } catch (error) { els.settingsError.textContent = error.message || String(error); els.settingsError.hidden = false; }
}

async function copyPrivateSetupLink() {
  els.settingsError.hidden = true;
  try {
    const url = createPrivateSetupUrl(location.href, settingsValues()); await navigator.clipboard.writeText(url);
    showNotice("<strong>Privater Einrichtungslink kopiert.</strong> Öffne ihn einmal auf einem anderen Gerät und teile ihn nicht öffentlich."); els.settingsDialog.close();
  } catch (error) { els.settingsError.textContent = error.message || String(error); els.settingsError.hidden = false; }
}

function openAnalysisPrompt() {
  els.analysisForm.reset();
  els.analysisError.hidden = true;
  els.analysisPromptPreview.hidden = true;
  els.analysisPromptPreview.value = "";
  els.analysisDialog.showModal();
  els.analysisTicker.focus();
}

async function startAnalysis(event) {
  event.preventDefault();
  els.analysisError.hidden = true;
  els.analysisPromptPreview.hidden = true;
  const url = safeHttpsUrl(state.config.gptUrl);
  if (!url) { openSettings(); return; }
  try {
    const prompt = buildFullAnalysisPrompt(normalizeAnalysisTicker(els.analysisTicker.value));
    const copyPromise = navigator.clipboard.writeText(prompt);
    window.open(url, "_blank", "noopener,noreferrer");
    await copyPromise;
    els.analysisDialog.close();
    showNotice("<strong>Vollständiger v5.1-Prompt kopiert.</strong> Füge ihn in ChatGPT ein und sende ihn ab.");
  } catch (error) {
    const prompt = (() => { try { return buildFullAnalysisPrompt(els.analysisTicker.value); } catch { return ""; } })();
    if (prompt) {
      els.analysisPromptPreview.value = prompt;
      els.analysisPromptPreview.hidden = false;
      els.analysisPromptPreview.select();
    }
    els.analysisError.textContent = prompt ? "Automatisches Kopieren war nicht möglich. Kopiere den markierten Auftrag manuell." : (error.message || String(error));
    els.analysisError.hidden = false;
  }
}

document.querySelectorAll("[data-filter]").forEach(button => button.addEventListener("click", () => {
  state.filter = button.dataset.filter; document.querySelectorAll("[data-filter]").forEach(item => item.classList.toggle("active", item === button)); renderWatchlist();
}));
document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => selectView(button.dataset.view)));
els.sort.addEventListener("change", () => { state.sort = els.sort.value; renderWatchlist(); });
els.archiveSearch.addEventListener("input", () => { state.archiveSearch = els.archiveSearch.value; state.archiveVisible = ARCHIVE_PAGE_SIZE; renderArchive(); });
els.archiveMore.addEventListener("click", () => { state.archiveVisible += ARCHIVE_PAGE_SIZE; renderArchive(); });
els.refresh.addEventListener("click", () => refresh({ updateMarketData: true }));
els.autoUpdate.addEventListener("click", toggleAutomaticUpdate); els.connect.addEventListener("click", connectGoogle); els.settings.addEventListener("click", openSettings);
els.settingsClose.addEventListener("click", () => els.settingsDialog.close()); els.settingsForm.addEventListener("submit", saveDeviceSettings); els.copySetup.addEventListener("click", copyPrivateSetupLink);
els.disconnect.addEventListener("click", async () => {
  state.authSession?.disconnect(); state.actionAuthSession?.disconnect(); state.accessToken = ""; state.actionAccessToken = ""; clearLiveTracker(); els.settingsDialog.close(); updateConnection(); await refresh();
});
els.dialog.addEventListener("click", event => { if (event.target === els.dialog) els.dialog.close(); });
els.analyze.addEventListener("click", openAnalysisPrompt);
els.analysisClose.addEventListener("click", () => els.analysisDialog.close());
els.analysisCancel.addEventListener("click", () => els.analysisDialog.close());
els.analysisDialog.addEventListener("click", event => { if (event.target === els.analysisDialog) els.analysisDialog.close(); });
els.analysisForm.addEventListener("submit", startAnalysis);
window.addEventListener("online", updateConnection); window.addEventListener("offline", updateConnection);
window.addEventListener("beforeinstallprompt", event => { event.preventDefault(); installPrompt = event; els.install.hidden = false; });
els.install.addEventListener("click", async () => { if (!installPrompt) return; await installPrompt.prompt(); installPrompt = null; els.install.hidden = true; });

state.config = await loadConfig(); configureAuth(); els.analyze.disabled = !safeHttpsUrl(state.config.gptUrl); updateConnection(); await refresh();
if (setupImportResult?.ok) showNotice("<strong>Gerät automatisch eingerichtet.</strong> Tippe jetzt nur noch auf „Google verbinden“.");
if (setupImportResult && !setupImportResult.ok) showNotice(`<strong>Einrichtungslink ungültig:</strong> ${esc(setupImportResult.message)}`);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => {});
