import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { useItinerary } from "./context/ItineraryContext";
import { loadUserTrips, saveUserTrips } from "./utils/trips";
import "./Planner.css";

const WEATHER_API_BASE = "https://api.openweathermap.org/data/2.5/weather";

function normalizeDestinationQuery(rawDestination) {
  if (!rawDestination) return "";
  return rawDestination.split(",")[0].trim();
}

function Planner() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { itineraryDestination, setItineraryDestination } = useItinerary();
  const location = useLocation();
  const suggestedDestination = location.state?.add || "";

  const [trips, setTrips] = useState([]);
  const [editingTripId, setEditingTripId] = useState("");
  const [form, setForm] = useState({
    destination: suggestedDestination,
    startDate: "",
    endDate: "",
    budget: "",
    estimatedCost: "",
    notes: "",
  });
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherResult, setWeatherResult] = useState(null);
  const [weatherError, setWeatherError] = useState("");
  const [hotelRecommendations, setHotelRecommendations] = useState([]);
  const [hotelRecommendationsLoading, setHotelRecommendationsLoading] = useState(false);
  const [attractionRecommendations, setAttractionRecommendations] = useState([]);
  const [attractionRecommendationsLoading, setAttractionRecommendationsLoading] = useState(false);
  const [attractionRecommendationsError, setAttractionRecommendationsError] = useState("");
  const [showAttractionPopup, setShowAttractionPopup] = useState(false);
  const dismissedAttractionDestinationRef = useRef("");

  useEffect(() => {
    let ignore = false;

    const syncTrips = async () => {
      const savedTrips = await loadUserTrips(user?.uid);
      if (!ignore) setTrips(savedTrips);
    };

    syncTrips();
    return () => {
      ignore = true;
    };
  }, [user?.uid]);

  useEffect(() => {
    if (suggestedDestination) {
      setForm((prev) => ({ ...prev, destination: suggestedDestination }));
    }
  }, [suggestedDestination]);

  const todayString = new Date().toISOString().slice(0, 10);

  const upcomingTrips = useMemo(() => {
    return [...trips]
      .filter((trip) => trip.startDate >= todayString)
      .sort((a, b) => (a.startDate > b.startDate ? 1 : -1));
  }, [todayString, trips]);

  const notifications = useMemo(() => {
    const today = new Date(todayString);
    const list = [];

    upcomingTrips.forEach((trip) => {
      const budget = Number(trip.budget) || 0;
      const estimated = Number(trip.estimatedCost) || 0;
      if (budget > 0 && estimated > budget) {
        list.push({
          id: `budget-${trip.id}`,
          type: "Budget Alert",
          message: `${trip.destination}: estimated cost ($${estimated}) is over budget ($${budget}).`,
        });
      }

      if (trip.startDate) {
        const start = new Date(trip.startDate);
        const diffDays = Math.ceil((start - today) / (1000 * 60 * 60 * 24));
        if (diffDays >= 0 && diffDays <= 7) {
          list.push({
            id: `reminder-${trip.id}`,
            type: "Trip Reminder",
            message: `${trip.destination} starts in ${diffDays} day${diffDays === 1 ? "" : "s"}.`,
          });
        }
      }
    });

    return list;
  }, [todayString, upcomingTrips]);

  const recommendedHotels = useMemo(() => {
    return hotelRecommendations.slice(0, 3).map((hotel) => ({
      id: hotel.hotel_name,
      name: hotel.hotel_name,
      area: `Rating: ${hotel.rating}/5 | $${Math.round(hotel.price_per_night)}/night`,
    }));
  }, [hotelRecommendations]);

  useEffect(() => {
    const destinationQuery = normalizeDestinationQuery(itineraryDestination);
    if (!destinationQuery) {
      setWeatherResult(null);
      setWeatherError("");
      setWeatherLoading(false);
      return;
    }

    let cancelled = false;

    const fetchWeather = async () => {
      setWeatherLoading(true);
      setWeatherError("");

      const apiKey = process.env.REACT_APP_WEATHER_API_KEY;

      if (!apiKey) {
        setWeatherResult(null);
        setWeatherError("Weather API key is missing. Please set REACT_APP_WEATHER_API_KEY in .env.");
        setWeatherLoading(false);
        return;
      }

      try {
        const response = await fetch(
          `${WEATHER_API_BASE}?q=${encodeURIComponent(destinationQuery)}&units=metric&appid=${apiKey}`
        );
        const data = await response.json();
        if (cancelled) return;

        if (response.ok) {
          setWeatherResult(data);
        } else {
          setWeatherResult(null);
          setWeatherError(data.message || "Unable to load weather right now.");
        }
      } catch (error) {
        if (!cancelled) {
          setWeatherResult(null);
          setWeatherError(error.message || "Unable to load weather right now.");
        }
      } finally {
        if (!cancelled) setWeatherLoading(false);
      }
    };

    fetchWeather();

    return () => {
      cancelled = true;
    };
  }, [itineraryDestination]);

  useEffect(() => {
    const destinationQuery = normalizeDestinationQuery(itineraryDestination);
    if (!destinationQuery) {
      setHotelRecommendations([]);
      return;
    }

    const fetchHotels = async () => {
      setHotelRecommendationsLoading(true);
      try {
        const travelApiBase = process.env.REACT_APP_TRAVEL_API_BASE_URL || "http://127.0.0.1:5000";
        const response = await fetch(`${travelApiBase}/recommend-hotels`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            budget: 150,
            location_preference: "city centre",
            amenities: ["wifi"],
            past_choices: [],
          }),
        });

        if (response.ok) {
          const data = await response.json();
          setHotelRecommendations(data.recommendations || []);
        } else {
          setHotelRecommendations([]);
        }
      } catch (error) {
        console.error("Failed to fetch hotel recommendations", error);
        setHotelRecommendations([]);
      } finally {
        setHotelRecommendationsLoading(false);
      }
    };

    fetchHotels();
  }, [itineraryDestination]);

  useEffect(() => {
    const destinationQuery = normalizeDestinationQuery(itineraryDestination);
    if (!destinationQuery) {
      setAttractionRecommendations([]);
      setAttractionRecommendationsError("");
      setAttractionRecommendationsLoading(false);
      setShowAttractionPopup(false);
      return;
    }

    let cancelled = false;

    const matchingTrip = [...trips]
      .reverse()
      .find((trip) => normalizeDestinationQuery(trip.destination) === destinationQuery);

    const fetchAttractions = async () => {
      setAttractionRecommendationsLoading(true);
      setAttractionRecommendationsError("");

      try {
        const travelApiBase = process.env.REACT_APP_TRAVEL_API_BASE_URL || "http://127.0.0.1:5000";
        const response = await fetch(`${travelApiBase}/recommend-attractions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            destination: destinationQuery,
            preferences: {
              budget: matchingTrip?.budget ? `Budget USD ${matchingTrip.budget}` : "",
              estimatedCost: matchingTrip?.estimatedCost
                ? `Estimated cost USD ${matchingTrip.estimatedCost}`
                : "",
              notes: matchingTrip?.notes || "",
              dates: matchingTrip?.startDate
                ? `${matchingTrip.startDate}${matchingTrip.endDate ? ` to ${matchingTrip.endDate}` : ""}`
                : "",
            },
          }),
        });

        const data = await response.json().catch(() => ({}));
        if (cancelled) return;

        if (response.ok) {
          const attractions = data.attractions || [];
          setAttractionRecommendations(attractions);
          if (attractions.length > 0 && dismissedAttractionDestinationRef.current !== destinationQuery) {
            setShowAttractionPopup(true);
          }
        } else {
          setAttractionRecommendations([]);
          setAttractionRecommendationsError(data.error || "Unable to load attraction recommendations.");
          if (dismissedAttractionDestinationRef.current !== destinationQuery) {
            setShowAttractionPopup(true);
          }
        }
      } catch (error) {
        if (!cancelled) {
          setAttractionRecommendations([]);
          setAttractionRecommendationsError(error.message || "Unable to load attraction recommendations.");
          if (dismissedAttractionDestinationRef.current !== destinationQuery) {
            setShowAttractionPopup(true);
          }
        }
      } finally {
        if (!cancelled) setAttractionRecommendationsLoading(false);
      }
    };

    fetchAttractions();

    return () => {
      cancelled = true;
    };
  }, [itineraryDestination, trips]);

  const resetForm = () => {
    setForm({
      destination: "",
      startDate: "",
      endDate: "",
      budget: "",
      estimatedCost: "",
      notes: "",
    });
    setEditingTripId("");
  };

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const saveTripsToDb = (nextTrips) => {
    setTrips(nextTrips);
    saveUserTrips(user?.uid, nextTrips);
  };

  const onSubmit = (e) => {
    e.preventDefault();
    if (!form.destination.trim() || !form.startDate) return;

    const normalized = {
      destination: form.destination.trim(),
      startDate: form.startDate,
      endDate: form.endDate,
      budget: form.budget,
      estimatedCost: form.estimatedCost,
      notes: form.notes.trim(),
    };

    if (editingTripId) {
      const nextTrips = trips.map((trip) =>
        trip.id === editingTripId ? { ...trip, ...normalized } : trip
      );
      saveTripsToDb(nextTrips);
      setItineraryDestination(normalized.destination);
      resetForm();
      return;
    }

    const newTrip = {
      id: `${Date.now()}`,
      ...normalized,
      createdAt: new Date().toISOString(),
    };
    saveTripsToDb([...trips, newTrip]);
    setItineraryDestination(normalized.destination);
    resetForm();
  };

  const onEdit = (trip) => {
    setEditingTripId(trip.id);
    setItineraryDestination(trip.destination || "");
    setForm({
      destination: trip.destination || "",
      startDate: trip.startDate || "",
      endDate: trip.endDate || "",
      budget: trip.budget || "",
      estimatedCost: trip.estimatedCost || "",
      notes: trip.notes || "",
    });
  };

  const onDelete = (tripId) => {
    const nextTrips = trips.filter((trip) => trip.id !== tripId);
    saveTripsToDb(nextTrips);
    if (editingTripId === tripId) resetForm();
  };

  const handleBookHotel = () => {
    if (!itineraryDestination.trim()) return;
    navigate("/hotels", { state: { destination: itineraryDestination } });
  };

  const handleOpenWeatherPage = () => {
    if (!itineraryDestination.trim()) return;
    navigate("/weather", { state: { destination: itineraryDestination } });
  };

  const closeAttractionPopup = () => {
    dismissedAttractionDestinationRef.current = normalizeDestinationQuery(itineraryDestination);
    setShowAttractionPopup(false);
  };

  return (
    <div className="planner-page">
      {showAttractionPopup && (
        <div className="planner-popup-backdrop" role="presentation">
          <section className="planner-attraction-popup" role="dialog" aria-modal="true">
            <div className="planner-popup-header">
              <h2>Recommended Attractions in {normalizeDestinationQuery(itineraryDestination)}</h2>
              <button type="button" onClick={closeAttractionPopup} aria-label="Close attraction recommendations">
                x
              </button>
            </div>

            {attractionRecommendationsLoading && (
              <p className="planner-empty">Finding attractions with Ollama...</p>
            )}

            {!attractionRecommendationsLoading && attractionRecommendationsError && (
              <p className="planner-empty">{attractionRecommendationsError}</p>
            )}

            {!attractionRecommendationsLoading && !attractionRecommendationsError && (
              <div className="planner-attraction-list">
                {attractionRecommendations.map((attraction, index) => (
                  <article key={`${attraction.name}-${index}`} className="planner-attraction-item">
                    <h3>{attraction.name}</h3>
                    {attraction.reason && <p>{attraction.reason}</p>}
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      <div className="planner-header">
        <h1>Trip Planner</h1>
        <p>Manage your upcoming trips, edit plans, and track alerts.</p>
      </div>

      <section className="planner-form-card">
        <h2>{editingTripId ? "Edit Trip" : "Add New Trip"}</h2>
        <form onSubmit={onSubmit} className="planner-form">
          <input
            name="destination"
            value={form.destination}
            onChange={onChange}
            placeholder="Destination"
            required
          />
          <input name="startDate" type="date" value={form.startDate} onChange={onChange} required />
          <input name="endDate" type="date" value={form.endDate} onChange={onChange} />
          <input
            name="budget"
            type="number"
            min="0"
            value={form.budget}
            onChange={onChange}
            placeholder="Budget (USD)"
          />
          <input
            name="estimatedCost"
            type="number"
            min="0"
            value={form.estimatedCost}
            onChange={onChange}
            placeholder="Estimated Cost (USD)"
          />
          <textarea
            name="notes"
            value={form.notes}
            onChange={onChange}
            placeholder="Notes (optional)"
            rows={3}
          />
          <div className="planner-form-actions">
            <button type="submit">{editingTripId ? "Update Trip" : "Save Trip"}</button>
            {editingTripId && (
              <button type="button" className="planner-cancel-btn" onClick={resetForm}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="planner-list-card">
        <h2>Upcoming Trips ({upcomingTrips.length})</h2>
        {upcomingTrips.length === 0 ? (
          <p className="planner-empty">No upcoming trips yet.</p>
        ) : (
          <div className="planner-trip-list">
            {upcomingTrips.map((trip) => (
              <article key={trip.id} className="planner-trip-item">
                <h3>{trip.destination}</h3>
                <p>
                  {trip.startDate}
                  {trip.endDate ? ` to ${trip.endDate}` : ""}
                </p>
                <p>Budget: ${trip.budget || 0}</p>
                <p>Estimated: ${trip.estimatedCost || 0}</p>
                {trip.notes && <p>Notes: {trip.notes}</p>}
                <div className="planner-trip-actions">
                  <button type="button" onClick={() => onEdit(trip)}>
                    Edit
                  </button>
                  <button type="button" className="planner-delete-btn" onClick={() => onDelete(trip.id)}>
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="planner-notifications-card">
        <h2>Notifications ({notifications.length})</h2>
        {notifications.length === 0 ? (
          <p className="planner-empty">No alerts right now.</p>
        ) : (
          <ul className="planner-notification-list">
            {notifications.map((item) => (
              <li key={item.id}>
                <strong>{item.type}:</strong> {item.message}
              </li>
            ))}
          </ul>
        )}
      </section>

      {itineraryDestination && (
        <section className="planner-notifications-card">
          <h2>Smart Recommendations for {itineraryDestination}</h2>
          <p className="planner-empty">Book Hotel: ready to find stays that match this itinerary destination.</p>

          {hotelRecommendationsLoading && <p className="planner-empty">Loading hotel recommendations...</p>}

          {!hotelRecommendationsLoading && recommendedHotels.length > 0 && (
            <div className="planner-trip-list">
              {recommendedHotels.map((hotel) => (
                <article key={hotel.id} className="planner-trip-item">
                  <h3>{hotel.name}</h3>
                  <p>{hotel.area}</p>
                </article>
              ))}
            </div>
          )}

          {!hotelRecommendationsLoading && recommendedHotels.length === 0 && (
            <p className="planner-empty">No hotel recommendations available. Visit the Hotels page to search.</p>
          )}

          <div className="planner-smart-weather">
            <h3>Weather</h3>
            {weatherLoading && <p className="planner-empty">Loading weather...</p>}
            {!weatherLoading && weatherError && <p className="planner-empty">{weatherError}</p>}
            {!weatherLoading && weatherResult && (
              <p>
                {weatherResult.name}: {Math.round(weatherResult.main?.temp || 0)}degC,{" "}
                {weatherResult.weather?.[0]?.description || "Current conditions available"}
              </p>
            )}
          </div>

          <div className="planner-form-actions">
            <button type="button" onClick={handleBookHotel}>
              Book Hotel
            </button>
            <button type="button" className="planner-cancel-btn" onClick={handleOpenWeatherPage}>
              Open Weather Page
            </button>
          </div>
        </section>
      )}

      <Link to="/" className="planner-back-link">
        Back to Home
      </Link>
      <Link to="/dashboard" className="planner-back-link">
        Open Dashboard
      </Link>
    </div>
  );
}

export default Planner;
