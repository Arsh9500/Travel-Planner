import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Logo from "./components/Logo";
import Chatbot from "./components/Chatbot";
import "./Home.css";

function Home() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = React.useState("");

  const welcomeType = location.state?.welcomeType;
  const displayName =
    user?.displayName || user?.name || user?.email?.split("@")[0] || "Traveler";
  const avatarLetter = displayName.charAt(0).toUpperCase();
  const welcomeText = welcomeType === "back" ? "Welcome back" : "Welcome";

  const handleSearchGo = () => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return;

    const routeRules = [
      { keywords: ["home", "main"], path: "/", requiresAuth: false },
      { keywords: ["about", "info"], path: "/about", requiresAuth: false },
      { keywords: ["destination", "destinations", "place", "places"], path: "/destinations", requiresAuth: true },
      { keywords: ["hotel", "hotels", "stay", "booking"], path: "/hotels", requiresAuth: true },
      { keywords: ["planner", "plan", "itinerary"], path: "/planner", requiresAuth: true },
      { keywords: ["budget", "cost", "expense"], path: "/budget", requiresAuth: true },
      { keywords: ["weather", "forecast", "temperature"], path: "/weather", requiresAuth: true },
      { keywords: ["dashboard", "my trips", "overview"], path: "/dashboard", requiresAuth: true },
      { keywords: ["profile", "account", "settings"], path: "/profile", requiresAuth: true },
      { keywords: ["login", "sign in"], path: "/login", requiresAuth: false },
      { keywords: ["register", "sign up", "signup"], path: "/register", requiresAuth: false },
    ];

    const matchedRoute = routeRules.find((rule) =>
      rule.keywords.some((keyword) => query.includes(keyword))
    );

    const destination = matchedRoute?.path || "/destinations";
    const requiresAuth = matchedRoute?.requiresAuth ?? true;

    if (!user && requiresAuth) {
      navigate("/register", { state: { from: destination } });
      return;
    }

    navigate(destination);
  };

  const handleSearchKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleSearchGo();
    }
  };

  return (
    <div className="home-page">
      <header className="header">
        <div className="header-inner">
          <Logo className="logo" />

          {user && (
            <div className="welcome-user">
              <span className="avatar">{avatarLetter}</span>
              <button
                type="button"
                className="welcome-text welcome-text-link"
                onClick={() => navigate("/dashboard")}
              >
                {welcomeText}, {displayName}
              </button>
            </div>
          )}

          <nav className="nav">
            <Link to="/">Home</Link>
            <Link to="/destinations">Destinations</Link>
            {user && <Link to="/profile">Profile</Link>}
            {user?.role === "admin" && <Link to="/admin">Admin</Link>}
            <Link to="/about">About</Link>
            {user ? (
              <button type="button" className="nav-login nav-logout" onClick={logout}>
                Logout
              </button>
            ) : (
              <Link to="/login" className="nav-login">
                Login
              </Link>
            )}
          </nav>
        </div>
      </header>

      <section className="hero">
        <div className="hero-overlay" />
        <div className="hero-content">
          <h1 className="hero-title">Plan Your Trip Smartly & Easily</h1>
          <div className="hero-search">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search pages: hotels, planner, budget, weather, dashboard"
            />
            <button type="button" onClick={handleSearchGo}>
              Go
            </button>
          </div>
        </div>
      </section>

      <section className="home-cards-section">
        <h2 className="home-cards-heading">Where would you like to go?</h2>
        <div className="home-cards-grid">
          <div className="home-card home-card-destination">
            <div
              className="home-card-image"
              style={{
                backgroundImage:
                  "url(https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=600)",
              }}
            />
            <div className="home-card-body">
              <h3>Destination Search</h3>
              <p>
                Discover where you want to travel. Explore places, compare destinations,
                and find your next adventure.
              </p>
              <button
                type="button"
                className="home-card-cta"
                onClick={() =>
                  user
                    ? navigate("/destinations")
                    : navigate("/register", { state: { from: "/" } })
                }
              >
                Explore destinations
              </button>
            </div>
          </div>

          <div className="home-card home-card-budget">
            <div
              className="home-card-image"
              style={{
                backgroundImage:
                  "url(https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=600)",
              }}
            />
            <div className="home-card-body">
              <h3>Budget Planning</h3>
              <p>
                Set your trip budget, track expenses, and get smart cost
                estimates for flights, stays, and activities.
              </p>
              <button
                type="button"
                className="home-card-cta"
                onClick={() =>
                  user
                    ? navigate("/budget")
                    : navigate("/register", { state: { from: "/" } })
                }
              >
                Plan my budget
              </button>
            </div>
          </div>

          <div className="home-card home-card-hotel">
            <div
              className="home-card-image"
              style={{
                backgroundImage:
                  "url(https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600)",
              }}
            />
            <div className="home-card-body">
              <h3>Hotel Bookings</h3>
              <p>
                Find and book hotels that fit your budget. Compare prices, read reviews,
                and reserve your stay.
              </p>
              <button
                type="button"
                className="home-card-cta"
                onClick={() =>
                  user
                    ? navigate("/hotels")
                    : navigate("/register", { state: { from: "/" } })
                }
              >
                Find hotels
              </button>
            </div>
          </div>

          <div className="home-card home-card-weather">
            <div
              className="home-card-image"
              style={{
                backgroundImage:
                  "url(https://images.unsplash.com/photo-1504386106331-3e4e71712b38?w=600)",
              }}
            />
            <div className="home-card-body">
              <h3>Weather Check</h3>
              <p>
                Check forecasts for your destination. Pack right and plan outdoor
                activities with up-to-date conditions.
              </p>
              <button
                type="button"
                className="home-card-cta"
                onClick={() =>
                  user
                    ? navigate("/weather")
                    : navigate("/register", { state: { from: "/weather" } })
                }
              >
                Check weather
              </button>
            </div>
          </div>

          <div className="home-card home-card-transport">
            <div
              className="home-card-image"
              style={{
                backgroundImage:
                  "url(https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=700&auto=format&fit=crop)",
              }}
            />
            <div className="home-card-body">
              <h3>Transport Planning</h3>
              <p>
                Get smart transport suggestions for trains, rideshares, taxis, and shuttles with estimated travel time and budget guidance.
              </p>
              <button
                type="button"
                className="home-card-cta"
                onClick={() =>
                  user
                    ? navigate("/transport")
                    : navigate("/register", { state: { from: "/transport" } })
                }
              >
                Plan transport
              </button>
            </div>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="footer-inner">
          <p>&copy; {new Date().getFullYear()} Travel Website. All rights reserved.</p>
        </div>
      </footer>

      <Chatbot user={user} />
    </div>
  );
}

export default Home;
