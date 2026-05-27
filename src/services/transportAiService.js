const TRANSPORT_AI_API = "http://localhost:5000/transport-ai";
const TRANSPORT_BOOKING_API = "http://localhost:5000/transport-booking";

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

export async function getTransportBookingOptions({
  origin,
  destination,
  departureDate,
  returnDate,
  transportType,
  travelers,
  cabin,
}) {
  const response = await fetch(TRANSPORT_BOOKING_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      origin,
      destination,
      departureDate,
      returnDate,
      transportType,
      travelers,
      cabin,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Transport booking service is unavailable right now.");
  }

  return data;
}
