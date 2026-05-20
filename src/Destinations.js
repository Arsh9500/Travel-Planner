import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { destinations } from "./data/destinations";
import Logo from "./components/Logo";
import { useAuth } from "./context/AuthContext";
import { loadUserWishlist, saveUserWishlist } from "./utils/wishlist";
import "./Destinations.css";

const REST_COUNTRIES_BASE_URL = "https://restcountries.com/v3.1";
const COUNTRIES_NOW_CITIES_URL = "https://countriesnow.space/api/v0.1/countries/cities";
const WIKIPEDIA_SUMMARY_BASE_URL = "https://en.wikipedia.org/api/rest_v1/page/summary";
const REGION_OPTIONS = ["All", "Africa", "Americas", "Asia", "Europe", "Oceania"];
const FILTER_ALL_OPTION = "All";

function fallbackImage(cityName, countryName) {
  return `https://source.unsplash.com/900x600/?${encodeURIComponent(
    `${cityName},${countryName},travel`
  )}`;
}

function getLiveWishlistKey(cityName, countryName) {
  return `${cityName}, ${countryName}`.toLowerCase();
}

async function resolveCityImage(cityName, countryName, signal) {
  const candidates = [`${cityName}, ${countryName}`, cityName];

  for (const title of candidates) {
    const response = await fetch(`${WIKIPEDIA_SUMMARY_BASE_URL}/${encodeURIComponent(title)}`, {
      signal,
      headers: { Accept: "application/json" },
    });

    if (!response.ok) continue;
    const payload = await response.json();
    if (payload?.thumbnail?.source) {
      return payload.thumbnail.source;
    }
  }

  return fallbackImage(cityName, countryName);
}

function Destinations() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [regionFilter, setRegionFilter] = useState("All");
  const [cityFilter, setCityFilter] = useState("");
  const [budgetFilter, setBudgetFilter] = useState(FILTER_ALL_OPTION);
  const [climateFilter, setClimateFilter] = useState(FILTER_ALL_OPTION);
  const [travelTypeFilter, setTravelTypeFilter] = useState(FILTER_ALL_OPTION);
  const [sortBy, setSortBy] = useState("a-z");
  const [liveCitiesLoading, setLiveCitiesLoading] = useState(false);
  const [liveCitiesStatus, setLiveCitiesStatus] = useState("");
  const [liveCities, setLiveCities] = useState([]);
  const [countrySuggestions, setCountrySuggestions] = useState([]);
  const [selectedCountryInfo, setSelectedCountryInfo] = useState(null);
  const [wishlist, setWishlist] = useState([]);

  const destinationMetaByCountry = useMemo(() => {
    const map = new Map();
    destinations.forEach((item) => {
      const key = item.country.toLowerCase();
      const current = map.get(key) || { budgetLevel: new Set(), climate: new Set(), travelType: new Set() };
      if (item.budgetLevel) current.budgetLevel.add(item.budgetLevel);
      if (item.climate) current.climate.add(item.climate);
      if (item.travelType) current.travelType.add(item.travelType);
      map.set(key, current);
    });
    return map;
  }, []);

  const budgetOptions = useMemo(
    () => [FILTER_ALL_OPTION, ...new Set([...destinations.map((item) => item.budgetLevel).filter(Boolean), "Unknown"])],
    []
  );
  const climateOptions = useMemo(
    () => [FILTER_ALL_OPTION, ...new Set([...destinations.map((item) => item.climate).filter(Boolean), "Unknown"])],
    []
  );
  const travelTypeOptions = useMemo(
    () => [FILTER_ALL_OPTION, ...new Set([...destinations.map((item) => item.travelType).filter(Boolean), "Unknown"])],
    []
  );
  const popularDestinations = useMemo(() => {
    return destinations.slice(0, 6);
  }, []);

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

  const fetchLiveCities = useCallback(async (rawQuery, signal) => {
    const q = rawQuery.trim();

    if (!q) {
      setLiveCities([]);
      setCountrySuggestions([]);
      setSelectedCountryInfo(null);
      setLiveCitiesLoading(false);
      return;
    }

    setLiveCitiesLoading(true);
    setLiveCitiesStatus("");

    try {
      const countryResponse = await fetch(
        `${REST_COUNTRIES_BASE_URL}/name/${encodeURIComponent(q)}?fields=name,region,subregion,cca2`,
        { signal }
      );

      if (!countryResponse.ok) {
        setLiveCities([]);
        setCountrySuggestions([]);
        setSelectedCountryInfo(null);
        setLiveCitiesStatus(`No country found for "${q}".`);
        return;
      }

      const countryPayload = await countryResponse.json();
      const countries = (Array.isArray(countryPayload)
        ? countryPayload
            .map((item) => ({
              name: item?.name?.common || "",
              region: item?.region || "Unknown",
              subregion: item?.subregion || "Unknown",
              code: item?.cca2 || "",
            }))
            .filter((item) => item.name)
        : [])
        .filter((item) => regionFilter === "All" || item.region === regionFilter)
        .slice(0, 8);

      setCountrySuggestions(countries);

      if (!countries.length) {
        setLiveCities([]);
        setSelectedCountryInfo(null);
        setLiveCitiesStatus(`No country found for "${q}" in ${regionFilter}.`);
        return;
      }

      const selectedCountry =
        countries.find((country) => country.name.toLowerCase() === q.toLowerCase()) ||
        countries.find((country) => country.name.toLowerCase().startsWith(q.toLowerCase())) ||
        countries[0];
      setSelectedCountryInfo(selectedCountry);

      const cityResponse = await fetch(COUNTRIES_NOW_CITIES_URL, {
        signal,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ country: selectedCountry.name }),
      });

      if (!cityResponse.ok) {
        throw new Error(`Cities API request failed (${cityResponse.status})`);
      }

      const cityPayload = await cityResponse.json();
      const cityNames = Array.isArray(cityPayload?.data) ? cityPayload.data : [];
      const cities = await Promise.all(
        cityNames.slice(0, 18).map(async (cityName) => ({
          id: `${selectedCountry.name}-${cityName}`,
          city: cityName,
          country: selectedCountry.name,
          region: selectedCountry.region,
          subregion: selectedCountry.subregion,
          image: await resolveCityImage(cityName, selectedCountry.name, signal).catch(() =>
            fallbackImage(cityName, selectedCountry.name)
          ),
        }))
      );

      setLiveCities(cities);
      if (!cities.length) {
        setLiveCitiesStatus(`No live destinations found for "${selectedCountry.name}".`);
      }
    } catch (error) {
      if (error.name === "AbortError") return;
      setLiveCities([]);
      setCountrySuggestions([]);
      setSelectedCountryInfo(null);
      setLiveCitiesStatus("Live destination search failed. Check internet/API availability.");
    } finally {
      if (!signal?.aborted) {
        setLiveCitiesLoading(false);
      }
    }
  }, [regionFilter]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetchLiveCities(searchTerm, controller.signal);
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchTerm, fetchLiveCities]);

  const visibleCities = useMemo(() => {
    const normalizedCityFilter = cityFilter.trim().toLowerCase();
    const withMeta = liveCities.map((item) => {
      const wishlistId = getLiveWishlistKey(item.city, item.country);
      const legacyWishlistId = `live:${wishlistId}`;
      const countryMeta = destinationMetaByCountry.get(item.country.toLowerCase());
      const budgetLevels = countryMeta?.budgetLevel?.size ? [...countryMeta.budgetLevel] : ["Unknown"];
      const climates = countryMeta?.climate?.size ? [...countryMeta.climate] : ["Unknown"];
      const travelTypes = countryMeta?.travelType?.size ? [...countryMeta.travelType] : ["Unknown"];
      return {
        ...item,
        wishlistId,
        legacyWishlistId,
        budgetLevels,
        climates,
        travelTypes,
        budgetLevel: budgetLevels[0],
        climate: climates[0],
        travelType: travelTypes[0],
      };
    });

    const filtered = withMeta.filter((item) => {
      const cityMatches = normalizedCityFilter ? item.city.toLowerCase().includes(normalizedCityFilter) : true;
      const budgetMatches = budgetFilter === FILTER_ALL_OPTION || item.budgetLevels.includes(budgetFilter);
      const climateMatches = climateFilter === FILTER_ALL_OPTION || item.climates.includes(climateFilter);
      const travelTypeMatches = travelTypeFilter === FILTER_ALL_OPTION || item.travelTypes.includes(travelTypeFilter);

      return cityMatches && budgetMatches && climateMatches && travelTypeMatches;
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === "z-a") return b.city.localeCompare(a.city);
      return a.city.localeCompare(b.city);
    });
  }, [liveCities, cityFilter, budgetFilter, climateFilter, travelTypeFilter, sortBy, destinationMetaByCountry]);

  const handleWishlist = (city) => {
    if (!user?.uid) return;
    setWishlist((prev) => {
      const hasNew = prev.includes(city.wishlistId);
      const hasLegacy = prev.includes(city.legacyWishlistId);
      const next =
        hasNew || hasLegacy
          ? prev.filter((item) => item !== city.wishlistId && item !== city.legacyWishlistId)
          : [...prev, city.wishlistId];

      saveUserWishlist(user.uid, next);
      return next;
    });
  };

  return (
    <div className="destinations-page">
      <header className="destinations-nav">
        <div className="destinations-nav-inner">
          <Logo className="dest-nav-logo" />
          <nav className="dest-nav-links">
            <Link to="/">Home</Link>
            <Link to="/destinations">Destinations</Link>
            <Link to="/attractions">Attractions</Link>
            <Link to="/planner">Planner</Link>
          </nav>
        </div>
      </header>

      <section className="destinations-list">
        <div className="destinations-hero">
          <h1>Explore Destinations</h1>
          <p>Search by country and refine by region, budget, climate, and travel type.</p>
        </div>

        <section className="search-panel">
          <div className="city-search-wrap">
            <label htmlFor="country-search">Country</label>
            <input
              id="country-search"
              type="text"
              placeholder="Type country name (e.g. Canada, Japan, New Zealand)"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />

            {searchTerm.trim().length >= 2 && (
              <div className="city-autocomplete" role="listbox" aria-label="Country suggestions">
                {liveCitiesLoading && <p className="city-autocomplete-status">Loading countries...</p>}
                {!liveCitiesLoading && countrySuggestions.length === 0 && (
                  <p className="city-autocomplete-status">No country suggestions yet.</p>
                )}
                {!liveCitiesLoading && countrySuggestions.length > 0 && (
                  <ul>
                    {countrySuggestions.map((country) => (
                      <li key={`${country.name}-${country.code}`}>
                        <button type="button" onClick={() => setSearchTerm(country.name)}>
                          <span>{country.name}</span>
                          <small>
                            {country.region}
                            {country.subregion !== "Unknown" ? ` - ${country.subregion}` : ""}
                          </small>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="filter-grid">
            <div className="filter-field">
              <label htmlFor="region-filter">Region</label>
              <select
                id="region-filter"
                value={regionFilter}
                onChange={(e) => setRegionFilter(e.target.value)}
              >
                {REGION_OPTIONS.map((region) => (
                  <option key={region} value={region}>
                    {region === "All" ? "All Regions" : region}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-field">
              <label htmlFor="city-filter">City Filter</label>
              <input
                id="city-filter"
                type="text"
                placeholder="Optional city keyword"
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
              />
            </div>

            <div className="filter-field">
              <label htmlFor="budget-filter">Budget</label>
              <select id="budget-filter" value={budgetFilter} onChange={(e) => setBudgetFilter(e.target.value)}>
                {budgetOptions.map((budget) => (
                  <option key={budget} value={budget}>
                    {budget === FILTER_ALL_OPTION ? "All Budgets" : budget}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-field">
              <label htmlFor="climate-filter">Climate</label>
              <select id="climate-filter" value={climateFilter} onChange={(e) => setClimateFilter(e.target.value)}>
                {climateOptions.map((climate) => (
                  <option key={climate} value={climate}>
                    {climate === FILTER_ALL_OPTION ? "All Climates" : climate}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-field">
              <label htmlFor="travel-type-filter">Travel Type</label>
              <select
                id="travel-type-filter"
                value={travelTypeFilter}
                onChange={(e) => setTravelTypeFilter(e.target.value)}
              >
                {travelTypeOptions.map((travelType) => (
                  <option key={travelType} value={travelType}>
                    {travelType === FILTER_ALL_OPTION ? "All Travel Types" : travelType}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-field">
              <label htmlFor="sort-filter">Sort</label>
              <select id="sort-filter" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="a-z">City Name (A-Z)</option>
                <option value="z-a">City Name (Z-A)</option>
              </select>
            </div>
          </div>
        </section>

        {searchTerm.trim() === "" && (
          <section className="popular-section">
            <div className="popular-section-head">
              <h2>Popular Recommendations</h2>
              <p>Start with quick picks before searching by country.</p>
            </div>
            <div className="destinations-grid">
              {popularDestinations.map((item) => (
                <article key={`popular-${item.id}`} className="dest-card popular-card">
                  <div className="dest-card-image" style={{ backgroundImage: `url(${item.image})` }} />
                  <div className="dest-card-body">
                    <h3>
                      {item.city}, {item.country}
                    </h3>
                    <p className="city-source">
                      {item.budgetLevel} budget | {item.climate} climate | {item.travelType}
                    </p>
                    <p className="city-tags">{item.description}</p>
                    <div className="live-card-actions">
                      <Link className="dest-view-link" to={`/destinations/${item.id}`}>
                        View Details
                      </Link>
                      <button type="button" onClick={() => setSearchTerm(item.country)}>
                        Explore Country
                      </button>
                      <button type="button" onClick={() => navigate("/planner", { state: { add: `${item.city}, ${item.country}` } })}>
                        Plan Itinerary
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {liveCitiesStatus && <p className="search-status">{liveCitiesStatus}</p>}

        {searchTerm.trim() !== "" && selectedCountryInfo && (
          <div className="active-summary">
            <p>
              Live destinations for <strong>{selectedCountryInfo.name}</strong>
            </p>
            <span>{selectedCountryInfo.region}</span>
            {selectedCountryInfo.subregion !== "Unknown" && <span>{selectedCountryInfo.subregion}</span>}
            <span>{visibleCities.length} cities</span>
          </div>
        )}

        {visibleCities.length > 0 && (
          <section className="live-cities-section">
            <h2>Live Destinations</h2>
            <div className="destinations-grid">
              {visibleCities.map((city) => (
                <article key={city.id} className="dest-card live-city-card">
                  <div
                    className="dest-card-image"
                    style={{ backgroundImage: `url(${city.image || fallbackImage(city.city, city.country)})` }}
                  />
                  <div className="dest-card-body">
                    <h3>
                      {city.city}, {city.country}
                    </h3>
                    <p className="city-source">
                      {city.region}
                      {city.subregion && city.subregion !== "Unknown" ? ` | ${city.subregion}` : ""}
                    </p>
                    <p className="city-tags">
                      {city.budgetLevels.join("/")} budget | {city.climates.join("/")} climate | {city.travelTypes.join("/")}
                    </p>
                    <div className="live-card-actions">
                      <a
                        className="dest-view-link"
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                          `${city.city}, ${city.country}`
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View Details
                      </a>
                      <button
                        type="button"
                        onClick={() => navigate("/planner", { state: { add: `${city.city}, ${city.country}` } })}
                      >
                        Plan Itinerary
                      </button>
                      <button
                        type="button"
                        className={
                          wishlist.includes(city.wishlistId) || wishlist.includes(city.legacyWishlistId)
                            ? "wishlist-btn is-saved"
                            : "wishlist-btn"
                        }
                        onClick={() => handleWishlist(city)}
                      >
                        {wishlist.includes(city.wishlistId) || wishlist.includes(city.legacyWishlistId)
                          ? "Saved Wishlist"
                          : "Save Wishlist"}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
        {!liveCitiesLoading && searchTerm.trim() && liveCities.length === 0 && !liveCitiesStatus && (
          <p className="no-results">No live destinations found.</p>
        )}
      </section>

      <footer className="destinations-footer">
        <div className="destinations-footer-inner">
          <p>TripPlan Live Explorer</p>
          <p>Discover cities by country, filter by region, and plan your itinerary in one flow.</p>
        </div>
      </footer>
    </div>
  );
}

export default Destinations;
