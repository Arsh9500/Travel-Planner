import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { getDestination } from "./data/destinations";
import Logo from "./components/Logo";
import { loadUserWishlist, saveUserWishlist } from "./utils/wishlist";
import "./DestinationDetail.css";

function DestinationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const dest = getDestination(id);

  const [liveWeather, setLiveWeather] = useState(dest?.weather || "");
  const [wishlist, setWishlist] = useState([]);

  // fetch weather if we have an API key
  useEffect(() => {
    const apiKey = process.env.REACT_APP_WEATHER_API_KEY;
    if (!apiKey || !dest?.name) return;

    const fetchWeather = async () => {
      try {
        const resp = await fetch(
          `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(
            dest.name
          )}&units=metric&appid=${apiKey}`
        );
        const data = await resp.json();
        if (resp.ok && data?.main) {
          setLiveWeather(
            `${data.weather[0].description}, ${Math.round(data.main.temp)}°C`
          );
        }
      } catch (err) {
        console.error("weather fetch failed", err);
      }
    };
    fetchWeather();
  }, [dest]);

  // synchronize wishlist for current user
  useEffect(() => {
    let ignore = false;

    const syncWishlist = async () => {
      const list = await loadUserWishlist(user?.uid);
      if (!ignore) setWishlist(list);
    };

    syncWishlist();
    return () => {
      ignore = true;
    };
  }, [user?.uid]);

  const totalDailyCost = useMemo(() => {
    if (!dest) return 0;
    return (
      dest.estimatedCosts.hotelPerNight +
      dest.estimatedCosts.foodPerDay +
      dest.estimatedCosts.localTransportPerDay +
      (dest.estimatedCosts.activitiesPerDay ?? 0)
    );
  }, [dest]);

  if (!dest) {
    return (
      <div className="dest-detail-page">
        <header className="dest-detail-nav">
          <Logo className="dest-nav-logo" />
          <Link to="/destinations">Back to Destinations</Link>
        </header>
        <p>Destination not found.</p>
      </div>
    );
  }

  const handleAddToItinerary = () => {
    if (!user) {
      navigate("/register", { state: { from: `/destinations/${id}` } });
      return;
    }
    navigate("/planner", { state: { add: dest.name } });
  };

  const inWishlist = wishlist.includes(dest.id);

  const handleWishlist = () => {
    if (!user?.uid) {
      navigate("/register", { state: { from: `/destinations/${id}` } });
      return;
    }

    setWishlist((prev) => {
      const next = prev.includes(dest.id)
        ? prev.filter((item) => item !== dest.id)
        : [...prev, dest.id];
      saveUserWishlist(user.uid, next);
      return next;
    });
  };

  return (
    <div className="dest-detail-page">
      <header className="dest-detail-nav">
        <div className="dest-detail-nav-inner">
          <Logo className="dest-nav-logo" />
          <nav className="dest-nav-links">
            <Link to="/">Home</Link>
            <Link to="/destinations">Destinations</Link>
            <Link to="/attractions">Attractions</Link>
            <Link to="/planner">Planner</Link>
            <Link to="/destinations">Back to Destinations</Link>
          </nav>
        </div>
      </header>

      <div className="dest-banner" style={{ backgroundImage: `url(${dest.image})` }} />

      <section className="dest-info">
        <h1>{dest.name}</h1>
        <p className="dest-subtitle">
          {dest.city}, {dest.country} | {dest.climate} climate | {dest.travelType}
        </p>
        <p className="dest-desc">{dest.description}</p>
      </section>

      <section className="dest-weather">
        <h3>Weather</h3>
        <p>{liveWeather}</p>
      </section>

      <section className="dest-attractions">
        <h3>Attractions</h3>
        <ul>
          {dest.attractions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </section>

      <section className="dest-costs">
        <h3>Estimated Costs (USD)</h3>
        <p>Hotel per night: ${dest.estimatedCosts.hotelPerNight}</p>
        <p>Food per day: ${dest.estimatedCosts.foodPerDay}</p>
        <p>Local transport per day: ${dest.estimatedCosts.localTransportPerDay}</p>
        <p>Activities per day: ${dest.estimatedCosts.activitiesPerDay ?? "N/A"}</p>
        <p className="dest-total">Estimated daily total: ${totalDailyCost}</p>
      </section>

      <section className="dest-actions">
        <button type="button" className="dest-btn dest-btn-primary" onClick={handleAddToItinerary}>
          Add to Itinerary
        </button>
        <button
          type="button"
          className="dest-btn dest-btn-secondary"
          onClick={() => navigate("/budget", { state: { destinationId: dest.id } })}
        >
          Budget Planner
        </button>
        <button type="button" className="dest-btn dest-btn-secondary" onClick={handleWishlist}>
          {inWishlist ? "Saved to Wishlist" : "Save to Wishlist"}
        </button>
      </section>
    </div>
  );
}

export default DestinationDetail;
