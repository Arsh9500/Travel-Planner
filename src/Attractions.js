import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Logo from "./components/Logo";
import { useAuth } from "./context/AuthContext";
import { useItinerary } from "./context/ItineraryContext";
import { attractionCategories, attractions } from "./data/attractions";
import { destinations } from "./data/destinations";
import { buildPlaceMapLink, requestPlacesReply } from "./services/placesService";
import { loadAttractionFavorites, saveAttractionFavorites } from "./utils/attractionFavorites";
import "./Attractions.css";

const DEFAULT_ATTRACTION_IMAGE =
  "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=1000&auto=format&fit=crop";

const TRAVEL_API_BASE_URL = process.env.REACT_APP_TRAVEL_API_BASE_URL || "http://127.0.0.1:5000";

function getFriendlyFetchError(error) {
  if (error?.message === "Failed to fetch") {
    return "Backend is not reachable. Start the Flask API on http://127.0.0.1:5000 and make sure Ollama is running.";
  }
  return error?.message || "Live recommendations are unavailable right now.";
}

function normalizeLivePlace(place) {
  return {
    id: `live-${place.placeId || place.name}-${place.address}`,
    source: "google",
    placeId: place.placeId,
    name: place.name || "Google place",
    location: place.address || "Address unavailable",
    category: "Live Google",
    rating: Number(place.rating) || 0,
    reviewCount: 0,
    image: place.photoUrl || DEFAULT_ATTRACTION_IMAGE,
    description: "Live result from Google Places. Open the map or add it to your trip plan.",
    highlights: ["Google Maps", "Live place result", "Trip planning"],
    reviews: [],
    mapQuery: [place.name, place.address].filter(Boolean).join(" "),
    mapsUrl: buildPlaceMapLink(place),
  };
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function buildDestinationAttractions(query, category) {
  if (!query) return [];

  return destinations.flatMap((destination) => {
    const destinationText = [
      destination.name,
      destination.city,
      destination.country,
      destination.travelType,
      ...destination.attractions,
    ]
      .join(" ")
      .toLowerCase();
    const matchesDestination = destinationText.includes(query);
    const matchesCategory = category === "All" || destination.travelType === category;

    if (!matchesDestination || !matchesCategory) return [];

    return destination.attractions.map((name) => ({
      id: `destination-${destination.id}-${slugify(name)}`,
      source: "destination",
      name,
      location: `${destination.city}, ${destination.country}`,
      category: destination.travelType,
      rating: 4.6,
      reviewCount: 0,
      image: destination.image || DEFAULT_ATTRACTION_IMAGE,
      description: `${name} is a popular ${destination.name} highlight for ${destination.travelType.toLowerCase()} travel.`,
      highlights: [destination.name, destination.travelType, destination.country],
      reviews: [],
      mapQuery: `${name} ${destination.city} ${destination.country}`,
      mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${name} ${destination.city} ${destination.country}`
      )}`,
    }));
  });
}

function Attractions() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { setItineraryDestination } = useItinerary();
  const [searchTerm, setSearchTerm] = useState("");
  const [category, setCategory] = useState("All");
  const [favorites, setFavorites] = useState([]);
  const [selectedId, setSelectedId] = useState(attractions[0]?.id || "");
  const [liveAttractions, setLiveAttractions] = useState([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState("");
  const [searchRecommendations, setSearchRecommendations] = useState([]);
  const [searchRecommendationPlaces, setSearchRecommendationPlaces] = useState([]);
  const [searchRecommendationLoading, setSearchRecommendationLoading] = useState(false);
  const [searchRecommendationError, setSearchRecommendationError] = useState("");
  const [showSearchPopup, setShowSearchPopup] = useState(false);
  const dismissedSearchQueryRef = useRef("");

  useEffect(() => {
    let ignore = false;

    const syncFavorites = async () => {
      const list = await loadAttractionFavorites(user?.uid);
      if (!ignore) setFavorites(list);
    };

    syncFavorites();
    return () => {
      ignore = true;
    };
  }, [user?.uid]);

  const visibleAttractions = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return attractions.filter((item) => {
      const matchesSearch =
        !query ||
        item.name.toLowerCase().includes(query) ||
        item.location.toLowerCase().includes(query);
      const matchesCategory = category === "All" || item.category === category;
      return matchesSearch && matchesCategory;
    });
  }, [searchTerm, category]);

  const destinationAttractions = useMemo(() => {
    return buildDestinationAttractions(searchTerm.trim().toLowerCase(), category);
  }, [category, searchTerm]);

  useEffect(() => {
    const query = searchTerm.trim();
    if (query.length < 2) {
      setLiveAttractions([]);
      setLiveError("");
      setLiveLoading(false);
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      setLiveLoading(true);
      setLiveError("");

      try {
        const data = await requestPlacesReply({
          message: query,
          searchType: "attractions",
        });
        if (cancelled) return;
        const places = (data.places || []).map(normalizeLivePlace);
        setLiveAttractions(places);
        if (places.length > 0 && !visibleAttractions.some((item) => item.id === selectedId)) {
          setSelectedId(places[0].id);
        }
      } catch (error) {
        if (!cancelled) {
          setLiveAttractions([]);
          setLiveError(getFriendlyFetchError(error));
        }
      } finally {
        if (!cancelled) setLiveLoading(false);
      }
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [searchTerm, selectedId, visibleAttractions]);

  useEffect(() => {
    const query = searchTerm.trim();
    if (query.length < 2) {
      setSearchRecommendations([]);
      setSearchRecommendationPlaces([]);
      setSearchRecommendationError("");
      setSearchRecommendationLoading(false);
      setShowSearchPopup(false);
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      setSearchRecommendationLoading(true);
      setSearchRecommendationError("");

      try {
        const response = await fetch(`${TRAVEL_API_BASE_URL}/recommend-attractions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            destination: query,
            preferences: {
              source: "Attractions page search",
              category: category === "All" ? "" : category,
              intent: "Show live event and attraction ideas for this searched place.",
            },
          }),
        });

        const data = await response.json().catch(() => ({}));
        if (cancelled) return;

        if (response.ok) {
          const recommendations = data.attractions || [];
          const livePlaces = data.livePlaces || [];
          setSearchRecommendations(recommendations);
          setSearchRecommendationPlaces(livePlaces);
          if (
            (recommendations.length > 0 || livePlaces.length > 0) &&
            dismissedSearchQueryRef.current !== query
          ) {
            setShowSearchPopup(true);
          }
        } else {
          setSearchRecommendations([]);
          setSearchRecommendationPlaces([]);
          setSearchRecommendationError(data.error || "Unable to load live event recommendations.");
          setShowSearchPopup(false);
        }
      } catch (error) {
        if (!cancelled) {
          setSearchRecommendations([]);
          setSearchRecommendationPlaces([]);
          setSearchRecommendationError(getFriendlyFetchError(error));
          setShowSearchPopup(false);
          console.warn("Search recommendations unavailable:", error);
        }
      } finally {
        if (!cancelled) setSearchRecommendationLoading(false);
      }
    }, 900);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [category, searchTerm]);

  const combinedAttractions = useMemo(() => {
    const seenNames = new Set();
    const localAndDestinationAttractions = [...visibleAttractions, ...destinationAttractions].filter((item) => {
      const nameKey = item.name.toLowerCase();
      if (seenNames.has(nameKey)) return false;
      seenNames.add(nameKey);
      return true;
    });
    if (category !== "All") return localAndDestinationAttractions;

    const localNames = new Set(
      localAndDestinationAttractions.map((item) => item.name.toLowerCase())
    );
    const uniqueLiveAttractions = liveAttractions.filter(
      (item) => !localNames.has(item.name.toLowerCase())
    );
    return [...localAndDestinationAttractions, ...uniqueLiveAttractions];
  }, [category, destinationAttractions, liveAttractions, visibleAttractions]);

  const selectedAttraction = useMemo(() => {
    return combinedAttractions.find((item) => item.id === selectedId) || combinedAttractions[0] || null;
  }, [combinedAttractions, selectedId]);

  const toggleFavorite = (attractionId) => {
    if (!user?.uid) {
      navigate("/register", { state: { from: "/attractions" } });
      return;
    }

    setFavorites((prev) => {
      const next = prev.includes(attractionId)
        ? prev.filter((item) => item !== attractionId)
        : [...prev, attractionId];
      saveAttractionFavorites(user.uid, next);
      return next;
    });
  };

  const savedAttractions = attractions.filter((item) => favorites.includes(item.id));

  const planItinerary = (attraction) => {
    const destination = attraction.location || attraction.name;
    setItineraryDestination(destination);
    navigate("/planner", {
      state: {
        add: destination,
        attraction: {
          name: attraction.name,
          placeId: attraction.placeId || "",
          mapsUrl: attraction.mapsUrl || "",
        },
      },
    });
  };

  const closeSearchPopup = () => {
    dismissedSearchQueryRef.current = searchTerm.trim();
    setShowSearchPopup(false);
  };

  return (
    <div className="attractions-page">
      {showSearchPopup && (
        <div className="attraction-popup-backdrop" role="presentation">
          <section className="attraction-search-popup" role="dialog" aria-modal="true">
            <div className="attraction-popup-header">
              <h2>Live Event and Attraction Ideas in {searchTerm.trim()}</h2>
              <button type="button" onClick={closeSearchPopup} aria-label="Close attraction recommendations">
                x
              </button>
            </div>

            {searchRecommendationLoading && (
              <p className="attractions-empty">Finding live map context and asking Ollama...</p>
            )}

            {!searchRecommendationLoading && searchRecommendationError && (
              <p className="attractions-empty">{searchRecommendationError}</p>
            )}

            {!searchRecommendationLoading && !searchRecommendationError && (
              <div className="attraction-popup-list">
                {searchRecommendations.map((attraction, index) => (
                  <article key={`${attraction.name}-${index}`} className="attraction-popup-item">
                    <h3>{attraction.name}</h3>
                    {attraction.reason && <p>{attraction.reason}</p>}
                  </article>
                ))}
              </div>
            )}

            {!searchRecommendationLoading && searchRecommendationPlaces.length > 0 && (
              <section className="attraction-popup-maps" aria-label="Google Maps live places">
                <h3>Google Maps matches</h3>
                {searchRecommendationPlaces.map((place) => (
                  <a
                    key={place.placeId || `${place.name}-${place.address}`}
                    href={place.mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {place.name}
                  </a>
                ))}
              </section>
            )}
          </section>
        </div>
      )}

      <header className="attractions-nav">
        <div className="attractions-nav-inner">
          <Logo className="attractions-logo" />
          <nav className="attractions-nav-links">
            <Link to="/">Home</Link>
            <Link to="/destinations">Destinations</Link>
            <Link to="/attractions">Attractions</Link>
            <Link to="/planner">Planner</Link>
          </nav>
        </div>
      </header>

      <main className="attractions-main">
        <section className="attractions-heading">
          <div>
            <p className="attractions-eyebrow">Popular places to visit</p>
            <h1>Attractions</h1>
            <p>
              Browse popular beaches, city icons, nature spots, landmarks, ratings,
              reviews, and maps in one place.
            </p>
          </div>
          <div className="attractions-count">
            <strong>{combinedAttractions.length}</strong>
            <span>matching places</span>
          </div>
        </section>

        <section className="attractions-tools" aria-label="Attraction search and filters">
          <label htmlFor="attraction-search">
            Search by name or location
            <input
              id="attraction-search"
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Try Kyoto, beach, Paris, Singapore"
            />
          </label>

          <label htmlFor="attraction-category">
            Category
            <select
              id="attraction-category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              {attractionCategories.map((item) => (
                <option key={item} value={item}>
                  {item === "All" ? "All categories" : item}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="attractions-layout">
          <div className="attractions-list" aria-label="Popular attractions">
            {liveLoading && (
              <p className="attractions-empty">Searching Google Places for live attraction results...</p>
            )}

            {liveError && <p className="attractions-empty">{liveError}</p>}

            {combinedAttractions.map((item) => {
              const isSaved = favorites.includes(item.id);
              return (
                <article
                  key={item.id}
                  className={selectedAttraction?.id === item.id ? "attraction-card is-active" : "attraction-card"}
                >
                  <button
                    type="button"
                    className="attraction-image-button"
                    onClick={() => setSelectedId(item.id)}
                    aria-label={`View details for ${item.name}`}
                  >
                    <img src={item.image} alt={item.name} />
                  </button>
                  <div className="attraction-card-body">
                    <div className="attraction-card-title">
                      <div>
                        <p>{item.category}</p>
                        <h2>{item.name}</h2>
                      </div>
                      <span>{item.rating.toFixed(1)}</span>
                    </div>
                    <p className="attraction-location">{item.location}</p>
                    <p className="attraction-description">{item.description}</p>
                    <div className="attraction-card-actions">
                      <button type="button" onClick={() => setSelectedId(item.id)}>
                        View details
                      </button>
                      <button type="button" onClick={() => planItinerary(item)}>
                        Plan itinerary
                      </button>
                      {!item.source && (
                        <button
                          type="button"
                          className={isSaved ? "favorite-button is-saved" : "favorite-button"}
                          onClick={() => toggleFavorite(item.id)}
                        >
                          {isSaved ? "Saved" : "Save"}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}

            {!liveLoading && combinedAttractions.length === 0 && (
              <p className="attractions-empty">No attractions match your search yet.</p>
            )}
          </div>

          {selectedAttraction && (
            <aside className="attraction-detail" aria-label="Attraction details">
              <img src={selectedAttraction.image} alt={selectedAttraction.name} />
              <div className="attraction-detail-body">
                <p className="attractions-eyebrow">{selectedAttraction.category}</p>
                <h2>{selectedAttraction.name}</h2>
                <p className="attraction-location">{selectedAttraction.location}</p>
                <p>{selectedAttraction.description}</p>

                <div className="rating-row">
                  <strong>
                    {selectedAttraction.rating ? `${selectedAttraction.rating.toFixed(1)} / 5` : "Live place"}
                  </strong>
                  <span>
                    {selectedAttraction.reviewCount
                      ? `${selectedAttraction.reviewCount.toLocaleString()} reviews`
                      : selectedAttraction.source === "google"
                        ? "Google Maps result"
                        : "Local travel guide"}
                  </span>
                </div>

                <div className="highlight-list">
                  {selectedAttraction.highlights.map((highlight) => (
                    <span key={highlight}>{highlight}</span>
                  ))}
                </div>

                <section className="review-panel">
                  <h3>Reviews</h3>
                  {selectedAttraction.reviews.length > 0 ? selectedAttraction.reviews.map((review) => (
                    <blockquote key={review}>{review}</blockquote>
                  )) : <blockquote>Use this result as a starting point for itinerary planning.</blockquote>}
                </section>

                <section className="map-panel">
                  <h3>Location Map</h3>
                  <iframe
                    title={`${selectedAttraction.name} map`}
                    src={`https://www.google.com/maps?q=${encodeURIComponent(
                      selectedAttraction.mapQuery
                    )}&output=embed`}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                  <div className="map-actions">
                    <a
                      href={selectedAttraction.mapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedAttraction.mapQuery)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open in Google Maps
                    </a>
                    <button type="button" onClick={() => planItinerary(selectedAttraction)}>
                      Plan itinerary
                    </button>
                  </div>
                </section>
              </div>
            </aside>
          )}
        </section>

        {savedAttractions.length > 0 && (
          <section className="saved-attractions">
            <h2>Saved Favorites</h2>
            <div>
              {savedAttractions.map((item) => (
                <button key={item.id} type="button" onClick={() => setSelectedId(item.id)}>
                  {item.name}
                </button>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default Attractions;
