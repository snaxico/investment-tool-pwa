import { filterAndSortStocks, isStale, phaseLabel, phaseMeaning, safeHttpsUrl } from "./src/core.mjs";
import { AuthorizationRequiredError, loadDetail, loadWatchlist, SetupRequiredError } from "./src/data-source.mjs";
import { createPrivateSetupUrl, readPrivateSetupFromHash } from "./src/device-setup.mjs";
import { GoogleAuthError, GoogleAuthSession } from "./src/google-auth.mjs";
import { GoogleSheetsError, normalizeSpreadsheetId } from "./src/tracker-contract.mjs";

const DEVICE_CONFIG_KEY = "investment-tool.device-config.v1";
const state = {
  stocks: [], filter: "ALL", sort: "score", config: {}, authSession: null, accessToken: "",
  demo: new URLSearchParams(location.search).get("demo") === "1"
};
const els = {
  grid: document.querySelector("#watchlist"), notice: document.querySelector("#notice"), connection: document.querySelector("#connection"),
  install: document.querySelector("#install"), analyze: document.querySelector("#analyze"), refresh: document.querySelector("#refresh"), connect: document.querySelector("#connect"),
  settings: document.querySelector("#settings"), settingsDialog: document.querySelector("#settings-dialog"), settingsForm: document.querySelector("#settings-form"),
  settingsClose: document.querySelector("#settings-close"), settingsError: document.querySelector("#settings-error"), disconnect: document.querySelector("#disconnect"),
  copySetup: document.querySelector("#copy-setup"),
  clientId: document.querySelector("#google-client-id"), trackerReference: document.querySelector("#tracker-reference"), gptUrl: document.querySelector("#gpt-url"),
  sort: document.querySelector("#sort"), dialog: document.querySelector("#detail-dialog"), detail: document.querySelector("#detail")
};
let installPrompt = null;
let setupImportResult = null;

const esc = value => String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
const fmtDate = value => new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date(value));
const fmtNumber = (value, digits = 2) => value == null ? "–" : new Intl.NumberFormat("de-DE", { maximumFractionDigits: digits }).format(value);
const badge = action => `<span class="badge ${esc(action)}">${esc(action)}</span>`;
const starBox = (label, value, cls) => `<div class="starbox"><span>${label}</span><strong class="${cls}">${esc(value)}</strong></div>`;

function normalizeDeviceConfig(config = {}) {
  const googleClientId = String(config.googleClientId || "").trim();
  const trackerSpreadsheetId = normalizeSpreadsheetId(config.trackerSpreadsheetId || config.trackerReference || "");
  const gptUrl = String(config.gptUrl || "").trim();
  if (!trackerSpreadsheetId) throw new Error("Bitte eine gültige Google-Sheets-URL oder Spreadsheet ID eingeben.");
  if (gptUrl && !safeHttpsUrl(gptUrl)) throw new Error("Der Custom-GPT-Link muss eine gültige HTTPS-URL sein.");
  new GoogleAuthSession(googleClientId);
  return Object.freeze({ googleClientId, trackerSpreadsheetId, gptUrl });
}

async function loadConfig() {
  const hasPrivateSetup = new URLSearchParams(location.hash.replace(/^#/, "")).has("setup");
  if (hasPrivateSetup) {
    try {
      const imported = normalizeDeviceConfig(readPrivateSetupFromHash(location.hash));
      localStorage.setItem(DEVICE_CONFIG_KEY, JSON.stringify(imported));
      setupImportResult = { ok: true };
    } catch (error) {
      setupImportResult = { ok: false, message: error.message || String(error) };
    } finally {
      history.replaceState(null, "", `${location.pathname}${location.search}`);
    }
  }
  let fileConfig = {};
  try {
    const module = await import("./config.local.js");
    fileConfig = module.default || {};
  } catch {}
  let deviceConfig = {};
  try { deviceConfig = JSON.parse(localStorage.getItem(DEVICE_CONFIG_KEY) || "{}"); } catch {}
  return Object.freeze({ ...fileConfig, ...deviceConfig });
}

function configureAuth() {
  state.accessToken = "";
  state.authSession = null;
  if (!state.config.googleClientId || !state.config.trackerSpreadsheetId) return;
  try {
    state.authSession = new GoogleAuthSession(state.config.googleClientId);
  } catch (error) {
    showNotice(`<strong>Google-Konfiguration ungültig:</strong> ${esc(error.message)}`);
  }
}

function openSettings() {
  els.clientId.value = state.config.googleClientId || "";
  els.trackerReference.value = state.config.trackerSpreadsheetId || "";
  els.gptUrl.value = state.config.gptUrl || "";
  els.settingsError.hidden = true;
  els.settingsDialog.showModal();
}

function updateConnection() {
  const online = navigator.onLine;
  const connected = Boolean(state.accessToken);
  els.connection.className = `connection ${online && (state.demo || connected) ? "online" : online ? "" : "offline"}`;
  els.connection.textContent = !online ? "Offline · nur App-Shell" : state.demo ? "Demo · online" : connected ? "Tracker verbunden" : "Google nicht verbunden";
  els.connect.textContent = connected ? "Neu verbinden" : "Google verbinden";
  els.connect.hidden = state.demo;
  if (!online) showNotice("<strong>Offline:</strong> Die App-Oberfläche ist verfügbar, private Tracker-Daten und Schreibvorgänge benötigen aber eine Verbindung.");
}

function showNotice(html) {
  els.notice.hidden = false;
  els.notice.innerHTML = html;
}

function renderWatchlist() {
  const stocks = filterAndSortStocks(state.stocks, state.filter, state.sort);
  if (!stocks.length) {
    els.grid.innerHTML = '<div class="state-card">Keine Aktien für diesen Filter.</div>';
    return;
  }
  els.grid.innerHTML = stocks.map(stock => {
    const stale = stock.stale ?? isStale(stock.analyzedAt);
    return `<button class="card" type="button" data-instrument-id="${esc(stock.instrumentId)}" aria-label="${esc(`${stock.ticker} ${stock.company} ${stock.action}`)}">
      <div class="card-head"><div><div class="ticker">${esc(stock.ticker)}</div><div class="company">${esc(stock.company)}</div></div>${badge(stock.action)}</div>
      <div class="row" style="margin-top:14px"><div class="price">${fmtNumber(stock.price)} ${esc(stock.currency)}</div><div class="${stale ? "stale" : "muted"}">${stale ? "Veraltet · " : ""}${fmtDate(stock.analyzedAt)}</div></div>
      <div class="scoreline">${starBox("Fundamentals", stock.stars.fundamentals, "f-star")}${starBox("Sentiment", stock.stars.sentiment, "s-star")}${starBox("Setup", stock.stars.setup, "t-star")}</div>
      <div class="facts"><span class="pill">${esc(stock.score)}/3</span><span class="pill">Zone ${esc(stock.priceZone)}</span><span class="pill">R/R ${fmtNumber(stock.riskReward)}×</span><span class="pill">${esc(phaseLabel(stock.sentimentPhase))}</span></div>
      <div class="summary"><b>Katalysator</b><p>${esc(stock.primaryCatalyst)}</p><b>Watch</b><p>${esc(stock.watchItem)}</p></div>
    </button>`;
  }).join("");
  els.grid.querySelectorAll("[data-instrument-id]").forEach(card => card.addEventListener("click", () => openDetail(card.dataset.instrumentId)));
}

async function openDetail(instrumentId) {
  els.detail.innerHTML = '<button class="close" type="button" data-close>← Watchlist</button><div class="state-card" style="margin-top:20px">Detail wird geladen …</div>';
  els.dialog.showModal();
  els.detail.querySelector("[data-close]").addEventListener("click", () => els.dialog.close());
  try {
    renderDetail(await loadDetail({ demo: state.demo, instrumentId, config: state.config, accessToken: state.accessToken }));
  } catch (error) {
    els.detail.innerHTML = `<button class="close" type="button" data-close>← Watchlist</button><div class="state-card" style="margin-top:20px">${esc(error.message || error)}</div>`;
    els.detail.querySelector("[data-close]").addEventListener("click", () => els.dialog.close());
  }
}

function renderDetail(data) {
  const stock = data.stock;
  const analysis = data.currentAnalysis;
  const snapshot = analysis?.snapshot;
  const rr = snapshot?.calculations?.risk_reward;
  const rrExplanation = rr ? `Möglicher Base-Case-Anstieg: ${fmtNumber(rr.upside_pct)}%. Möglicher Bear-Case-Rückgang: ${fmtNumber(rr.downside_pct)}%. R/R ${fmtNumber(rr.ratio)}× bedeutet: erwarteter Anstieg geteilt durch erwarteten Rückgang.` : "R/R vergleicht den möglichen Base-Case-Anstieg mit dem möglichen Bear-Case-Rückgang.";
  const rsExplanation = stock.relativeStrengthPp == null ? "Nicht genügend verifizierte Kursdaten für einen Drei-Monats-Vergleich." : `${fmtNumber(stock.relativeStrengthPp)} Prozentpunkte = Drei-Monats-Rendite der Aktie minus Drei-Monats-Rendite von ${esc(stock.benchmark)}.`;
  const checks = snapshot?.fundamentals ? [["Growth", snapshot.fundamentals.growth], ["Profitability", snapshot.fundamentals.profitability], ["Financial strength", snapshot.fundamentals.financial_strength], ["Execution", snapshot.fundamentals.execution]].map(([label, value]) => `<div class="check"><div class="check-label">${label}</div><b class="${esc(value.assessment)}">${esc(value.assessment)}</b><div class="muted">${esc(value.note)}</div></div>`).join("") : "";
  const history = data.history.map(item => `<div class="history-item"><div class="row"><b>${fmtDate(item.analyzedAt)}</b>${badge(item.action)}</div><div class="muted">${item.score}/3 · ${esc(item.priceZone)} · R/R ${fmtNumber(item.riskReward)}× · ${fmtNumber(item.referencePrice)} ${esc(stock.currency)}</div></div>`).join("");
  const sources = (snapshot?.sources || []).map(source => safeHttpsUrl(source.url) ? `<li><a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.title)}</a></li>` : "").join("");

  els.detail.innerHTML = `<button class="close" type="button" data-close>← Watchlist</button>
    <h2 id="detail-title">${esc(stock.ticker)} <span class="muted">${esc(stock.company)}</span></h2>
    <div class="row"><div class="price">${fmtNumber(stock.price)} ${esc(stock.currency)}</div>${badge(stock.action)}</div>
    <div class="scoreline">${starBox("Fundamentals", stock.stars.fundamentals, "f-star")}${starBox("Sentiment", stock.stars.sentiment, "s-star")}${starBox("Setup", stock.stars.setup, "t-star")}</div>
    <div class="hero"><div class="panel"><div class="eyebrow">Entscheidung</div><p>${esc(snapshot?.decision?.rationale || "")}</p><b>Watch item</b><p class="muted">${esc(stock.watchItem)}</p></div><div class="panel"><div class="eyebrow">Setup</div><p><b>${esc(stock.priceZone)}</b> · R/R ${fmtNumber(stock.riskReward)}×</p><p class="muted">${esc(snapshot?.trade_setup?.rationale || "")}</p><div class="explain"><b>Was bedeutet R/R?</b><br>${rrExplanation}</div></div></div>
    <section class="section"><h3>Fundamentals</h3><div class="checks">${checks}</div><p class="muted">${esc(snapshot?.fundamentals?.rationale || "")}</p></section>
    <section class="section"><h3>Sentiment</h3><div class="panel"><p>${esc(snapshot?.sentiment?.rationale || "")}</p><div class="facts"><span class="pill">RS ${fmtNumber(stock.relativeStrengthPp)} pp</span><span class="pill">Earnings ${esc(stock.earningsResponse)}</span><span class="pill">${esc(phaseLabel(stock.sentimentPhase))}</span></div><div class="explain"><b>Relative Strength</b><br>${rsExplanation}</div><div class="explain"><b>${esc(phaseLabel(stock.sentimentPhase))}</b><br>${esc(phaseMeaning(stock.sentimentPhase))}</div></div></section>
    <section class="section"><h3>Katalysator & Risiko</h3><div class="checks"><div class="check"><div class="check-label">Primary catalyst</div>${esc(stock.primaryCatalyst)}</div><div class="check"><div class="check-label">Key risk</div>${esc(stock.keyRisk)}</div></div></section>
    <section class="section"><h3>Analyseverlauf</h3><div class="history">${history || '<div class="muted">Keine Historie.</div>'}</div></section>
    ${sources ? `<section class="section"><h3>Quellen</h3><ul>${sources}</ul></section>` : ""}`;
  els.detail.querySelector("[data-close]").addEventListener("click", () => els.dialog.close());
}

async function refresh() {
  els.refresh.disabled = true;
  try {
    const result = await loadWatchlist({ demo: state.demo, config: state.config, accessToken: state.accessToken });
    state.stocks = result.stocks;
    renderWatchlist();
    if (result.mode === "DEMO") showNotice('<strong>Lokaler Demo-Modus:</strong> Die angezeigten Firmen sind synthetisch. Keine privaten Tracker-Daten wurden geladen oder gespeichert.');
    if (result.mode === "LIVE") showNotice(`<strong>Private Live-Daten:</strong> ${state.stocks.length} Aktien wurden direkt und nur lesend aus Google Sheets geladen. Tracker-Inhalte und OAuth-Token bleiben im Arbeitsspeicher.`);
  } catch (error) {
    state.stocks = [];
    if (error instanceof SetupRequiredError) {
      els.grid.innerHTML = '<div class="state-card"><strong>Einmalige Geräteeinrichtung erforderlich.</strong><br>Öffne „Einstellungen“, speichere die Google Web Client ID und die private Tracker-URL und verbinde danach Google.</div>';
      showNotice('<strong>Keine privaten Kennungen im App-Bundle:</strong> Die Verbindung wird nur auf diesem Gerät gespeichert.');
    } else if (error instanceof AuthorizationRequiredError) {
      els.grid.innerHTML = '<div class="state-card"><strong>Google-Verbindung erforderlich.</strong><br>Klicke auf „Google verbinden“. Die App fordert ausschließlich Lesezugriff auf Google Sheets an.</div>';
    } else if (error instanceof GoogleSheetsError && (error.status === 401 || error.status === 403)) {
      state.accessToken = "";
      els.grid.innerHTML = `<div class="state-card"><strong>Google-Verbindung erneuern.</strong><br>${esc(error.message)}</div>`;
      showNotice('<strong>Kein Schreibzugriff:</strong> Die PWA verwendet nur den Scope <code>spreadsheets.readonly</code>.');
      updateConnection();
    } else {
      els.grid.innerHTML = `<div class="state-card">${esc(error.message || error)}</div>`;
    }
  } finally {
    els.refresh.disabled = false;
  }
}

async function connectGoogle() {
  if (!state.authSession) {
    openSettings();
    return;
  }
  els.connect.disabled = true;
  try {
    state.accessToken = await state.authSession.connect();
    updateConnection();
    await refresh();
  } catch (error) {
    const message = error instanceof GoogleAuthError ? error.message : "Google authorization failed.";
    showNotice(`<strong>Google-Verbindung nicht hergestellt:</strong> ${esc(message)}`);
  } finally {
    els.connect.disabled = false;
  }
}

async function saveDeviceSettings(event) {
  event.preventDefault();
  els.settingsError.hidden = true;
  try {
    const deviceConfig = normalizeDeviceConfig({
      googleClientId: els.clientId.value,
      trackerReference: els.trackerReference.value,
      gptUrl: els.gptUrl.value
    });
    localStorage.setItem(DEVICE_CONFIG_KEY, JSON.stringify(deviceConfig));
    state.config = Object.freeze(deviceConfig);
    configureAuth();
    els.analyze.disabled = !safeHttpsUrl(state.config.gptUrl);
    els.settingsDialog.close();
    updateConnection();
    showNotice('<strong>Gerätekonfiguration gespeichert.</strong> Klicke jetzt auf „Google verbinden“.');
    await refresh();
  } catch (error) {
    els.settingsError.textContent = error.message || String(error);
    els.settingsError.hidden = false;
  }
}

async function copyPrivateSetupLink() {
  els.settingsError.hidden = true;
  try {
    const deviceConfig = normalizeDeviceConfig({
      googleClientId: els.clientId.value,
      trackerReference: els.trackerReference.value,
      gptUrl: els.gptUrl.value
    });
    const url = createPrivateSetupUrl(location.href, deviceConfig);
    await navigator.clipboard.writeText(url);
    showNotice("<strong>Privater Einrichtungslink kopiert.</strong> Öffne ihn einmal auf einem anderen Gerät. Teile ihn nicht öffentlich.");
    els.settingsDialog.close();
  } catch (error) {
    els.settingsError.textContent = error.message || String(error);
    els.settingsError.hidden = false;
  }
}

document.querySelectorAll("[data-filter]").forEach(button => button.addEventListener("click", () => {
  state.filter = button.dataset.filter;
  document.querySelectorAll("[data-filter]").forEach(item => item.classList.toggle("active", item === button));
  renderWatchlist();
}));
els.sort.addEventListener("change", () => { state.sort = els.sort.value; renderWatchlist(); });
els.refresh.addEventListener("click", refresh);
els.connect.addEventListener("click", connectGoogle);
els.settings.addEventListener("click", openSettings);
els.settingsClose.addEventListener("click", () => els.settingsDialog.close());
els.settingsForm.addEventListener("submit", saveDeviceSettings);
els.copySetup.addEventListener("click", copyPrivateSetupLink);
els.disconnect.addEventListener("click", async () => {
  state.authSession?.disconnect();
  state.accessToken = "";
  els.settingsDialog.close();
  updateConnection();
  await refresh();
});
els.dialog.addEventListener("click", event => { if (event.target === els.dialog) els.dialog.close(); });
els.analyze.addEventListener("click", () => {
  const url = safeHttpsUrl(state.config.gptUrl);
  if (url) window.open(url, "_blank", "noopener,noreferrer");
});
window.addEventListener("online", updateConnection);
window.addEventListener("offline", updateConnection);
window.addEventListener("beforeinstallprompt", event => { event.preventDefault(); installPrompt = event; els.install.hidden = false; });
els.install.addEventListener("click", async () => {
  if (!installPrompt) return;
  await installPrompt.prompt();
  installPrompt = null;
  els.install.hidden = true;
});

state.config = await loadConfig();
configureAuth();
els.analyze.disabled = !safeHttpsUrl(state.config.gptUrl);
updateConnection();
await refresh();
if (setupImportResult?.ok) showNotice("<strong>Gerät automatisch eingerichtet.</strong> Tippe jetzt nur noch auf „Google verbinden“.");
if (setupImportResult && !setupImportResult.ok) showNotice(`<strong>Einrichtungslink ungültig:</strong> ${esc(setupImportResult.message)}`);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => {});
