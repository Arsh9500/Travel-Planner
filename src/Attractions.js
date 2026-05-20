import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Logo from "./components/Logo";
import { useAuth } from "./context/AuthContext";
import { attractionCategories, attractions } from "./data/attractions";
import { loadAttractionFavorites, saveAttractionFavorites } from "./utils/attractionFavorites";
import "./Attractions.css";

function Attractions() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [category, setCategory] = useState("All");
  const [favorites, setFavorites] = useState([]);
  const [selectedId, setSelectedId] = useState(attractions[0]?.id || "");

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

  const selectedAttraction = useMemo(() => {
    return (
      attractions.find((item) => item.id === selectedId) ||
      visibleAttractions[0] ||
      attractions[0]
    );
  }, [selectedId, visibleAttractions]);

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

  return (
    <div className="attractions-page">
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
            <strong>{visibleAttractions.length}</strong>
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
            {visibleAttractions.map((item) => {
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
                      <button
                        type="button"
                        className={isSaved ? "favorite-button is-saved" : "favorite-button"}
                        onClick={() => toggleFavorite(item.id)}
                      >
                        {isSaved ? "Saved" : "Save"}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}

            {visibleAttractions.length === 0 && (
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
                  <strong>{selectedAttraction.rating.toFixed(1)} / 5</strong>
                  <span>{selectedAttraction.reviewCount.toLocaleString()} reviews</span>
                </div>

                <div className="highlight-list">
                  {selectedAttraction.highlights.map((highlight) => (
                    <span key={highlight}>{highlight}</span>
                  ))}
                </div>

                <section className="review-panel">
                  <h3>Reviews</h3>
                  {selectedAttraction.reviews.map((review) => (
                    <blockquote key={review}>{review}</blockquote>
                  ))}
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
