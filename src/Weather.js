import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useItinerary } from "./context/ItineraryContext";
import { requestPlacesReply, buildPlaceMapLink } from "./services/placesService";
import WeatherAISuggestions from "./components/WeatherAISuggestions";
import "./Weather.css";

// Replace with your own free API key from https://openweathermap.org (or another provider)
const API_BASE = "https://api.openweathermap.org/data/2.5/weather";
const FORECAST_API_BASE = "https://api.openweathermap.org/data/2.5/forecast";
// Convenience fallback for quick testing.
const DEFAULT_API_KEY = "b0de676fca853faaf818b515e2940193"; // demo only

function getWeatherRecommendation(result) {
  const weatherMain = (result?.weather?.[0]?.main || "").toLowerCase();
  const cityName = result?.name || "this city";

  if (weatherMain === "clear") {
    return {
      title: "Great day for outdoors",
      tip: `Sunny in ${cityName}. Good time for beach visits, parks, and walking tours.`,
      activities: [
        "Visit local beaches or waterfront areas",
        "Go sightseeing and explore landmarks",
        "Hiking in nearby trails or parks",
        "Outdoor photography of scenic views",
        "Picnic in a park or garden"
      ],
      travelTips: [
        "Wear sunscreen and a hat",
        "Stay hydrated and carry water",
        "Use comfortable walking shoes",
        "Check for any heat advisories"
      ]
    };
  }

  if (weatherMain === "rain" || weatherMain === "drizzle" || weatherMain === "thunderstorm") {
    return {
      title: "Rainy day plan",
      tip: `Wet weather in ${cityName}. Better for indoor plans like cafes, museums, and shopping.`,
      activities: [
        "Visit museums and art galleries",
        "Explore indoor cafes and restaurants",
        "Go shopping in malls or markets",
        "Attend cultural shows or performances",
        "Visit historical sites with indoor exhibits"
      ],
      travelTips: [
        "Carry an umbrella or raincoat",
        "Wear waterproof shoes",
        "Plan indoor transportation options",
        "Check for indoor attractions opening hours"
      ]
    };
  }

  if (weatherMain === "snow") {
    return {
      title: "Snow day tip",
      tip: `Snow expected in ${cityName}. Wear warm layers and keep indoor stops in your plan.`,
      activities: [
        "Go skiing or snowboarding at resorts",
        "Build snowmen or have snowball fights",
        "Visit winter festivals or markets",
        "Enjoy hot drinks at cozy cafes",
        "Take winter landscape photos"
      ],
      travelTips: [
        "Wear warm, layered clothing",
        "Use snow-appropriate footwear",
        "Check road conditions for travel",
        "Carry hand warmers and blankets"
      ]
    };
  }

  if (weatherMain === "clouds" || weatherMain === "mist" || weatherMain === "fog" || weatherMain === "haze") {
    return {
      title: "Balanced day plan",
      tip: `Cloudy weather in ${cityName}. Light outdoor sightseeing should still work well.`,
      activities: [
        "Take a city walking tour",
        "Practice street photography",
        "Visit botanical gardens or parks",
        "Explore local neighborhoods",
        "Attend outdoor markets or fairs"
      ],
      travelTips: [
        "Carry a light jacket for changing weather",
        "Have indoor backup plans ready",
        "Use comfortable walking shoes",
        "Check for any fog-related travel warnings"
      ]
    };
  }

  return {
    title: "Smart travel tip",
    tip: `For ${cityName}, keep one outdoor option and one indoor backup plan.`,
    activities: [
      "Explore local attractions",
      "Visit nearby cafes or restaurants",
      "Go shopping in local stores",
      "Take a leisurely walk",
      "Try local cuisine"
    ],
    travelTips: [
      "Check weather updates regularly",
      "Have flexible plans",
      "Carry essentials like water and snacks",
      "Be prepared for weather changes"
    ]
  };
}

function getFavoritePlacesForWeather(city, weatherMain) {
  const normalized = (weatherMain || "").toLowerCase();
  const inCity = city || "this city";

  const rainy = ["rain", "drizzle", "thunderstorm"].includes(normalized);
  const cold = ["snow", "mist", "fog", "haze"].includes(normalized);
  const normalizedKey = rainy ? "rain" : cold ? "snow" : normalized;

  const presets = {
    clear: [
      { name: `${inCity} Riverside Promenade`, address: `Waterfront district, ${inCity}` },
      { name: `${inCity} Botanical Garden`, address: `Garden Road, ${inCity}` },
      { name: `${inCity} Scenic Viewpoint`, address: `Hilltop lookout, ${inCity}` },
    ],
    rain: [
      { name: `${inCity} National Museum`, address: `Museum quarter, ${inCity}` },
      { name: `${inCity} Indoor Food Hall`, address: `Market street, ${inCity}` },
      { name: `${inCity} Art Gallery`, address: `Gallery avenue, ${inCity}` },
    ],
    snow: [
      { name: `${inCity} Winter Culture Museum`, address: `Old town center, ${inCity}` },
      { name: `${inCity} Heated Observation Deck`, address: `Central tower, ${inCity}` },
      { name: `${inCity} Cozy Cocoa Cafe`, address: `Main square, ${inCity}` },
    ],
    clouds: [
      { name: `${inCity} Historic City Walk`, address: `Town center, ${inCity}` },
      { name: `${inCity} Street Photography Route`, address: `Old quarter, ${inCity}` },
      { name: `${inCity} Riverside Cafe`, address: `River district, ${inCity}` },
    ],
  };

  return presets[normalizedKey] || [
    { name: `${inCity} Top Landmark`, address: `Center, ${inCity}` },
    { name: `${inCity} Local Market`, address: `Market District, ${inCity}` },
    { name: `${inCity} City Museum`, address: `Museum Rd, ${inCity}` },
  ];
}

function buildWeatherAwarePlacesMessage(city, weatherMain, temp) {
  const normalized = (weatherMain || "").toLowerCase();
  const tempText = Number.isFinite(temp) ? `${temp}°C` : "current weather";

  if (["rain", "drizzle", "thunderstorm"].includes(normalized)) {
    return `Indoor attractions in ${city} suitable for rainy weather (${tempText}), such as museums, galleries, covered markets, and cafes`;
  }

  if (["snow", "mist", "fog", "haze"].includes(normalized)) {
    return `Warm indoor-friendly activities in ${city} for cold weather (${tempText}), including museums, cultural centers, and cozy cafes`;
  }

  if (normalized === "clear") {
    return `Outdoor scenic attractions in ${city} for clear weather (${tempText}), including viewpoints, parks, and walking areas`;
  }

  return `Top attractions in ${city} suitable for ${normalized || "current"} weather (${tempText})`;
}

function buildDailyForecast(list, timezoneOffsetSec = 0) {
  if (!Array.isArray(list)) return [];
  const byDate = new Map();

  list.forEach((entry) => {
    const dt = new Date((entry?.dt || 0) * 1000 + timezoneOffsetSec * 1000);
    if (Number.isNaN(dt.getTime())) return;

    const dateKey = dt.toISOString().slice(0, 10);
    const existing = byDate.get(dateKey);

    // Prefer 12:00 data point if available because it is usually stable for daytime planning.
    const isNoon = (entry.dt_txt || "").includes("12:00:00");
    if (!existing || (isNoon && !existing.isNoon)) {
      byDate.set(dateKey, { ...entry, isNoon });
    }
  });

  return [...byDate.values()]
    .slice(1, 5)
    .map((entry) => {
      const dt = new Date((entry.dt || 0) * 1000 + timezoneOffsetSec * 1000);
      return {
        id: String(entry.dt),
        day: dt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
        temp: Math.round(entry.main?.temp || 0),
        description: entry.weather?.[0]?.description || "No details",
        icon: entry.weather?.[0]?.icon || "",
      };
    });
}

function buildTodayForecast(list, timezoneOffsetSec = 0) {
  if (!Array.isArray(list)) return [];

  const todayKey = new Date(Date.now() + timezoneOffsetSec * 1000).toISOString().slice(0, 10);

  return list
    .map((entry) => {
      const dt = new Date((entry?.dt || 0) * 1000 + timezoneOffsetSec * 1000);
      return {
        ...entry,
        localDateKey: dt.toISOString().slice(0, 10),
        localTime: dt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
      };
    })
    .filter((entry) => entry.localDateKey === todayKey)
    .slice(0, 8)
    .map((entry) => ({
      id: String(entry.dt),
      time: entry.localTime,
      temp: Math.round(entry.main?.temp || 0),
      description: entry.weather?.[0]?.description || "No details",
      icon: entry.weather?.[0]?.icon || "",
    }));
}

function Weather() {
  const locationState = useLocation();
  const { itineraryDestination, setItineraryDestination } = useItinerary();
  const [location, setLocation] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [hasAutoLoaded, setHasAutoLoaded] = useState(false);
  const [forecast, setForecast] = useState([]);
  const [todayForecast, setTodayForecast] = useState([]);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastError, setForecastError] = useState("");

  const [placeSuggestions, setPlaceSuggestions] = useState([]);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [placesError, setPlacesError] = useState("");
  const [placesNotice, setPlacesNotice] = useState("");

  const sampleCities = ["Paris", "Tokyo", "New York", "Sydney", "Cairo", "Rio de Janeiro", "Moscow", "Cape Town"];

  const isEmpty = !result && !error;
  const weatherRecommendation = useMemo(() => getWeatherRecommendation(result), [result]);

  const fetchWeatherForLocation = useCallback(async (rawLocation) => {
    const city = (rawLocation || "").trim();
    if (!city) return;

    setError("");
    setResult(null);
    setForecast([]);
    setTodayForecast([]);
    setForecastError("");
    setPlaceSuggestions([]);
    setPlacesError("");
    setPlacesNotice("");

    let apiKey = process.env.REACT_APP_WEATHER_API_KEY;
    if (!apiKey) {
      apiKey = DEFAULT_API_KEY;
      console.warn("REACT_APP_WEATHER_API_KEY not set; falling back to default");
    }
    if (!apiKey) {
      setError("API key is missing. Please create a .env file with REACT_APP_WEATHER_API_KEY set or hard-code one.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}?q=${encodeURIComponent(city)}&units=metric&appid=${apiKey}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Unable to fetch weather");
        return;
      }

      setResult(data);
      setItineraryDestination(city);

      // Future forecast based on selected city coordinates.
      if (Number.isFinite(data?.coord?.lat) && Number.isFinite(data?.coord?.lon)) {
        setForecastLoading(true);
        try {
          const forecastRes = await fetch(
            `${FORECAST_API_BASE}?lat=${data.coord.lat}&lon=${data.coord.lon}&units=metric&appid=${apiKey}`
          );
          const forecastData = await forecastRes.json();

          if (forecastRes.ok) {
            const timezoneOffset = forecastData.city?.timezone ?? 0;
            setTodayForecast(buildTodayForecast(forecastData.list, timezoneOffset));
            setForecast(buildDailyForecast(forecastData.list, timezoneOffset));
          } else {
            setForecastError(forecastData.message || "Unable to fetch future forecast.");
          }
        } catch (forecastErr) {
          setForecastError(forecastErr.message || "Unable to fetch future forecast.");
        } finally {
          setForecastLoading(false);
        }
      }
    } catch (err) {
      setError(err.message);
    }
  }, [setItineraryDestination]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    fetchWeatherForLocation(location);
  };

  useEffect(() => {
    if (hasAutoLoaded) return;

    const routeDestination = (locationState.state?.destination || "").trim();
    const sharedDestination = (itineraryDestination || "").trim();
    const autoDestination = routeDestination || sharedDestination;
    if (!autoDestination) return;

    setLocation(autoDestination);
    fetchWeatherForLocation(autoDestination);
    setHasAutoLoaded(true);
  }, [hasAutoLoaded, itineraryDestination, locationState.state, fetchWeatherForLocation]);

  useEffect(() => {
    if (!result) return;

    const city = result.name || location;
    const weatherDesc = result.weather?.[0]?.description || "weather";
    const temp = Math.round(result.main?.temp || 0);

    setPlacesLoading(true);
    setPlacesError("");
    setPlacesNotice("");
    setPlaceSuggestions([]);

    const weatherMain = (result.weather?.[0]?.main || "").toLowerCase();
    const placesMessage = buildWeatherAwarePlacesMessage(city, weatherMain, temp);

    requestPlacesReply({ message: placesMessage, searchType: "attractions" })
      .then((data) => {
        if (Array.isArray(data.places) && data.places.length > 0) {
          setPlaceSuggestions(data.places);
        } else {
          setPlaceSuggestions(getFavoritePlacesForWeather(city, weatherMain));
          setPlacesNotice("Showing curated nearby suggestions based on current weather.");
        }
      })
      .catch(() => {
        setPlacesNotice("Live nearby places are unavailable right now. Showing curated suggestions.");
        setPlaceSuggestions(getFavoritePlacesForWeather(city, weatherMain));
      })
      .finally(() => setPlacesLoading(false));
  }, [result, location]);

  const navigate = useNavigate();
  const themeClass = result ? `weather-${(result.weather?.[0]?.main || "").toLowerCase()}` : "weather-default";

  return (
    <div className={`weather-screen ${themeClass}`}>
      <div className="weather-page">
        <div className="weather-header">
          <button type="button" className="weather-back" onClick={() => navigate(-1)}>
            ← Back
          </button>
          <img
            src="https://images.unsplash.com/photo-1501973801540-537f08ccae7f?w=100&auto=format&fit=crop"
            alt="weather icon"
            className="weather-header-icon"
          />
          <h2>Weather Checker</h2>
        </div>

        <form onSubmit={handleSubmit} className="weather-form">
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Enter city or place name"
            required
          />
          <button type="submit">Search</button>
        </form>

        <div className="weather-samples">
          <p>Try one of these:</p>
          <div className="weather-sample-list">
            {sampleCities.map((c) => (
              <button
                key={c}
                type="button"
                className="weather-sample"
                onClick={() => {
                  setLocation(c);
                  fetchWeatherForLocation(c);
                }}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="weather-error">{error}</p>}
        {isEmpty && (
          <div className="weather-empty-card">
            <h3>Plan ideas will appear here</h3>
            <p>Search a city to get weather-based travel recommendations and future forecast.</p>
          </div>
        )}

        {result && (
          <div className="weather-result">
            <div className="weather-result-header">
              <h3>
                {result.name}, {result.sys?.country}
              </h3>
              {result.weather?.[0]?.icon && (
                <img
                  alt={result.weather[0].description}
                  src={`https://openweathermap.org/img/wn/${result.weather[0].icon}@2x.png`}
                  className="weather-result-icon"
                />
              )}
            </div>

            <p className="temp">{Math.round(result.main?.temp || 0)}&deg;C</p>
            <p className="desc">{result.weather?.[0]?.description}</p>
            <div className="weather-details">
              <span>Humidity {result.main?.humidity}%</span>
              <span>Wind {result.wind?.speed} m/s</span>
            </div>

            <div className="weather-recommendation">
              <h4>{weatherRecommendation.title}</h4>
              <p>{weatherRecommendation.tip}</p>
            </div>

            <div className="weather-places">
              <h4>Recommended nearby places</h4>
              {placesLoading && <p>Loading nearby attractions…</p>}
              {placesError && <p className="weather-error">{placesError}</p>}
              {placesNotice && <p className="weather-note">{placesNotice}</p>}
              {!placesLoading && !placesError && placeSuggestions.length === 0 && (
                <p>No place suggestions available right now.</p>
              )}
              {!placesLoading && placeSuggestions.length > 0 && (
                <div className="weather-places-grid">
                  {placeSuggestions.map((place) => (
                    <article key={place.placeId || place.name} className="weather-place-item">
                      <h5 className="place-name">{place.name}</h5>
                      {place.rating != null && (
                        <p className="place-rating">⭐ {place.rating.toFixed(1)}</p>
                      )}
                      <p className="place-address">{place.address}</p>
                      <a
                        className="place-link"
                        href={buildPlaceMapLink(place)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View on map
                      </a>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {result && (
          <WeatherAISuggestions
            city={result.name || location}
            weather={result.weather?.[0]?.description || ""}
            temp={Math.round(result.main?.temp || 0)}
          />
        )}

        {result && todayForecast.length > 0 && (
          <section className="weather-forecast">
            <h3>Today's forecast</h3>
            <div className="weather-today-grid">
              {todayForecast.map((item) => (
                <article key={item.id} className="weather-forecast-item">
                  <p className="forecast-day">{item.time}</p>
                  {item.icon && (
                    <img
                      alt={item.description}
                      src={`https://openweathermap.org/img/wn/${item.icon}.png`}
                    />
                  )}
                  <p className="forecast-temp">{item.temp}&deg;C</p>
                  <p className="forecast-desc">{item.description}</p>
                </article>
              ))}
            </div>
          </section>
        )}

        {result && (
          <section className="weather-forecast">
            <h3>Future Weather (Next Days)</h3>
            {forecastLoading && <p>Loading future forecast...</p>}
            {!forecastLoading && forecastError && <p className="weather-error">{forecastError}</p>}
            {!forecastLoading && !forecastError && forecast.length === 0 && (
              <p>No forecast data available right now.</p>
            )}
            {!forecastLoading && forecast.length > 0 && (
              <div className="weather-forecast-grid">
                {forecast.map((item) => (
                  <article key={item.id} className="weather-forecast-item">
                    <p className="forecast-day">{item.day}</p>
                    {item.icon && (
                      <img
                        alt={item.description}
                        src={`https://openweathermap.org/img/wn/${item.icon}.png`}
                      />
                    )}
                    <p className="forecast-temp">{item.temp}&deg;C</p>
                    <p className="forecast-desc">{item.description}</p>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

export default Weather;
