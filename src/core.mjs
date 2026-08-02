const ACTION_ORDER = Object.freeze({ BUY: 0, WAIT: 1, AVOID: 2 });

export const PHASE_MEANINGS = Object.freeze({
  WASHED_OUT: "Sehr schwache Stimmung und geringe Erwartungen. Eine Erholung ist möglich, aber Bestätigung ist wichtig.",
  EARLY_RERATING: "Der Markt beginnt, die Aktie positiver zu bewerten. Das Interesse steigt, ohne bereits überfüllt zu sein.",
  BUILDING_ATTENTION: "Die Story gewinnt sichtbar an Aufmerksamkeit. Momentum verbessert sich, aber der Einstieg wird weniger günstig.",
  CROWDED_BULLISH: "Viele Anleger sind bereits positiv positioniert. Gute Nachrichten können eingepreist sein; Einstiegsdisziplin wird wichtiger.",
  EUPHORIC: "Extrem optimistische Erwartungen und hohe Überhitzungsgefahr. Kleine Enttäuschungen können starke Kursreaktionen auslösen.",
  BREAKING_DOWN: "Kurs und Erzählung verschlechtern sich gleichzeitig. Schwäche ist noch nicht automatisch eine Kaufchance.",
  NARRATIVE_RESET: "Der Markt bewertet die bisherige Story neu. Richtung und Erwartungen bleiben unsicher, bis neue Fakten die These bestätigen."
});

export function filterAndSortStocks(stocks, filter = "ALL", sort = "score") {
  const filtered = stocks.filter(stock => filter === "ALL" || stock.action === filter);
  return [...filtered].sort((a, b) => {
    if (sort === "ticker") return a.ticker.localeCompare(b.ticker);
    if (sort === "date") return Date.parse(b.analyzedAt) - Date.parse(a.analyzedAt);
    if (sort === "action") return (ACTION_ORDER[a.action] ?? 9) - (ACTION_ORDER[b.action] ?? 9) || b.score - a.score;
    return b.score - a.score || (ACTION_ORDER[a.action] ?? 9) - (ACTION_ORDER[b.action] ?? 9);
  });
}

export function phaseLabel(value) {
  return String(value || "").replaceAll("_", " ");
}

export function phaseMeaning(value) {
  return PHASE_MEANINGS[value] || "Beschreibt, in welcher Stimmungs- und Erwartungsphase sich die Aktie aktuell befindet.";
}

export function safeHttpsUrl(value) {
  return /^https:\/\/[^\s]+$/i.test(String(value || "")) ? String(value) : "";
}

export function isStale(analyzedAt, nowMs = Date.now(), staleAfterDays = 90) {
  const ageMs = Math.max(0, nowMs - Date.parse(analyzedAt));
  return ageMs > staleAfterDays * 86400000;
}

