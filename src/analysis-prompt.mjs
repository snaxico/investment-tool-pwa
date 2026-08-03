const TICKER_PATTERN = /^[A-Z0-9.^:_-]{1,24}$/;

export function normalizeAnalysisTicker(value) {
  const ticker = String(value ?? "").trim().toUpperCase();
  if (!TICKER_PATTERN.test(ticker)) {
    throw new Error("Bitte einen gültigen Ticker eingeben, zum Beispiel NVDA, SAP oder BRK.B.");
  }
  return ticker;
}

export function buildFullAnalysisPrompt(value) {
  const ticker = normalizeAnalysisTicker(value);
  return `FULL_ANALYSIS: ${ticker}

Start the complete Investment Tool v5.1-slim workflow now.
Your first workflow action must be current Web Search using free public sources.
Do not first acknowledge this request, restate the workflow, provide a plan, ask me for public market data, or return a generic data-unavailable refusal.
Complete every required schema-v3 field and calculation, validate and save the finished snapshot through the configured Action, then present the complete readable analysis with the real save result. Do not ask for a separate approval message.`;
}
