import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { loadUserHotelBookings } from "./utils/bookings";
import { loadUserTrips, saveUserTrips } from "./utils/trips";
import { loadUserBudgets, saveUserBudgets } from "./utils/budgets";
import { loadUserWishlist, saveUserWishlist } from "./utils/wishlist";
import { categorizeTrips } from "./utils/tripStatus";
import "./Dashboard.css";

function toLabel(value) {
  if (!value) return "-";
  return value
    .split(",")
    .map((part) => part.trim())
    .map((part) =>
      part
        .split(" ")
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ")
    )
    .join(", ");
}

function Dashboard() {
  const { user } = useAuth();
  const displayName =
    user?.displayName || user?.name || user?.email?.split("@")[0] || "Traveler";
  const [trips, setTrips] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [hotelBookings, setHotelBookings] = useState([]);
  const [wishlist, setWishlist] = useState([]);
  const [editingTripId, setEditingTripId] = useState("");
  const [status, setStatus] = useState("");
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [form, setForm] = useState({
    destination: "",
    startDate: "",
    endDate: "",
    budget: "",
    estimatedCost: "",
    notes: "",
  });

  useEffect(() => {
    let ignore = false;

    const syncData = async () => {
      const [savedTrips, savedBudgets, savedWishlist, savedHotelBookings] = await Promise.all([
        loadUserTrips(user?.uid),
        loadUserBudgets(user?.uid),
        loadUserWishlist(user?.uid),
        loadUserHotelBookings(user?.uid),
      ]);
      if (ignore) return;
      setTrips(savedTrips);
      setBudgets(savedBudgets);
      setWishlist(savedWishlist);
      setHotelBookings(
        [...savedHotelBookings].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
      );
    };

    syncData();
    return () => {
      ignore = true;
    };
  }, [user?.uid]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentDate(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const todayString = currentDate.toISOString().slice(0, 10);

  const itineraryTrips = useMemo(() => {
    return [...trips].sort((a, b) => {
      if (a.startDate === b.startDate) return (a.destination || "").localeCompare(b.destination || "");
      return (a.startDate || "").localeCompare(b.startDate || "");
    });
  }, [trips]);

  const { upcoming: upcomingTrips, ongoing: ongoingTrips, completed: completedTrips } = useMemo(() => {
    return categorizeTrips(itineraryTrips, todayString);
  }, [itineraryTrips, todayString]);

  const notifications = useMemo(() => {
    const today = new Date(todayString);
    const list = [];

    [...upcomingTrips, ...ongoingTrips].forEach((trip) => {
      const budget = Number(trip.budget) || 0;
      const estimated = Number(trip.estimatedCost) || 0;
      if (budget > 0 && estimated > budget) {
        list.push({
          id: `budget-${trip.id}`,
          type: "Budget Alert",
          message: `${trip.destination}: estimated $${estimated} is over budget $${budget}.`,
        });
      }

      const start = trip.startDate ? new Date(trip.startDate) : null;
      if (start) {
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

    ongoingTrips.forEach((trip) => {
      list.push({
        id: `ongoing-${trip.id}`,
        type: "Ongoing Trip",
        message: `${trip.destination} is currently ongoing.`,
      });
    });

    return list;
  }, [todayString, ongoingTrips, upcomingTrips]);

  const saveTripsToDb = (nextTrips) => {
    setTrips(nextTrips);
    saveUserTrips(user?.uid, nextTrips);
  };

  const saveWishlistToDb = (nextWishlist) => {
    setWishlist(nextWishlist);
    saveUserWishlist(user?.uid, nextWishlist);
  };

  const resetForm = () => {
    setEditingTripId("");
    setForm({
      destination: "",
      startDate: "",
      endDate: "",
      budget: "",
      estimatedCost: "",
      notes: "",
    });
  };

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
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
        trip.id === editingTripId ? { ...trip, ...normalized, updatedAt: new Date().toISOString() } : trip
      );
      saveTripsToDb(nextTrips);
      setStatus("Trip updated.");
      resetForm();
      return;
    }

    const newTrip = {
      id: `${Date.now()}`,
      ...normalized,
      createdAt: new Date().toISOString(),
    };
    saveTripsToDb([...trips, newTrip]);
    setStatus("Trip added to itinerary.");
    resetForm();
  };

  const onEdit = (trip) => {
    setEditingTripId(trip.id);
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
    setStatus("Trip deleted.");
  };

  const onPlanWishlist = (item) => {
    setForm((prev) => ({ ...prev, destination: toLabel(item) }));
    setStatus("Wishlist destination loaded into itinerary form.");
  };

  const onRemoveWishlist = (item) => {
    const nextWishlist = wishlist.filter((entry) => entry !== item);
    saveWishlistToDb(nextWishlist);
    setStatus("Removed from wishlist.");
  };

  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <h1>Welcome, {displayName}</h1>
        <p>Manage upcoming trips, itinerary changes, reminders, and wishlist in one place.</p>
        <nav className="dashboard-nav">
          <Link to="/">Home</Link>
          <Link to="/destinations">Destinations</Link>
          <Link to="/transport">Transport</Link>
          <Link to="/profile">Profile</Link>
        </nav>
      </header>

      <section className="dashboard-metrics">
        <article>
          <h3>{upcomingTrips.length}</h3>
          <p>Upcoming Trips</p>
        </article>
        <article>
          <h3>{ongoingTrips.length}</h3>
          <p>Ongoing Trips</p>
        </article>
        <article>
          <h3>{completedTrips.length}</h3>
          <p>Completed Trips</p>
        </article>
        <article>
          <h3>{notifications.length}</h3>
          <p>Notifications</p>
        </article>
        <article>
          <h3>{budgets.length}</h3>
          <p>AI Budget Plans</p>
        </article>
        <article>
          <h3>{wishlist.length}</h3>
          <p>Wishlist Items</p>
        </article>
        <article>
          <h3>{hotelBookings.length}</h3>
          <p>Hotel Bookings</p>
        </article>
      </section>

      <section className="dashboard-grid">
        <div className="dashboard-card">
          <h2>{editingTripId ? "Edit Trip" : "Add Trip"}</h2>
          <form onSubmit={onSubmit} className="dashboard-form">
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
              rows={3}
              placeholder="Notes"
            />
            <div className="dashboard-form-actions">
              <button type="submit">{editingTripId ? "Update Trip" : "Save Trip"}</button>
              {editingTripId && (
                <button type="button" className="secondary" onClick={resetForm}>
                  Cancel
                </button>
              )}
            </div>
          </form>
          {status && <p className="dashboard-status">{status}</p>}
        </div>

        <div className="dashboard-card">
          <h2>Notifications ({notifications.length})</h2>
          {notifications.length === 0 ? (
            <p className="dashboard-empty">No budget alerts or reminders right now.</p>
          ) : (
            <ul className="dashboard-list">
              {notifications.map((item) => (
                <li key={item.id}>
                  <strong>{item.type}:</strong> {item.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="dashboard-card">
        <h2>Upcoming Trips ({upcomingTrips.length})</h2>
        {upcomingTrips.length === 0 ? (
          <p className="dashboard-empty">No upcoming trips yet.</p>
        ) : (
          <div className="dashboard-trip-list">
            {upcomingTrips.map((trip) => (
              <article key={trip.id} className="dashboard-trip-item">
                <h3>{trip.destination}</h3>
                <p>
                  {trip.startDate}
                  {trip.endDate ? ` to ${trip.endDate}` : ""}
                </p>
                <p>Budget: ${trip.budget || 0}</p>
                <p>Estimated: ${trip.estimatedCost || 0}</p>
                {trip.notes && <p>Notes: {trip.notes}</p>}
                <div className="dashboard-trip-actions">
                  <button type="button" className="secondary" onClick={() => onEdit(trip)}>
                    Edit
                  </button>
                  <button type="button" className="danger" onClick={() => onDelete(trip.id)}>
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="dashboard-card">
        <h2>Ongoing Trips ({ongoingTrips.length})</h2>
        {ongoingTrips.length === 0 ? (
          <p className="dashboard-empty">No ongoing trips right now.</p>
        ) : (
          <div className="dashboard-trip-list">
            {ongoingTrips.map((trip) => (
              <article key={trip.id} className="dashboard-trip-item">
                <h3>{trip.destination}</h3>
                <p>
                  {trip.startDate}
                  {trip.endDate ? ` to ${trip.endDate}` : ""}
                </p>
                <p>Budget: ${trip.budget || 0}</p>
                <p>Estimated: ${trip.estimatedCost || 0}</p>
                {trip.notes && <p>Notes: {trip.notes}</p>}
                <div className="dashboard-trip-actions">
                  <button type="button" className="secondary" onClick={() => onEdit(trip)}>
                    Edit
                  </button>
                  <button type="button" className="danger" onClick={() => onDelete(trip.id)}>
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="dashboard-card">
        <h2>Completed Trips ({completedTrips.length})</h2>
        {completedTrips.length === 0 ? (
          <p className="dashboard-empty">No completed trips yet.</p>
        ) : (
          <div className="dashboard-trip-list">
            {completedTrips.map((trip) => (
              <article key={trip.id} className="dashboard-trip-item">
                <h3>{trip.destination}</h3>
                <p>
                  {trip.startDate}
                  {trip.endDate ? ` to ${trip.endDate}` : ""}
                </p>
                <p>Budget: ${trip.budget || 0}</p>
                <p>Estimated: ${trip.estimatedCost || 0}</p>
                {trip.notes && <p>Notes: {trip.notes}</p>}
                <div className="dashboard-trip-actions">
                  <button type="button" className="secondary" onClick={() => onEdit(trip)}>
                    Edit
                  </button>
                  <button type="button" className="danger" onClick={() => onDelete(trip.id)}>
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="dashboard-card">
        <h2>AI Budget Plans ({budgets.length})</h2>
        {budgets.length === 0 ? (
          <p className="dashboard-empty">No AI budget plans saved yet.</p>
        ) : (
          <div className="dashboard-trip-list">
            {budgets.map((budget) => (
              <article key={budget.id} className="dashboard-trip-item">
                <h3>{budget.destination}</h3>
                <p>Days: {budget.days}</p>
                <p>Total Budget: ${budget.totalBudget}</p>
                <p>Estimated Total: ${budget.estimatedTotal}</p>
                <p>Remaining: ${budget.remaining}</p>
                <div style={{ marginTop: "10px", fontSize: "0.9em", color: "#666" }}>
                  <p>
                    Hotel: ${budget.hotelCost} | Food: ${budget.foodCost} | Transport: ${budget.transportCost} |
                    Activities: ${budget.activitiesCost} | Misc: ${budget.miscCost}
                  </p>
                </div>
                {budget.destinationSummary && (
                  <p>
                    <em>{budget.destinationSummary}</em>
                  </p>
                )}
                <div className="dashboard-trip-actions">
                  <button
                    type="button"
                    className="danger"
                    onClick={() => {
                      const nextBudgets = budgets.filter((b) => b.id !== budget.id);
                      setBudgets(nextBudgets);
                      saveUserBudgets(user?.uid, nextBudgets);
                      setStatus("Budget plan deleted.");
                    }}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="dashboard-card">
        <h2>Confirmed Hotel Bookings ({hotelBookings.length})</h2>
        {hotelBookings.length === 0 ? (
          <p className="dashboard-empty">No hotel bookings confirmed yet.</p>
        ) : (
          <div className="dashboard-trip-list">
            {hotelBookings.map((booking) => (
              <article key={booking.bookingReference || booking.bookingId} className="dashboard-trip-item">
                <h3>{booking.hotelName}</h3>
                <p>{booking.destination}</p>
                <p>
                  {booking.checkInDate} to {booking.checkOutDate}
                </p>
                <p>Guests: {booking.guests}</p>
                <p>Total: ${booking.totalPrice || 0}</p>
                <p>Payment: {booking.paymentMethod}</p>
                <p>
                  Status: {booking.paymentStatus} · {booking.bookingStatus}
                </p>
                <p>Reference: {booking.bookingReference}</p>
              </article>
            ))}
          </div>
        )}
      </section>
      <section className="dashboard-card">
        <h2>Wishlist ({wishlist.length})</h2>
        {wishlist.length === 0 ? (
          <p className="dashboard-empty">No wishlist destinations saved.</p>
        ) : (
          <ul className="dashboard-wishlist">
            {wishlist.map((item) => (
              <li key={item}>
                <span>{toLabel(item)}</span>
                <div>
                  <button type="button" className="secondary" onClick={() => onPlanWishlist(item)}>
                    Add To Itinerary
                  </button>
                  <button type="button" className="danger" onClick={() => onRemoveWishlist(item)}>
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default Dashboard;
