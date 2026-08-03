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

Execute the complete Investment Tool workflow using methodology v5.1-slim.

ACTIVE VERSION RULE
- Methodology v5.1-slim is the only active methodology.
- Schema version 3.0.0 (schema v3) is only the data contract. Never interpret it as methodology v3.
- Never use an older or archived methodology.

This is not a company overview or a shortened analysis. Do not finish until:
- current research and reliable cited sources are complete;
- every required schema-v3 field is populated, using JSON null only where permitted;
- the benchmark is MSCI_WORLD_EUR for EUR or MSCI_WORLD_USD for USD;
- relative performance, price zone, and risk/reward are calculated;
- all three stars and BUY/WAIT/AVOID are assigned and explained;
- bear/base values, catalyst, key risk, and watch item are complete;
- the complete snapshot validates; and
- runInvestmentToolAnalysisAction succeeds in PREVIEW.

Only after showing the complete readable analysis and successful PREVIEW may you ask for approval to save it.`;
}
