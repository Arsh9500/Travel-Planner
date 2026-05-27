import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getTransportAiSuggestions, getTransportBookingOptions } from "./services/transportAiService";
import "./Transport.css";

const travelPreferences = [
  { value: "balanced", label: "Balanced comfort" },
  { value: "fast", label: "Fastest route" },
  { value: "economy", label: "Lowest cost" },
  { value: "eco", label: "Green / eco-friendly" },
];

function Transport() {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [travelDate, setTravelDate] = useState("");
  const [preference, setPreference] = useState("balanced");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [bookingType, setBookingType] = useState("flight");
  const [travelers, setTravelers] = useState(1);
  const [bookingResults, setBookingResults] = useState([]);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState("");

  const canSubmit = origin.trim() && destination.trim() && travelDate;
  const canBook = origin.trim() && destination.trim() && travelDate;
  const headerText = useMemo(
    () => `Smart transport assistant for ${origin || "origin"} to ${destination || "destination"}`,
    [origin, destination]
  );

  const cleanedTransportRecommendations = useMemo(() => {
    if (!result) return [];
    return result
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) =>
        line
          .replace(/^[\u2022\*\-\+\s]+/, "")
          .replace(/^(\d+[\)\.\s]+)/, "")
      );
  }, [result]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit) {
      setError("Please enter both origin and destination.");
      return;
    }

    setError("");
    setResult("");
    setLoading(true);

    try {
      const data = await getTransportAiSuggestions({ origin, destination, date: travelDate, preference });
      setResult(data.suggestions || "No transport recommendations were returned.");
    } catch (err) {
      setError(err.message || "Unable to fetch transport suggestions.");
    } finally {
      setLoading(false);
    }
  };

  const handleBookingSubmit = async (event) => {
    event.preventDefault();
    if (!canBook) {
      setBookingError("Please enter origin, destination, and departure date.");
      return;
    }

    setBookingError("");
    setBookingResults([]);
    setBookingLoading(true);

    try {
      const data = await getTransportBookingOptions({
        origin,
        destination,
        departureDate: travelDate,
        transportType: bookingType,
        travelers,
      });
      setBookingResults(data.options || []);
    } catch (err) {
      setBookingError(err.message || "Unable to fetch booking options.");
    } finally {
      setBookingLoading(false);
    }
  };

  return (
    <div className="transport-page">
      <header className="transport-header">
        <div className="transport-hero">
          <div className="transport-hero-copy">
            <h1>Smart Transport Assistant</h1>
            <p>
              Create polished route plans, cost estimates, travel time projections, and AI-guided transport recommendations tailored to your journey.
            </p>
          </div>
          <div className="transport-hero-visual" aria-hidden="true" />
        </div>

        <nav className="transport-nav">
          <Link to="/">Home</Link>
          <Link to="/dashboard">Dashboard</Link>
          <Link to="/planner">Planner</Link>
        </nav>
      </header>

      <section className="transport-form-section">
        <form className="transport-form" onSubmit={handleSubmit}>
          <div className="transport-field">
            <label htmlFor="origin">Origin</label>
            <input
              id="origin"
              type="text"
              value={origin}
              onChange={(event) => setOrigin(event.target.value)}
              placeholder="Enter your departure city or airport"
            />
          </div>

          <div className="transport-field">
            <label htmlFor="destination">Destination</label>
            <input
              id="destination"
              type="text"
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
              placeholder="Enter your arrival city or destination"
            />
          </div>

          <div className="transport-grid">
            <div className="transport-field">
              <label htmlFor="travelDate">Travel date</label>
              <input
                id="travelDate"
                type="date"
                value={travelDate}
                onChange={(event) => setTravelDate(event.target.value)}
              />
            </div>

            <div className="transport-field">
              <label htmlFor="preference">Travel preference</label>
              <select id="preference" value={preference} onChange={(event) => setPreference(event.target.value)}>
                {travelPreferences.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button className="transport-submit" type="submit" disabled={!canSubmit || loading}>
            {loading ? "Generating transport plan..." : "Generate transport plan"}
          </button>
        </form>
      </section>

      <section className="transport-booking-section">
        <h2>Book transport</h2>
        <form className="transport-form transport-booking-form" onSubmit={handleBookingSubmit}>
          <div className="transport-grid">
            <div className="transport-field">
              <label htmlFor="bookingType">Booking type</label>
              <select id="bookingType" value={bookingType} onChange={(event) => setBookingType(event.target.value)}>
                <option value="flight">Flight</option>
                <option value="train">Train</option>
                <option value="bus">Bus</option>
                <option value="car">Car rental</option>
              </select>
            </div>

            <div className="transport-field">
              <label htmlFor="travelers">Travelers</label>
              <input
                id="travelers"
                type="number"
                min="1"
                value={travelers}
                onChange={(event) => setTravelers(Number(event.target.value) || 1)}
              />
            </div>
          </div>

          <button className="transport-submit" type="submit" disabled={!canBook || bookingLoading}>
            {bookingLoading ? "Searching booking options..." : "Find transport bookings"}
          </button>

          {bookingError && <div className="transport-error">{bookingError}</div>}
        </form>

        {bookingResults.length > 0 && (
          <div className="transport-booking-results">
            <h3>Recommended booking options</h3>
            <div className="booking-card-grid">
              {bookingResults.map((option, index) => (
                <article key={index} className="booking-card">
                  <div className="booking-card-header">
                    <span className="booking-provider">{option.provider}</span>
                    <span className="booking-mode">{option.mode}</span>
                  </div>
                  <p className="booking-route">{option.route}</p>
                  <p>
                    <strong>Departure:</strong> {option.departureTime} · <strong>Arrival:</strong> {option.arrivalTime}
                  </p>
                  <p>
                    <strong>Travelers:</strong> {option.travelers}
                  </p>
                  <p className="booking-price">{option.price}</p>
                  {option.bookingUrl && (
                    <a className="booking-link" href={option.bookingUrl} target="_blank" rel="noreferrer">
                      Book now
                    </a>
                  )}
                </article>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="transport-summary">
        <h2>{headerText}</h2>
        <div className="transport-highlights">
          <article>
            <h3>Chatbot assistant</h3>
            <p>Get intelligent route advice from Ollama for public transit, rideshare, taxis, and local shuttle options.</p>
          </article>
          <article>
            <h3>Route prediction</h3>
            <p>See estimated travel times and recommended routes for your chosen origin and destination.</p>
          </article>
          <article>
            <h3>Cost estimate</h3>
            <p>Receive an AI-backed cost range and personalized transport guidance based on your budget style.</p>
          </article>
        </div>
      </section>

      <section className="transport-result">
        {error && <div className="transport-error">{error}</div>}
        {cleanedTransportRecommendations.length > 0 && (
          <div className="transport-output">
            <h3>Transport recommendations</h3>
            <ul className="transport-output-list">
              {cleanedTransportRecommendations.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}

export default Transport;
