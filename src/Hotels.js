import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { destinations } from "./data/destinations";
import Logo from "./components/Logo";
import { useAuth } from "./context/AuthContext";
import { useItinerary } from "./context/ItineraryContext";
import {
  confirmCryptoPayment,
  connectCryptoWallet,
  estimateEthAmount,
  getCryptoPaymentConfig,
  isWalletAvailable,
  sendCryptoPayment,
} from "./services/cryptoPaymentService";
import { processBookingPayment } from "./services/paymentService";
import { saveUserHotelBooking } from "./utils/bookings";
import {
  isBookingEmailConfigured,
  sendBookingConfirmationEmail,
} from "./utils/email";
import { loadUserWishlist, saveUserWishlist } from "./utils/wishlist";
import "./Destinations.css";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const GEOAPIFY_AUTOCOMPLETE_URL = "https://api.geoapify.com/v1/geocode/autocomplete";
const GOOGLE_MAPS_API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || "";
const WIKIPEDIA_SUMMARY_BASE_URL = "https://en.wikipedia.org/api/rest_v1/page/summary";
const FILTER_ALL_OPTION = "All";
const DEFAULT_HOTEL_TYPES = ["Hotel", "Guest House", "Hostel", "Apartment", "Motel"];
const DEFAULT_STAR_OPTIONS = ["Unrated", "3 Star", "4 Star", "5 Star"];
const DEFAULT_AMENITIES = ["Wi-Fi", "Parking", "Pool", "Breakfast", "Accessible", "Air Conditioning", "General"];
const CRYPTO_PAYMENT_METHOD = "Blockchain/Crypto";
const PAYMENT_METHODS = ["Credit Card", "Debit Card", "Pay at Hotel", CRYPTO_PAYMENT_METHOD];
const BOOKING_CHATBOT_NOTICE_KEY = "hotel_booking_chatbot_notice";
const COUNTRY_CITY_SEEDS = {
  australia: ["Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide", "Gold Coast"],
  japan: ["Tokyo", "Osaka", "Kyoto", "Sapporo", "Fukuoka"],
  france: ["Paris", "Lyon", "Nice", "Marseille", "Bordeaux"],
  italy: ["Rome", "Milan", "Venice", "Florence", "Naples"],
  usa: ["New York", "Los Angeles", "Chicago", "Miami", "Las Vegas"],
  "united states": ["New York", "Los Angeles", "Chicago", "Miami", "Las Vegas"],
  canada: ["Toronto", "Vancouver", "Montreal", "Calgary", "Ottawa"],
  "new zealand": ["Auckland", "Wellington", "Queenstown", "Christchurch", "Rotorua"],
};

function fallbackImage(hotelName, locationName) {
  return `https://source.unsplash.com/900x600/?${encodeURIComponent(
    `${hotelName || "hotel"},${locationName || "travel stay"}`
  )}`;
}

function getHotelWishlistKey(hotel) {
  return `hotel:${hotel.osmType}:${hotel.osmId}`.toLowerCase();
}

function getHotelType(tags) {
  if (tags.tourism === "guest_house") return "Guest House";
  if (tags.tourism === "hostel") return "Hostel";
  if (tags.tourism === "motel") return "Motel";
  if (tags.tourism === "apartment") return "Apartment";
  if (tags.building === "hotel") return "Hotel";
  return "Hotel";
}

function getHotelStars(tags) {
  const rawStars = String(tags.stars || tags["hotel:stars"] || tags.hotel_class || "").trim();
  const normalizedStars = rawStars.replace(/[^0-9]/g, "");
  if (!normalizedStars) return "Unrated";
  const count = Number(normalizedStars);
  return Number.isFinite(count) && count > 0 ? `${count} Star` : "Unrated";
}

function getHotelAmenity(tags) {
  if (tags.swimming_pool === "yes" || tags.pool === "yes") return "Pool";
  if (tags.breakfast === "yes") return "Breakfast";
  if (tags.internet_access === "wlan" || tags.wifi === "yes") return "Wi-Fi";
  if (tags.parking === "yes") return "Parking";
  if (tags["wheelchair"] === "yes") return "Accessible";
  if (tags["air_conditioning"] === "yes") return "Air Conditioning";
  return "General";
}

function getNightlyRate(hotel) {
  const starValue = Number.parseInt(String(hotel.stars || "").replace(/[^0-9]/g, ""), 10) || 3;
  const amenityBoost = {
    "Pool": 40,
    "Breakfast": 18,
    "Wi-Fi": 10,
    "Parking": 8,
    "Accessible": 12,
    "Air Conditioning": 15,
    "General": 0,
  };
  const typeBoost = {
    "Hotel": 30,
    "Guest House": 5,
    "Hostel": -20,
    "Apartment": 18,
    "Motel": -8,
  };

  const baseRate = 65 + starValue * 28;
  return Math.max(55, baseRate + (amenityBoost[hotel.amenity] || 0) + (typeBoost[hotel.type] || 0));
}

function getStayNights(checkInDate, checkOutDate) {
  if (!checkInDate || !checkOutDate) return 0;

  const start = new Date(checkInDate);
  const end = new Date(checkOutDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;

  const diff = end.getTime() - start.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(amount) || 0);
}

function normalizeCardNumber(value) {
  return value.replace(/\D/g, "").slice(0, 19);
}

function formatCardNumber(value) {
  return normalizeCardNumber(value).replace(/(.{4})/g, "$1 ").trim();
}

function normalizeExpiry(value) {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function isValidExpiry(value) {
  const match = value.match(/^(\d{2})\/(\d{2}|\d{4})$/);
  if (!match) return false;

  const month = Number(match[1]);
  const year = Number(match[2].length === 2 ? `20${match[2]}` : match[2]);
  if (month < 1 || month > 12) return false;

  const expiry = new Date(year, month, 0, 23, 59, 59, 999);
  return expiry.getTime() >= Date.now();
}

function buildReceiptText(booking) {
  if (!booking) return "";

  return [
    "Hotel Booking Receipt",
    `Booking ID: ${booking.bookingId}`,
    `Booking Reference: ${booking.bookingReference}`,
    `Hotel Name: ${booking.hotelName}`,
    `Destination: ${booking.destination}`,
    `Check-in Date: ${booking.checkInDate}`,
    `Check-out Date: ${booking.checkOutDate}`,
    `Guests: ${booking.guests}`,
    `Amount Paid: ${formatCurrency(booking.totalPrice)}`,
    `Payment Method: ${booking.paymentMethod}`,
    `Payment Status: ${booking.paymentStatus}`,
    `Booking Status: ${booking.bookingStatus}`,
  ].join("\n");
}

function buildFallbackHotelsFromCities(countryName, cities, region = "Unknown") {
  const amenityCycle = ["Wi-Fi", "Parking", "Pool", "Breakfast", "Accessible", "Air Conditioning"];
  const typeCycle = ["Hotel", "Guest House", "Apartment", "Hostel", "Motel"];
  const starCycle = ["3 Star", "4 Star", "5 Star", "Unrated"];

  return cities.flatMap((city, cityIndex) =>
    Array.from({ length: 4 }, (_, hotelIndex) => {
      const optionIndex = cityIndex + hotelIndex;
      const hotelType = typeCycle[optionIndex % typeCycle.length];
      return {
        id: `fallback-${countryName}-${city}-${hotelIndex}`,
        osmId: `fallback-${countryName}-${city}-${hotelIndex}`,
        osmType: "fallback",
        name: `${city} ${["Central", "Harbour", "Grand", "Suites"][hotelIndex]} ${hotelType}`,
        city,
        region,
        country: countryName,
        lat: 0,
        lon: 0,
        type: hotelType,
        stars: starCycle[optionIndex % starCycle.length],
        amenity: amenityCycle[optionIndex % amenityCycle.length],
        address: `${city}, ${countryName}`,
        image: fallbackImage(`${city} ${hotelType}`, `${city}, ${countryName}`),
        source: "fallback",
      };
    })
  );
}

function fallbackHotelsForQuery(query) {
  const normalizedQuery = query.trim().toLowerCase();
  const seededCities = COUNTRY_CITY_SEEDS[normalizedQuery];
  if (seededCities?.length) {
    const countryName = query.trim();
    return buildFallbackHotelsFromCities(countryName, seededCities);
  }

  const source = destinations.filter((item) => {
    if (!normalizedQuery) return true;
    return (
      item.city.toLowerCase().includes(normalizedQuery) ||
      item.country.toLowerCase().includes(normalizedQuery) ||
      (item.region || "").toLowerCase().includes(normalizedQuery)
    );
  });

  if (!source.length) return [];

  const groupedByCountry = new Map();
  source.forEach((item) => {
    const key = item.country;
    if (!groupedByCountry.has(key)) groupedByCountry.set(key, []);
    groupedByCountry.get(key).push(item.city);
  });

  return [...groupedByCountry.entries()].flatMap(([country, cities]) =>
    buildFallbackHotelsFromCities(country, [...new Set(cities)].slice(0, 6))
  );
}

function getHotelAddress(tags, fallbackLocation) {
  const parts = [
    tags["addr:housenumber"],
    tags["addr:street"],
    tags["addr:city"] || tags["addr:town"] || tags["addr:village"],
    tags["addr:country"],
  ].filter(Boolean);

  return parts.length ? parts.join(", ") : fallbackLocation;
}

async function resolveHotelImage(hotelName, locationName, signal) {
  const candidates = [hotelName, `${hotelName} ${locationName}`, locationName].filter(Boolean);

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

  return fallbackImage(hotelName, locationName);
}

function Hotels() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { itineraryDestination, setItineraryDestination } = useItinerary();
  const [searchTerm, setSearchTerm] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [hotelTypeFilter, setHotelTypeFilter] = useState(FILTER_ALL_OPTION);
  const [starFilter, setStarFilter] = useState(FILTER_ALL_OPTION);
  const [amenityFilter, setAmenityFilter] = useState(FILTER_ALL_OPTION);
  const [sortBy, setSortBy] = useState("a-z");
  const [liveHotelsLoading, setLiveHotelsLoading] = useState(false);
  const [liveHotelsStatus, setLiveHotelsStatus] = useState("");
  const [liveHotels, setLiveHotels] = useState([]);
  const [locationSuggestions, setLocationSuggestions] = useState([]);
  const [selectedLocationInfo, setSelectedLocationInfo] = useState(null);
  const [selectedCityGroup, setSelectedCityGroup] = useState(FILTER_ALL_OPTION);
  const [wishlist, setWishlist] = useState([]);
  const [selectedHotel, setSelectedHotel] = useState(null);
  const [bookingForm, setBookingForm] = useState({
    checkInDate: "",
    checkOutDate: "",
    guests: "1",
  });
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0]);
  const [paymentForm, setPaymentForm] = useState({
    cardholderName: "",
    cardNumber: "",
    expiryDate: "",
    cvv: "",
  });
  const [bookingErrors, setBookingErrors] = useState({});
  const [paymentErrors, setPaymentErrors] = useState({});
  const [paymentStatus, setPaymentStatus] = useState("");
  const [mailStatus, setMailStatus] = useState("");
  const [paymentSuccess, setPaymentSuccess] = useState(null);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [walletInfo, setWalletInfo] = useState({ address: "", chainId: "" });
  const [walletStatus, setWalletStatus] = useState("");
  const [hasAppliedAutoDestination, setHasAppliedAutoDestination] = useState(false);

  const routeDestination = (location.state?.destination || "").trim();

  const featuredSearches = useMemo(() => destinations.slice(0, 6), []);

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

  useEffect(() => {
    // Auto-load hotels from itinerary destination once when user lands on this page.
    if (hasAppliedAutoDestination) return;
    const nextDestination = routeDestination || itineraryDestination;
    if (!nextDestination) return;

    setSearchTerm(nextDestination);
    setHasAppliedAutoDestination(true);
  }, [hasAppliedAutoDestination, itineraryDestination, routeDestination]);

  const fetchLiveHotels = useCallback(async (rawQuery, signal) => {
    const q = rawQuery.trim();

    if (!q) {
      setLiveHotels([]);
      setLocationSuggestions([]);
      setSelectedLocationInfo(null);
      setSelectedCityGroup(FILTER_ALL_OPTION);
      setLiveHotelsLoading(false);
      return;
    }

    setLiveHotelsLoading(true);
    setLiveHotelsStatus("");
    setSelectedCityGroup(FILTER_ALL_OPTION);

    try {
      const locationResponse = await fetch(
        `${GEOAPIFY_AUTOCOMPLETE_URL}?text=${encodeURIComponent(q)}&apiKey=${process.env.REACT_APP_GEOAPIFY_API_KEY}`,
        {
          signal,
          headers: {
            Accept: "application/json",
          },
        }
      );

      if (!locationResponse.ok) {
        setLiveHotels([]);
        setLocationSuggestions([]);
        setSelectedLocationInfo(null);
        setLiveHotelsStatus(`No location found for "${q}".`);
        return;
      }

      const locationPayload = await locationResponse.json();
      const locations = (Array.isArray(locationPayload?.features) ? locationPayload.features : [])
        .map((item) => ({
          id: item.properties?.place_id || item.properties?.osm_id,
          locationType: item.properties?.result_type || "place",
          name: item.properties?.city || item.properties?.county || item.properties?.country || q,
          region: item.properties?.state || item.properties?.region || "Unknown",
          country: item.properties?.country || "Unknown",
          lat: Number(item.properties?.lat),
          lon: Number(item.properties?.lon),
          displayName: item.properties?.formatted || q,
        }))
        .filter((item) => item.name && Number.isFinite(item.lat) && Number.isFinite(item.lon))
        .slice(0, 8);

      setLocationSuggestions(locations);

      if (!locations.length) {
        const fallbackHotels = fallbackHotelsForQuery(q);
        setLiveHotels(fallbackHotels);
        setSelectedLocationInfo(null);
        setLiveHotelsStatus(
          fallbackHotels.length
            ? `Live hotel API returned no location for "${q}". Showing fallback hotel data instead.`
            : `No location found for "${q}".`
        );
        return;
      }

      const selectedLocation =
        locations.find((item) => item.name.toLowerCase() === q.toLowerCase()) ||
        locations.find((item) => item.displayName.toLowerCase().includes(q.toLowerCase())) ||
        locations[0];

      setSelectedLocationInfo(selectedLocation);

      if (selectedLocation.locationType === "country") {
        const fallbackHotels = fallbackHotelsForQuery(selectedLocation.name);
        setLiveHotels(fallbackHotels);
        setLiveHotelsStatus(
          fallbackHotels.length
            ? `Showing hotel categories for ${selectedLocation.name}. Choose a city like Sydney or Melbourne to see more options.`
            : `No hotel categories found for "${selectedLocation.name}".`
        );
        return;
      }

      const overpassQuery = `
[out:json][timeout:25];
(
  node["tourism"~"hotel|guest_house|hostel|motel|apartment"](around:15000,${selectedLocation.lat},${selectedLocation.lon});
  way["tourism"~"hotel|guest_house|hostel|motel|apartment"](around:15000,${selectedLocation.lat},${selectedLocation.lon});
  relation["tourism"~"hotel|guest_house|hostel|motel|apartment"](around:15000,${selectedLocation.lat},${selectedLocation.lon});
);
out center tags 24;
      `.trim();

      const hotelResponse = await fetch(OVERPASS_URL, {
        signal,
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "text/plain;charset=UTF-8",
        },
        body: overpassQuery,
      });

      if (!hotelResponse.ok) {
        throw new Error(`Hotels API request failed (${hotelResponse.status})`);
      }

      const hotelPayload = await hotelResponse.json();
      const hotelElements = Array.isArray(hotelPayload?.elements) ? hotelPayload.elements : [];
      const hotels = await Promise.all(
        hotelElements.slice(0, 18).map(async (item, index) => {
          const tags = item.tags || {};
          const hotelName = tags.name || `${selectedLocation.name} Stay ${index + 1}`;
          const hotelType = getHotelType(tags);
          const stars = getHotelStars(tags);
          const amenity = getHotelAmenity(tags);
          const locationName = `${selectedLocation.name}, ${selectedLocation.country}`;

          return {
            id: `${item.type}-${item.id}`,
            osmId: item.id,
            osmType: item.type,
            name: hotelName,
            city:
              tags["addr:city"] ||
              tags["addr:town"] ||
              tags["addr:village"] ||
              selectedLocation.name,
            region: selectedLocation.region,
            country: selectedLocation.country,
            lat: item.lat || item.center?.lat || selectedLocation.lat,
            lon: item.lon || item.center?.lon || selectedLocation.lon,
            type: hotelType,
            stars,
            amenity,
            address: getHotelAddress(tags, locationName),
            image: await resolveHotelImage(hotelName, locationName, signal).catch(() =>
              fallbackImage(hotelName, locationName)
            ),
          };
        })
      );

      if (hotels.length) {
        setLiveHotels(hotels);
      } else {
        const fallbackHotels = fallbackHotelsForQuery(selectedLocation.name);
        setLiveHotels(fallbackHotels);
      }

      if (!hotels.length) {
        setLiveHotelsStatus(
          `Live hotel API returned no hotels for "${selectedLocation.name}". Showing fallback hotel data instead.`
        );
      }
    } catch (error) {
      if (error.name === "AbortError") return;
      const fallbackHotels = fallbackHotelsForQuery(q);
      setLiveHotels(fallbackHotels);
      setLocationSuggestions([]);
      setSelectedLocationInfo(null);
      setLiveHotelsStatus(
        fallbackHotels.length
          ? "Live hotel search failed from the browser. Showing fallback hotel data instead."
          : "Live hotel search failed. Check internet/API availability."
      );
    } finally {
      if (!signal?.aborted) {
        setLiveHotelsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetchLiveHotels(searchTerm, controller.signal);
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchTerm, fetchLiveHotels]);

  const hotelTypeOptions = useMemo(
    () => [FILTER_ALL_OPTION, ...new Set([...DEFAULT_HOTEL_TYPES, ...liveHotels.map((item) => item.type).filter(Boolean)])],
    [liveHotels]
  );
  const starOptions = useMemo(
    () => [FILTER_ALL_OPTION, ...new Set([...DEFAULT_STAR_OPTIONS, ...liveHotels.map((item) => item.stars).filter(Boolean)])],
    [liveHotels]
  );
  const amenityOptions = useMemo(
    () => [FILTER_ALL_OPTION, ...new Set([...DEFAULT_AMENITIES, ...liveHotels.map((item) => item.amenity).filter(Boolean)])],
    [liveHotels]
  );
  const cityGroups = useMemo(() => {
    const groups = new Map();
    liveHotels.forEach((item) => {
      const key = item.city || "Unknown";
      groups.set(key, (groups.get(key) || 0) + 1);
    });
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [liveHotels]);

  const visibleHotels = useMemo(() => {
    const normalizedCityFilter = cityFilter.trim().toLowerCase();
    const filtered = liveHotels.filter((item) => {
      const cityMatches = normalizedCityFilter
        ? item.city.toLowerCase().includes(normalizedCityFilter) || item.name.toLowerCase().includes(normalizedCityFilter)
        : true;
      const cityGroupMatches = selectedCityGroup === FILTER_ALL_OPTION || item.city === selectedCityGroup;
      const hotelTypeMatches = hotelTypeFilter === FILTER_ALL_OPTION || item.type === hotelTypeFilter;
      const starMatches = starFilter === FILTER_ALL_OPTION || item.stars === starFilter;
      const amenityMatches = amenityFilter === FILTER_ALL_OPTION || item.amenity === amenityFilter;

      return cityMatches && cityGroupMatches && hotelTypeMatches && starMatches && amenityMatches;
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === "z-a") return b.name.localeCompare(a.name);
      return a.name.localeCompare(b.name);
    });
  }, [liveHotels, cityFilter, selectedCityGroup, hotelTypeFilter, starFilter, amenityFilter, sortBy]);

  const selectedNightlyRate = useMemo(
    () => (selectedHotel ? getNightlyRate(selectedHotel) : 0),
    [selectedHotel]
  );

  const selectedStayNights = useMemo(
    () => getStayNights(bookingForm.checkInDate, bookingForm.checkOutDate),
    [bookingForm.checkInDate, bookingForm.checkOutDate]
  );

  const totalPrice = useMemo(() => {
    const guests = Number(bookingForm.guests) || 1;
    if (!selectedStayNights || !selectedNightlyRate) return 0;
    return selectedStayNights * selectedNightlyRate + Math.max(0, guests - 1) * 25;
  }, [bookingForm.guests, selectedNightlyRate, selectedStayNights]);

  const cryptoPaymentConfig = useMemo(() => getCryptoPaymentConfig(), []);

  const estimatedCryptoAmount = useMemo(
    () => estimateEthAmount(totalPrice),
    [totalPrice]
  );

  const receiptQrValue = useMemo(() => {
    if (!paymentSuccess) return "";

    return buildReceiptText(paymentSuccess);
  }, [paymentSuccess]);

  const handleWishlist = (hotel) => {
    if (!user?.uid) return;
    const wishlistId = getHotelWishlistKey(hotel);

    setWishlist((prev) => {
      const next = prev.includes(wishlistId)
        ? prev.filter((item) => item !== wishlistId)
        : [...prev, wishlistId];

      saveUserWishlist(user.uid, next);
      return next;
    });
  };

  const resetPaymentForms = () => {
    setBookingErrors({});
    setPaymentErrors({});
    setPaymentStatus("");
    setMailStatus("");
    setPaymentSuccess(null);
    setPaymentMethod(PAYMENT_METHODS[0]);
    setWalletStatus("");
    setBookingForm({
      checkInDate: "",
      checkOutDate: "",
      guests: "1",
    });
    setPaymentForm({
      cardholderName: "",
      cardNumber: "",
      expiryDate: "",
      cvv: "",
    });
  };

  const handleBookHotel = (hotel) => {
    setItineraryDestination(`${hotel.city}, ${hotel.country}`);
    setSelectedHotel(hotel);
    resetPaymentForms();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleBookingFieldChange = (e) => {
    const { name, value } = e.target;
    setBookingForm((prev) => ({ ...prev, [name]: value }));
    setBookingErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const handlePaymentFieldChange = (e) => {
    const { name, value } = e.target;
    let nextValue = value;

    if (name === "cardNumber") nextValue = formatCardNumber(value);
    if (name === "expiryDate") nextValue = normalizeExpiry(value);
    if (name === "cvv") nextValue = value.replace(/\D/g, "").slice(0, 4);

    setPaymentForm((prev) => ({ ...prev, [name]: nextValue }));
    setPaymentErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const handlePaymentMethodChange = (method) => {
    setPaymentMethod(method);
    setPaymentErrors({});
    setPaymentStatus("");
    setWalletStatus("");
  };

  const handleConnectWallet = async () => {
    try {
      const connectedWallet = await connectCryptoWallet();
      setWalletInfo(connectedWallet);
      setWalletStatus(`Wallet connected: ${connectedWallet.address.slice(0, 6)}...${connectedWallet.address.slice(-4)}`);
    } catch (error) {
      setWalletStatus(error?.message || "Could not connect wallet.");
    }
  };

  const validateBookingForm = () => {
    const nextErrors = {};
    const guests = Number(bookingForm.guests);

    if (!selectedHotel) nextErrors.hotel = "Please choose a hotel first.";
    if (!bookingForm.checkInDate) nextErrors.checkInDate = "Please choose a check-in date.";
    if (!bookingForm.checkOutDate) nextErrors.checkOutDate = "Please choose a check-out date.";
    if (bookingForm.checkInDate && bookingForm.checkOutDate && selectedStayNights <= 0) {
      nextErrors.checkOutDate = "Check-out date must be after check-in date.";
    }
    if (!bookingForm.guests || !Number.isFinite(guests) || guests < 1) {
      nextErrors.guests = "Please enter at least 1 guest.";
    }

    setBookingErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const validatePaymentForm = () => {
    if (paymentMethod === CRYPTO_PAYMENT_METHOD) {
      const nextErrors = {};
      if (!isWalletAvailable()) {
        nextErrors.crypto = "MetaMask is required for blockchain payments.";
      }
      if (!walletInfo.address) {
        nextErrors.crypto = "Connect your crypto wallet before paying.";
      }
      if (!cryptoPaymentConfig.paymentAddress) {
        nextErrors.crypto = "Crypto payment address is not configured.";
      }
      setPaymentErrors(nextErrors);
      return Object.keys(nextErrors).length === 0;
    }

    if (paymentMethod === "Pay at Hotel") {
      setPaymentErrors({});
      return true;
    }

    const nextErrors = {};
    if (!paymentForm.cardholderName.trim()) {
      nextErrors.cardholderName = "Cardholder name is required.";
    }
    if (normalizeCardNumber(paymentForm.cardNumber).length < 13) {
      nextErrors.cardNumber = "Enter a valid card number.";
    }
    if (!isValidExpiry(paymentForm.expiryDate)) {
      nextErrors.expiryDate = "Enter a valid future expiry date in MM/YY format.";
    }
    if (!/^\d{3,4}$/.test(paymentForm.cvv)) {
      nextErrors.cvv = "Enter a valid 3 or 4 digit CVV.";
    }

    setPaymentErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handlePaymentSubmit = async (e) => {
    e.preventDefault();

    if (!user?.uid) {
      setPaymentStatus("Please sign in before booking.");
      return;
    }

    const bookingOk = validateBookingForm();
    const paymentOk = validatePaymentForm();
    if (!bookingOk || !paymentOk) {
      setPaymentStatus("Please fix the highlighted fields and try again.");
      return;
    }

    setIsSubmittingPayment(true);
    setPaymentStatus("");

    try {
      const bookingPayload = {
        hotelName: selectedHotel.name,
        destination: `${selectedHotel.city}, ${selectedHotel.country}`,
        checkInDate: bookingForm.checkInDate,
        checkOutDate: bookingForm.checkOutDate,
        guests: Number(bookingForm.guests),
      };
      let paymentResult;

      if (paymentMethod === CRYPTO_PAYMENT_METHOD) {
        setPaymentStatus("Open MetaMask to approve the blockchain transaction.");
        const cryptoTx = await sendCryptoPayment({
          from: walletInfo.address,
          amountUsd: totalPrice,
        });
        setPaymentStatus("Transaction submitted. Confirming payment on test network...");
        paymentResult = await confirmCryptoPayment({
          ...cryptoTx,
          walletAddress: walletInfo.address,
          amount: totalPrice,
          currency: "USD",
          booking: bookingPayload,
        });
      } else {
        paymentResult = await processBookingPayment({
          amount: totalPrice,
          currency: "USD",
          paymentMethod,
          booking: bookingPayload,
          paymentDetails:
            paymentMethod === "Pay at Hotel"
              ? {}
              : {
                  cardholderName: paymentForm.cardholderName.trim(),
                  cardNumber: normalizeCardNumber(paymentForm.cardNumber),
                  expiryDate: paymentForm.expiryDate,
                  cvv: paymentForm.cvv,
                },
        });
      }

      const bookingId = `${Date.now()}`;
      const nextPaymentSuccess = {
        bookingId,
        bookingReference: paymentResult.bookingReference,
        paymentTransactionId: paymentResult.transactionId,
        paymentGatewayMode: paymentResult.gatewayMode,
        cryptoTxHash: paymentResult.txHash || "",
        cryptoWalletAddress: paymentResult.walletAddress || "",
        cryptoChainId: paymentResult.chainId || "",
        cryptoAmount: paymentResult.cryptoAmount || "",
        userId: user.uid,
        hotelId: selectedHotel.id,
        hotelName: selectedHotel.name,
        destination: `${selectedHotel.city}, ${selectedHotel.country}`,
        checkInDate: bookingForm.checkInDate,
        checkOutDate: bookingForm.checkOutDate,
        guests: Number(bookingForm.guests),
        totalPrice,
        paymentMethod,
        paymentStatus: paymentResult.paymentStatus,
        bookingStatus: paymentResult.bookingStatus,
        createdAt: new Date().toISOString(),
        nightlyRate: selectedNightlyRate,
        nights: selectedStayNights,
        hotelImage: selectedHotel.image,
        hotelAddress: selectedHotel.address,
        cardLast4: paymentResult.cardLast4 || "",
      };

      await saveUserHotelBooking(user.uid, nextPaymentSuccess);

      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          BOOKING_CHATBOT_NOTICE_KEY,
          JSON.stringify({
            userId: user.uid,
            createdAt: nextPaymentSuccess.createdAt,
            hotelName: nextPaymentSuccess.hotelName,
            destination: nextPaymentSuccess.destination,
            checkInDate: nextPaymentSuccess.checkInDate,
            checkOutDate: nextPaymentSuccess.checkOutDate,
            guests: nextPaymentSuccess.guests,
            totalPrice: nextPaymentSuccess.totalPrice,
            paymentMethod: nextPaymentSuccess.paymentMethod,
            bookingReference: nextPaymentSuccess.bookingReference,
          })
        );
      }

      setPaymentSuccess(nextPaymentSuccess);
      setPaymentStatus(
        paymentMethod === CRYPTO_PAYMENT_METHOD
          ? "Blockchain payment confirmed on the test network. Your hotel booking is confirmed."
          : paymentMethod === "Pay at Hotel"
          ? "Booking confirmed. Payment will be collected at the hotel."
          : "Payment successful. Your hotel booking is confirmed."
      );

      if (isBookingEmailConfigured() && user.email) {
        try {
          await sendBookingConfirmationEmail({
            booking: nextPaymentSuccess,
            email: user.email,
            name: user.displayName || user.name,
          });
          setMailStatus(`Confirmation email sent to ${user.email}.`);
        } catch (mailError) {
          setMailStatus(mailError?.message || "Booking confirmed, but confirmation email could not be sent.");
        }
      } else {
        setMailStatus("Booking confirmed. Configure EmailJS booking template to send confirmation email.");
      }
    } catch (error) {
      setPaymentStatus(error?.message || "We could not save your booking right now. Please try again.");
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  return (
    <div className="destinations-page">
      <header className="destinations-nav">
        <div className="destinations-nav-inner">
          <Logo className="dest-nav-logo" />
          <nav className="dest-nav-links">
            <Link to="/">Home</Link>
            <Link to="/destinations">Destinations</Link>
            <Link to="/hotels">Hotels</Link>
            <Link to="/planner">Planner</Link>
          </nav>
        </div>
      </header>

      <section className="destinations-list">
        <div className="destinations-hero">
          <h1>Explore Hotels</h1>
          <p>Search any city or country and browse live hotels with the same destination-style layout.</p>
        </div>

        <section className="search-panel">
          <div className="city-search-wrap">
            <label htmlFor="hotel-search">City or Country</label>
            <input
              id="hotel-search"
              type="text"
              placeholder="Type a city or country (e.g. Tokyo, Paris, New Zealand)"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />

            {searchTerm.trim().length >= 2 && (
              <div className="city-autocomplete" role="listbox" aria-label="Location suggestions">
                {liveHotelsLoading && <p className="city-autocomplete-status">Loading locations...</p>}
                {!liveHotelsLoading && locationSuggestions.length === 0 && (
                  <p className="city-autocomplete-status">No location suggestions yet.</p>
                )}
                {!liveHotelsLoading && locationSuggestions.length > 0 && (
                  <ul>
                    {locationSuggestions.map((location) => (
                      <li key={location.id}>
                        <button type="button" onClick={() => setSearchTerm(location.name)}>
                          <span>{location.name}</span>
                          <small>
                            {location.country}
                            {location.region !== "Unknown" ? ` - ${location.region}` : ""}
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
              <label htmlFor="city-filter">City Filter</label>
              <input
                id="city-filter"
                type="text"
                placeholder="Optional hotel or city keyword"
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
              />
            </div>

            <div className="filter-field">
              <label htmlFor="hotel-type-filter">Hotel Type</label>
              <select
                id="hotel-type-filter"
                value={hotelTypeFilter}
                onChange={(e) => setHotelTypeFilter(e.target.value)}
              >
                {hotelTypeOptions.map((type) => (
                  <option key={type} value={type}>
                    {type === FILTER_ALL_OPTION ? "All Hotel Types" : type}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-field">
              <label htmlFor="star-filter">Rating</label>
              <select id="star-filter" value={starFilter} onChange={(e) => setStarFilter(e.target.value)}>
                {starOptions.map((stars) => (
                  <option key={stars} value={stars}>
                    {stars === FILTER_ALL_OPTION ? "All Ratings" : stars}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-field">
              <label htmlFor="amenity-filter">Amenity</label>
              <select id="amenity-filter" value={amenityFilter} onChange={(e) => setAmenityFilter(e.target.value)}>
                {amenityOptions.map((amenity) => (
                  <option key={amenity} value={amenity}>
                    {amenity === FILTER_ALL_OPTION ? "All Amenities" : amenity}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-field">
              <label htmlFor="sort-filter">Sort</label>
              <select id="sort-filter" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="a-z">Hotel Name (A-Z)</option>
                <option value="z-a">Hotel Name (Z-A)</option>
              </select>
            </div>
          </div>
          <p className="city-autocomplete-status">
            Amenity means hotel facilities such as Wi-Fi, parking, breakfast, pool, accessibility, or air conditioning.
          </p>
        </section>

        {selectedHotel && (
          <section className="hotel-booking-panel">
            <div className="hotel-booking-header">
              <div>
                <p className="hotel-booking-eyebrow">Hotel booking</p>
                <h2>{selectedHotel.name}</h2>
                <p>
                  {selectedHotel.city}, {selectedHotel.country} - {selectedHotel.type} - {selectedHotel.stars}
                </p>
              </div>
              <button type="button" className="hotel-booking-close" onClick={() => setSelectedHotel(null)}>
                Close
              </button>
            </div>

            <div className="hotel-booking-grid">
              <form className="hotel-payment-form" onSubmit={handlePaymentSubmit}>
                <div className="hotel-payment-section">
                  <h3>Stay details</h3>
                  <div className="hotel-payment-fields">
                    <label>
                      <span>Check-in date</span>
                      <input
                        name="checkInDate"
                        type="date"
                        value={bookingForm.checkInDate}
                        onChange={handleBookingFieldChange}
                        required
                      />
                      {bookingErrors.checkInDate && <small>{bookingErrors.checkInDate}</small>}
                    </label>
                    <label>
                      <span>Check-out date</span>
                      <input
                        name="checkOutDate"
                        type="date"
                        value={bookingForm.checkOutDate}
                        onChange={handleBookingFieldChange}
                        required
                      />
                      {bookingErrors.checkOutDate && <small>{bookingErrors.checkOutDate}</small>}
                    </label>
                    <label>
                      <span>Guests</span>
                      <input
                        name="guests"
                        type="number"
                        min="1"
                        value={bookingForm.guests}
                        onChange={handleBookingFieldChange}
                        required
                      />
                      {bookingErrors.guests && <small>{bookingErrors.guests}</small>}
                    </label>
                  </div>
                </div>

                <div className="hotel-payment-section">
                  <h3>Select payment method</h3>
                  <div className="payment-methods" role="radiogroup" aria-label="Payment method">
                    {PAYMENT_METHODS.map((method) => (
                      <button
                        key={method}
                        type="button"
                        className={paymentMethod === method ? "payment-method is-selected" : "payment-method"}
                        onClick={() => handlePaymentMethodChange(method)}
                      >
                        {method}
                      </button>
                    ))}
                  </div>
                  <p className="selected-payment-method">
                    Selected payment method: <strong>{paymentMethod}</strong>
                  </p>
                </div>

                {(paymentMethod === "Credit Card" || paymentMethod === "Debit Card") && (
                  <div className="hotel-payment-section">
                    <h3>Card details</h3>
                    <div className="hotel-payment-fields">
                      <label>
                        <span>Cardholder Name</span>
                        <input
                          name="cardholderName"
                          type="text"
                          value={paymentForm.cardholderName}
                          onChange={handlePaymentFieldChange}
                          placeholder="Name on card"
                          required
                        />
                        {paymentErrors.cardholderName && <small>{paymentErrors.cardholderName}</small>}
                      </label>
                      <label>
                        <span>Card Number</span>
                        <input
                          name="cardNumber"
                          type="text"
                          inputMode="numeric"
                          value={paymentForm.cardNumber}
                          onChange={handlePaymentFieldChange}
                          placeholder="1234 5678 9012 3456"
                          required
                        />
                        {paymentErrors.cardNumber && <small>{paymentErrors.cardNumber}</small>}
                      </label>
                      <label>
                        <span>Expiry Date</span>
                        <input
                          name="expiryDate"
                          type="text"
                          inputMode="numeric"
                          value={paymentForm.expiryDate}
                          onChange={handlePaymentFieldChange}
                          placeholder="MM/YY"
                          required
                        />
                        {paymentErrors.expiryDate && <small>{paymentErrors.expiryDate}</small>}
                      </label>
                      <label>
                        <span>CVV</span>
                        <input
                          name="cvv"
                          type="password"
                          inputMode="numeric"
                          value={paymentForm.cvv}
                          onChange={handlePaymentFieldChange}
                          placeholder="123"
                          required
                        />
                        {paymentErrors.cvv && <small>{paymentErrors.cvv}</small>}
                      </label>
                    </div>
                  </div>
                )}

                {paymentMethod === CRYPTO_PAYMENT_METHOD && (
                  <div className="hotel-payment-section crypto-payment-section">
                    <h3>Crypto wallet</h3>
                    <div className="crypto-wallet-panel">
                      <div>
                        <p>
                          Pay approximately <strong>{estimatedCryptoAmount} ETH</strong> on the configured test network.
                        </p>
                        <p>
                          Recipient: <strong>{cryptoPaymentConfig.paymentAddress || "Not configured"}</strong>
                        </p>
                        {cryptoPaymentConfig.requiredChainId && (
                          <p>
                            Required chain: <strong>{cryptoPaymentConfig.requiredChainId}</strong>
                          </p>
                        )}
                      </div>
                      <button type="button" className="hotel-payment-submit" onClick={handleConnectWallet}>
                        {walletInfo.address ? "Reconnect Wallet" : "Connect MetaMask"}
                      </button>
                    </div>
                    {walletInfo.address && (
                      <p className="selected-payment-method">
                        Connected wallet: <strong>{walletInfo.address.slice(0, 6)}...{walletInfo.address.slice(-4)}</strong>
                      </p>
                    )}
                    {walletStatus && <p className="wallet-status">{walletStatus}</p>}
                    {paymentErrors.crypto && <small className="crypto-payment-error">{paymentErrors.crypto}</small>}
                  </div>
                )}

                {paymentStatus && (
                  <p className={paymentSuccess ? "hotel-payment-status is-success" : "hotel-payment-status is-error"}>
                    {paymentStatus}
                  </p>
                )}

                {mailStatus && <p className="hotel-payment-status is-success">{mailStatus}</p>}

                <button type="submit" className="hotel-payment-submit" disabled={isSubmittingPayment}>
                  {isSubmittingPayment
                    ? "Processing..."
                    : paymentMethod === CRYPTO_PAYMENT_METHOD
                    ? "Pay With Wallet"
                    : paymentMethod === "Pay at Hotel"
                    ? "Confirm Booking"
                    : "Pay Now"}
                </button>
              </form>

              <aside className="hotel-booking-summary">
                <div className="hotel-booking-card">
                  <p className="hotel-booking-eyebrow">Booking summary</p>
                  <h3>{selectedHotel.name}</h3>
                  <p>{selectedHotel.address}</p>
                  <ul className="hotel-summary-list">
                    <li><span>Destination</span><strong>{selectedHotel.city}, {selectedHotel.country}</strong></li>
                    <li><span>Nightly rate</span><strong>{formatCurrency(selectedNightlyRate)}</strong></li>
                    <li><span>Nights</span><strong>{selectedStayNights || "-"}</strong></li>
                    <li><span>Guests</span><strong>{bookingForm.guests || "1"}</strong></li>
                    <li><span>Payment method</span><strong>{paymentMethod}</strong></li>
                    {paymentMethod === CRYPTO_PAYMENT_METHOD && (
                      <li><span>Estimated crypto</span><strong>{estimatedCryptoAmount} ETH</strong></li>
                    )}
                    <li><span>Total price</span><strong>{formatCurrency(totalPrice)}</strong></li>
                  </ul>
                </div>
              </aside>
            </div>
          </section>
        )}

        {paymentSuccess && (
          <section className="hotel-receipt-panel">
            <div className="hotel-receipt-copy">
              <p className="hotel-booking-eyebrow">Receipt</p>
              <h2>
                {paymentSuccess.paymentStatus === "Pending"
                  ? "Your hotel booking is confirmed."
                  : "Payment successful. Your hotel booking is confirmed."}
              </h2>
              <p>Your receipt and QR code are ready below.</p>
              <div className="hotel-receipt-details">
                <p><strong>Booking ID:</strong> {paymentSuccess.bookingId}</p>
                <p><strong>Booking Reference:</strong> {paymentSuccess.bookingReference}</p>
                <p><strong>Hotel Name:</strong> {paymentSuccess.hotelName}</p>
                <p><strong>Destination:</strong> {paymentSuccess.destination}</p>
                <p><strong>Check-in date:</strong> {paymentSuccess.checkInDate}</p>
                <p><strong>Check-out date:</strong> {paymentSuccess.checkOutDate}</p>
                <p><strong>Guests:</strong> {paymentSuccess.guests}</p>
                <p><strong>Amount paid:</strong> {formatCurrency(paymentSuccess.totalPrice)}</p>
                <p><strong>Payment method:</strong> {paymentSuccess.paymentMethod}</p>
                <p><strong>Payment status:</strong> {paymentSuccess.paymentStatus}</p>
                <p><strong>Booking status:</strong> {paymentSuccess.bookingStatus}</p>
                {paymentSuccess.cryptoTxHash && <p><strong>Crypto transaction:</strong> {paymentSuccess.cryptoTxHash}</p>}
                {paymentSuccess.cryptoWalletAddress && <p><strong>Wallet:</strong> {paymentSuccess.cryptoWalletAddress}</p>}
              </div>
            </div>
            <div className="hotel-qr-card">
              <QRCodeSVG value={receiptQrValue} size={210} includeMargin />
              <p>Scan to view the booking receipt details on your phone.</p>
            </div>
          </section>
        )}

        {searchTerm.trim() === "" && (
          <section className="popular-section">
            <div className="popular-section-head">
              <h2>Popular Hotel Searches</h2>
              <p>Start with the same popular destinations and jump straight into hotel results.</p>
            </div>
            <div className="destinations-grid">
              {featuredSearches.map((item) => (
                <article key={`hotel-feature-${item.id}`} className="dest-card popular-card">
                  <div className="dest-card-image" style={{ backgroundImage: `url(${item.image})` }} />
                  <div className="dest-card-body">
                    <h3>
                      {item.city}, {item.country}
                    </h3>
                    <p className="city-source">Hotel search starter</p>
                    <p className="city-tags">{item.description}</p>
                    <div className="live-card-actions">
                      <button type="button" onClick={() => setSearchTerm(item.city)}>
                        Find Hotels
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

        {liveHotelsStatus && <p className="search-status">{liveHotelsStatus}</p>}

        {searchTerm.trim() !== "" && selectedLocationInfo && (
          <div className="active-summary">
            <p>
              Live hotels for <strong>{selectedLocationInfo.name}</strong>
            </p>
            <span>{selectedLocationInfo.country}</span>
            {selectedLocationInfo.region !== "Unknown" && <span>{selectedLocationInfo.region}</span>}
            {selectedCityGroup !== FILTER_ALL_OPTION && <span>{selectedCityGroup}</span>}
            <span>{visibleHotels.length} hotels</span>
          </div>
        )}

        {searchTerm.trim() !== "" && cityGroups.length > 0 && (
          <section className="popular-section">
            <div className="popular-section-head">
              <h2>City Categories</h2>
              <p>Pick a city to show more hotel options for that location.</p>
            </div>
            <div className="live-card-actions">
              <button
                type="button"
                className={selectedCityGroup === FILTER_ALL_OPTION ? "wishlist-btn is-saved" : "wishlist-btn"}
                onClick={() => {
                  setSelectedCityGroup(FILTER_ALL_OPTION);
                  setCityFilter("");
                }}
              >
                All Cities ({liveHotels.length})
              </button>
              {cityGroups.map(([city, count]) => (
                <button
                  key={city}
                  type="button"
                  className={selectedCityGroup === city ? "wishlist-btn is-saved" : "wishlist-btn"}
                  onClick={() => {
                    setSelectedCityGroup(city);
                    setCityFilter(city);
                  }}
                >
                  {city} ({count})
                </button>
              ))}
            </div>
          </section>
        )}

        {visibleHotels.length > 0 && (
          <section className="live-cities-section">
            <h2>Live Hotels</h2>
            <div className="destinations-grid">
              {visibleHotels.map((hotel) => {
                const wishlistId = getHotelWishlistKey(hotel);
                const isSaved = wishlist.includes(wishlistId);

                return (
                  <article key={hotel.id} className="dest-card live-city-card">
                    <div className="dest-card-image" style={{ backgroundImage: `url(${hotel.image})` }} />
                    <div className="dest-card-body">
                      <h3>{hotel.name}</h3>
                      <p className="city-source">
                        {hotel.city}, {hotel.country}
                      </p>
                      <p className="city-tags">
                        {hotel.type} | {hotel.stars} | {hotel.amenity}
                      </p>
                      <p className="city-tags">{hotel.address}</p>
                      <div className="live-card-actions">
                        <a
                          className="dest-view-link"
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                            `${hotel.name}, ${hotel.city}, ${hotel.country}`
                          )}&key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View Details
                        </a>
                        <button
                          type="button"
                          onClick={() => navigate("/planner", { state: { add: `${hotel.city}, ${hotel.country}` } })}
                        >
                          Plan Itinerary
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            navigate("/budget", {
                              state: {
                                hotelName: hotel.name,
                                hotelPricePerNight: "",
                                destinationSearch: hotel.city || hotel.country || "",
                                selectedLocation: {
                                  name: hotel.city || hotel.name,
                                  country: hotel.country,
                                  region: hotel.region,
                                  lat: hotel.lat,
                                  lon: hotel.lon,
                                },
                              },
                            })
                          }
                        >
                          Budget Planner
                        </button>
                        <button
                          type="button"
                          className={isSaved ? "wishlist-btn is-saved" : "wishlist-btn"}
                          onClick={() => handleWishlist(hotel)}
                        >
                          {isSaved ? "Saved Wishlist" : "Save Wishlist"}
                        </button>
                        <button type="button" onClick={() => handleBookHotel(hotel)}>
                          Book Now
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {!liveHotelsLoading && searchTerm.trim() && liveHotels.length === 0 && !liveHotelsStatus && (
          <p className="no-results">No live hotels found.</p>
        )}
      </section>

      <footer className="destinations-footer">
        <div className="destinations-footer-inner">
          <p>TripPlan Live Hotels</p>
          <p>Search locations, browse live hotel listings, and move straight into itinerary planning.</p>
        </div>
      </footer>
    </div>
  );
}

export default Hotels;
