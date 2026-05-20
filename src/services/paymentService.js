const TRAVEL_API_BASE_URL = process.env.REACT_APP_TRAVEL_API_BASE_URL || "http://127.0.0.1:5000";

export async function processBookingPayment(payload) {
  const response = await fetch(`${TRAVEL_API_BASE_URL}/payments/process`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Payment could not be processed right now.");
  }

  return data;
}
