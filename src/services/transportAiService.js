const TRANSPORT_AI_API = "http://localhost:5000/transport-ai";

export async function getTransportAiSuggestions({ origin, destination, date = "", preference = "balanced", budget = "" }) {
  const response = await fetch(TRANSPORT_AI_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ origin, destination, date, preference, budget }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Transport AI service is unavailable right now.");
  }

  return data;
}
