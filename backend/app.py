from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv
import json
import requests as http_req
import os
from pathlib import Path
import time
import uuid
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.neighbors import NearestNeighbors
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from chat_workflow import classify_search_type, handle_chat_message
from gemini_service import generate_budget_reply, generate_travel_reply
from places_service import search_places


ROOT_ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(ROOT_ENV_PATH, override=True)

OLLAMA_API_URL = os.getenv("OLLAMA_API_URL", "http://localhost:11434/api/generate")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemma3:1b")
OLLAMA_TIMEOUT_SECONDS = int(os.getenv("OLLAMA_TIMEOUT_SECONDS", "180"))


app = Flask(__name__)
CORS(app)


# Destination dataset for the travel recommendation endpoint.
DESTINATIONS = [
    {"destination_name": "Bali", "average_budget": 800, "weather_type": "warm", "trip_type": "beach", "recommended_days": 5},
    {"destination_name": "Gold Coast", "average_budget": 900, "weather_type": "warm", "trip_type": "beach", "recommended_days": 4},
    {"destination_name": "Queenstown", "average_budget": 1200, "weather_type": "cold", "trip_type": "mountain", "recommended_days": 5},
    {"destination_name": "Tokyo", "average_budget": 1500, "weather_type": "mild", "trip_type": "city", "recommended_days": 6},
    {"destination_name": "Phuket", "average_budget": 700, "weather_type": "warm", "trip_type": "beach", "recommended_days": 5},
    {"destination_name": "Paris", "average_budget": 1600, "weather_type": "mild", "trip_type": "city", "recommended_days": 5},
    {"destination_name": "Swiss Alps", "average_budget": 1800, "weather_type": "cold", "trip_type": "mountain", "recommended_days": 7},
    {"destination_name": "Dubai", "average_budget": 1400, "weather_type": "warm", "trip_type": "city", "recommended_days": 4},
    {"destination_name": "Banff", "average_budget": 1300, "weather_type": "cold", "trip_type": "mountain", "recommended_days": 5},
    {"destination_name": "Barcelona", "average_budget": 1100, "weather_type": "mild", "trip_type": "beach", "recommended_days": 5},
]


# Hotel dataset for the hotel recommendation endpoint.
# Amenity flags are kept explicit so the chatbot can ask for wifi, parking, breakfast, and similar features.
HOTELS = [
    {"hotel_name": "City Centre Budget Inn", "rating": 4.1, "price_per_night": 85, "location_preference": "city centre", "wifi": 1, "parking": 0, "breakfast": 1},
    {"hotel_name": "Downtown Smart Stay", "rating": 4.4, "price_per_night": 110, "location_preference": "city centre", "wifi": 1, "parking": 1, "breakfast": 0},
    {"hotel_name": "Harbour Comfort Hotel", "rating": 4.6, "price_per_night": 145, "location_preference": "harbour", "wifi": 1, "parking": 1, "breakfast": 1},
    {"hotel_name": "Airport Express Lodge", "rating": 4.0, "price_per_night": 95, "location_preference": "airport", "wifi": 1, "parking": 1, "breakfast": 0},
    {"hotel_name": "Beachside Escape Resort", "rating": 4.8, "price_per_night": 210, "location_preference": "beach", "wifi": 1, "parking": 1, "breakfast": 1},
    {"hotel_name": "Mountain View Retreat", "rating": 4.7, "price_per_night": 185, "location_preference": "mountain", "wifi": 1, "parking": 1, "breakfast": 1},
    {"hotel_name": "Central Backpackers Hub", "rating": 3.9, "price_per_night": 60, "location_preference": "city centre", "wifi": 1, "parking": 0, "breakfast": 0},
    {"hotel_name": "Suburban Family Suites", "rating": 4.3, "price_per_night": 125, "location_preference": "suburb", "wifi": 1, "parking": 1, "breakfast": 1},
    {"hotel_name": "Parkside Business Hotel", "rating": 4.5, "price_per_night": 135, "location_preference": "park", "wifi": 1, "parking": 1, "breakfast": 0},
    {"hotel_name": "Luxury City Palace", "rating": 4.9, "price_per_night": 280, "location_preference": "city centre", "wifi": 1, "parking": 1, "breakfast": 1},
]


destinations_df = pd.DataFrame(DESTINATIONS)
hotels_df = pd.DataFrame(HOTELS)


DESTINATION_FEATURES = ["average_budget", "weather_type", "trip_type", "recommended_days"]
HOTEL_FEATURES = ["price_per_night", "rating", "location_preference", "wifi", "parking", "breakfast"]


def build_destination_model():
    # Numeric and categorical features are transformed so KNN can compare them in one vector space.
    preprocessor = ColumnTransformer(
        transformers=[
            ("numeric", StandardScaler(), ["average_budget", "recommended_days"]),
            ("categorical", OneHotEncoder(handle_unknown="ignore"), ["weather_type", "trip_type"]),
        ]
    )
    pipeline = Pipeline(steps=[("preprocessor", preprocessor)])
    matrix = pipeline.fit_transform(destinations_df[DESTINATION_FEATURES])

    # NearestNeighbors is a KNN-style recommender for the closest destination profiles.
    model = NearestNeighbors(n_neighbors=3, metric="euclidean")
    model.fit(matrix)
    return pipeline, model


def build_hotel_model():
    # Price/rating are numeric. Location is categorical. Amenities are binary numeric flags.
    preprocessor = ColumnTransformer(
        transformers=[
            ("numeric", StandardScaler(), ["price_per_night", "rating", "wifi", "parking", "breakfast"]),
            ("categorical", OneHotEncoder(handle_unknown="ignore"), ["location_preference"]),
        ]
    )
    pipeline = Pipeline(steps=[("preprocessor", preprocessor)])
    matrix = pipeline.fit_transform(hotels_df[HOTEL_FEATURES])

    # Use more neighbors first, then rerank by business rules and past choices.
    model = NearestNeighbors(n_neighbors=min(6, len(hotels_df)), metric="euclidean")
    model.fit(matrix)
    return pipeline, model


destination_pipeline, destination_model = build_destination_model()
hotel_pipeline, hotel_model = build_hotel_model()


def validate_destination_payload(payload):
    required = ["budget", "weather", "trip_type", "days"]
    missing = [field for field in required if field not in payload]
    if missing:
        return f"Missing required fields: {', '.join(missing)}"

    if payload["weather"] not in {"warm", "cold", "mild"}:
        return "weather must be one of: warm, cold, mild"
    if payload["trip_type"] not in {"beach", "city", "mountain"}:
        return "trip_type must be one of: beach, city, mountain"

    try:
        float(payload["budget"])
        int(payload["days"])
    except (TypeError, ValueError):
        return "budget must be numeric and days must be an integer"

    return None


def validate_hotel_payload(payload):
    required = ["budget", "location_preference", "amenities"]
    missing = [field for field in required if field not in payload]
    if missing:
        return f"Missing required fields: {', '.join(missing)}"

    try:
        float(payload["budget"])
    except (TypeError, ValueError):
        return "budget must be numeric"

    if not isinstance(payload["amenities"], list):
        return "amenities must be a list"

    valid_locations = {"city centre", "harbour", "airport", "beach", "mountain", "suburb", "park"}
    if payload["location_preference"] not in valid_locations:
        return "location_preference must be one of: city centre, harbour, airport, beach, mountain, suburb, park"

    valid_amenities = {"wifi", "parking", "breakfast"}
    invalid_amenities = [item for item in payload["amenities"] if item not in valid_amenities]
    if invalid_amenities:
        return f"Unsupported amenities: {', '.join(invalid_amenities)}"

    if "past_choices" in payload and not isinstance(payload["past_choices"], list):
        return "past_choices must be a list of hotel names"

    return None


def build_destination_request_frame(payload):
    return pd.DataFrame(
        [
            {
                "average_budget": float(payload["budget"]),
                "weather_type": payload["weather"],
                "trip_type": payload["trip_type"],
                "recommended_days": int(payload["days"]),
            }
        ]
    )


def build_hotel_request_frame(payload, preference_profile=None):
    amenities = set(payload.get("amenities", []))

    # Past user choices are summarized into an average profile.
    # This acts as a lightweight personalization signal.
    budget_value = float(payload["budget"])
    rating_value = 4.0
    location_value = payload["location_preference"]
    wifi_value = 1 if "wifi" in amenities else 0
    parking_value = 1 if "parking" in amenities else 0
    breakfast_value = 1 if "breakfast" in amenities else 0

    if preference_profile is not None:
        budget_value = (budget_value + float(preference_profile["price_per_night"])) / 2
        rating_value = float(preference_profile["rating"])
        if payload["location_preference"] == "city centre":
            location_value = preference_profile["location_preference"]
        wifi_value = max(wifi_value, int(preference_profile["wifi"]))
        parking_value = max(parking_value, int(preference_profile["parking"]))
        breakfast_value = max(breakfast_value, int(preference_profile["breakfast"]))

    return pd.DataFrame(
        [
            {
                "price_per_night": budget_value,
                "rating": rating_value,
                "location_preference": location_value,
                "wifi": wifi_value,
                "parking": parking_value,
                "breakfast": breakfast_value,
            }
        ]
    )


def get_past_choice_profile(past_choices):
    if not past_choices:
        return None

    previous_hotels = hotels_df[hotels_df["hotel_name"].isin(past_choices)]
    if previous_hotels.empty:
        return None

    preferred_location = previous_hotels["location_preference"].mode().iloc[0]
    return {
        "price_per_night": previous_hotels["price_per_night"].mean(),
        "rating": previous_hotels["rating"].mean(),
        "location_preference": preferred_location,
        "wifi": round(previous_hotels["wifi"].mean()),
        "parking": round(previous_hotels["parking"].mean()),
        "breakfast": round(previous_hotels["breakfast"].mean()),
    }


def score_hotel_row(row, payload, distance, past_choice_profile):
    requested_amenities = set(payload.get("amenities", []))
    matched_amenities = sum(int(row[amenity]) for amenity in requested_amenities)
    amenity_score = matched_amenities / max(len(requested_amenities), 1) if requested_amenities else 0

    # Close distance from KNN means the hotel looks similar to the user's feature profile.
    similarity_score = 1 / (1 + distance)
    rating_score = row["rating"] / 5
    budget_score = 1 if row["price_per_night"] <= float(payload["budget"]) else 0.25
    location_score = 1 if row["location_preference"] == payload["location_preference"] else 0

    past_choice_bonus = 0
    if past_choice_profile and row["location_preference"] == past_choice_profile["location_preference"]:
        past_choice_bonus = 0.2

    return (
        similarity_score * 0.35
        + rating_score * 0.2
        + budget_score * 0.15
        + location_score * 0.15
        + amenity_score * 0.15
        + past_choice_bonus
    )


def parse_attraction_response(raw_response):
    if not raw_response:
        return []

    try:
        parsed = json.loads(raw_response)
    except json.JSONDecodeError:
        start = raw_response.find("[")
        end = raw_response.rfind("]")
        if start == -1 or end == -1 or end <= start:
            return [
                {"name": line.strip("-* 1234567890. "), "reason": ""}
                for line in raw_response.splitlines()
                if line.strip()
            ][:5]
        try:
            parsed = json.loads(raw_response[start : end + 1])
        except json.JSONDecodeError:
            return []

    if isinstance(parsed, dict):
        parsed = parsed.get("attractions", [])

    attractions = []
    for item in parsed[:5] if isinstance(parsed, list) else []:
        if isinstance(item, str):
            attractions.append({"name": item, "reason": ""})
        elif isinstance(item, dict) and item.get("name"):
            attractions.append(
                {
                    "name": str(item.get("name", "")).strip(),
                    "reason": str(item.get("reason", "")).strip(),
                }
            )

    return attractions


def normalize_card_number(value):
    return "".join(char for char in str(value or "") if char.isdigit())[:19]


def validate_payment_payload(payload):
    required = ["amount", "currency", "paymentMethod", "booking"]
    missing = [field for field in required if field not in payload]
    if missing:
        return f"Missing required fields: {', '.join(missing)}"

    try:
        amount = float(payload["amount"])
    except (TypeError, ValueError):
        return "amount must be numeric"

    if amount <= 0:
        return "amount must be greater than 0"

    payment_method = payload.get("paymentMethod")
    if payment_method not in {"Credit Card", "Debit Card", "Pay at Hotel"}:
        return "paymentMethod must be Credit Card, Debit Card, or Pay at Hotel"

    booking = payload.get("booking") or {}
    for field in ["hotelName", "destination", "checkInDate", "checkOutDate", "guests"]:
        if not booking.get(field):
            return f"booking.{field} is required"

    if payment_method == "Pay at Hotel":
        return None

    payment_details = payload.get("paymentDetails") or {}
    card_number = normalize_card_number(payment_details.get("cardNumber"))
    if len(card_number) < 13:
        return "A valid card number is required"
    if not str(payment_details.get("cardholderName") or "").strip():
        return "cardholderName is required"
    if not str(payment_details.get("expiryDate") or "").strip():
        return "expiryDate is required"
    if not str(payment_details.get("cvv") or "").isdigit():
        return "cvv is required"

    return None


def validate_crypto_confirmation_payload(payload):
    required = ["txHash", "walletAddress", "chainId", "amount", "currency", "booking"]
    missing = [field for field in required if field not in payload]
    if missing:
        return f"Missing required fields: {', '.join(missing)}"

    tx_hash = str(payload.get("txHash") or "")
    wallet_address = str(payload.get("walletAddress") or "")

    if not tx_hash.startswith("0x") or len(tx_hash) < 12:
        return "A valid transaction hash is required"
    if not wallet_address.startswith("0x") or len(wallet_address) != 42:
        return "A valid wallet address is required"

    try:
        amount = float(payload["amount"])
    except (TypeError, ValueError):
        return "amount must be numeric"

    if amount <= 0:
        return "amount must be greater than 0"

    booking = payload.get("booking") or {}
    for field in ["hotelName", "destination", "checkInDate", "checkOutDate", "guests"]:
        if not booking.get(field):
            return f"booking.{field} is required"

    return None


@app.get("/")
def health_check():
    return jsonify({"message": "Travel Planner ML API is running."})


@app.post("/recommend")
def recommend_destinations():
    payload = request.get_json(silent=True) or {}
    validation_error = validate_destination_payload(payload)
    if validation_error:
        return jsonify({"error": validation_error}), 400

    user_frame = build_destination_request_frame(payload)
    transformed_user = destination_pipeline.transform(user_frame[DESTINATION_FEATURES])
    _, indices = destination_model.kneighbors(transformed_user, n_neighbors=3)

    recommendations = destinations_df.iloc[indices[0]]["destination_name"].tolist()
    return jsonify({"recommendations": recommendations})


@app.post("/recommend-hotels")
def recommend_hotels():
    payload = request.get_json(silent=True) or {}
    validation_error = validate_hotel_payload(payload)
    if validation_error:
        return jsonify({"error": validation_error}), 400

    past_choice_profile = get_past_choice_profile(payload.get("past_choices", []))
    user_frame = build_hotel_request_frame(payload, preference_profile=past_choice_profile)

    # KNN returns a candidate set of similar hotels.
    transformed_user = hotel_pipeline.transform(user_frame[HOTEL_FEATURES])
    distances, indices = hotel_model.kneighbors(transformed_user, n_neighbors=min(6, len(hotels_df)))

    ranked_results = []
    for distance, hotel_index in zip(distances[0], indices[0]):
        hotel = hotels_df.iloc[hotel_index]
        score = score_hotel_row(hotel, payload, distance, past_choice_profile)
        ranked_results.append(
            {
                "hotel_name": hotel["hotel_name"],
                "rating": float(hotel["rating"]),
                "price_per_night": float(hotel["price_per_night"]),
                "location_preference": hotel["location_preference"],
                "amenities": {
                    "wifi": bool(hotel["wifi"]),
                    "parking": bool(hotel["parking"]),
                    "breakfast": bool(hotel["breakfast"]),
                },
                "score": round(score, 4),
            }
        )

    # The chatbot can read this ordered list from best to least suitable.
    ranked_results.sort(key=lambda item: item["score"], reverse=True)

    return jsonify(
        {
            "recommendations": ranked_results[:3],
            "message": "Hotels ranked from best to least suitable.",
        }
    )


@app.post("/recommend-attractions")
def recommend_attractions():
    payload = request.get_json(silent=True) or {}
    destination = (payload.get("destination") or "").strip()
    preferences = payload.get("preferences") or {}

    if not destination:
        return jsonify({"error": "destination is required"}), 400

    preference_text = ", ".join(
        str(value).strip()
        for value in preferences.values()
        if value is not None and str(value).strip()
    )

    prompt = (
        "Recommend 5 tourist attractions for a travel itinerary. "
        "Use the destination and preferences to personalize the list. "
        "Return only valid JSON as an array of objects with name and reason fields. "
        f"Destination: {destination}. "
        f"Preferences: {preference_text or 'general sightseeing and memorable local experiences'}."
    )

    try:
        ollama_resp = http_req.post(
            OLLAMA_API_URL,
            json={"model": OLLAMA_MODEL, "prompt": prompt, "stream": False},
            timeout=OLLAMA_TIMEOUT_SECONDS,
        )
        ollama_resp.raise_for_status()
        raw_response = ollama_resp.json().get("response", "")
        attractions = parse_attraction_response(raw_response)
        return jsonify({"attractions": attractions, "raw": raw_response})
    except http_req.exceptions.ConnectionError:
        return jsonify({"error": "Ollama is not running. Start it with: ollama serve"}), 503
    except http_req.exceptions.ReadTimeout:
        return jsonify(
            {
                "error": (
                    f"Ollama took longer than {OLLAMA_TIMEOUT_SECONDS} seconds to respond. "
                    "Try again after the model finishes loading, or use a smaller model."
                )
            }
        ), 504
    except Exception as exc:
        return jsonify({"error": str(exc)}), 502


@app.post("/chat/gemini")
def chat_with_gemini():
    payload = request.get_json(silent=True) or {}
    message = (payload.get("message") or "").strip()
    if not message:
        return jsonify({"error": "message is required"}), 400

    try:
        reply = generate_travel_reply(message, payload.get("context") or {})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 503
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 502

    return jsonify({"reply": reply, "mode": "gemini", "places": [], "searchType": "general"})


@app.post("/chat/budget")
def chat_with_budget_ai():
    payload = request.get_json(silent=True) or {}
    destination = (payload.get("destination") or "").strip()
    days = payload.get("days")
    total_budget = payload.get("totalBudget")
    currency = (payload.get("currency") or "USD").strip().upper()

    if not destination:
        return jsonify({"error": "destination is required"}), 400

    try:
        days_value = int(days)
        budget_value = float(total_budget)
    except (TypeError, ValueError):
        return jsonify({"error": "days must be an integer and totalBudget must be numeric"}), 400

    if days_value <= 0 or budget_value <= 0:
        return jsonify({"error": "days and totalBudget must be greater than 0"}), 400

    try:
        result = generate_budget_reply(destination, days_value, budget_value, currency=currency)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 503
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 502

    return jsonify({"mode": "budget-ai", **result})


@app.post("/chat/places")
def chat_with_places():
    payload = request.get_json(silent=True) or {}
    message = (payload.get("message") or "").strip()
    if not message:
        return jsonify({"error": "message is required"}), 400

    search_type = payload.get("searchType") or classify_search_type(message)

    try:
        result = search_places(message, search_type, context=payload.get("context") or {})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 503
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 502

    return jsonify({"mode": "places", **result})


@app.post("/chat/message")
def chat_message():
    payload = request.get_json(silent=True) or {}
    message = (payload.get("message") or "").strip()
    if not message:
        return jsonify({"error": "message is required"}), 400

    try:
        result = handle_chat_message(message, payload.get("context") or {})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 503
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 502

    return jsonify(result)


@app.post("/payments/process")
def process_payment():
    payload = request.get_json(silent=True) or {}
    validation_error = validate_payment_payload(payload)
    if validation_error:
        return jsonify({"error": validation_error}), 400

    payment_method = payload["paymentMethod"]
    amount = round(float(payload["amount"]), 2)
    currency = str(payload.get("currency") or "USD").upper()
    payment_details = payload.get("paymentDetails") or {}
    card_last4 = ""

    # Simulate a gateway handoff. In production, replace this with Stripe/Adyen/etc.
    # Never store full card numbers or CVV in this app's database.
    if payment_method != "Pay at Hotel":
        card_last4 = normalize_card_number(payment_details.get("cardNumber"))[-4:]
        time.sleep(0.4)

    transaction_id = f"PAY-{uuid.uuid4().hex[:12].upper()}"
    booking_reference = f"HB-{uuid.uuid4().hex[:10].upper()}"

    return jsonify(
        {
            "ok": True,
            "transactionId": transaction_id,
            "bookingReference": booking_reference,
            "amount": amount,
            "currency": currency,
            "paymentMethod": payment_method,
            "paymentStatus": "Pending" if payment_method == "Pay at Hotel" else "Paid",
            "bookingStatus": "Confirmed",
            "cardLast4": card_last4,
            "gatewayMode": "mock-secure",
        }
    )


@app.post("/payments/crypto/confirm")
def confirm_crypto_payment():
    payload = request.get_json(silent=True) or {}
    validation_error = validate_crypto_confirmation_payload(payload)
    if validation_error:
        return jsonify({"error": validation_error}), 400

    amount = round(float(payload["amount"]), 2)
    currency = str(payload.get("currency") or "USD").upper()
    booking_reference = f"HB-BC-{uuid.uuid4().hex[:8].upper()}"

    # This records the wallet transaction metadata for a testnet/demo flow.
    # A production service should verify the transaction receipt through a trusted RPC provider.
    return jsonify(
        {
            "ok": True,
            "transactionId": f"CHAIN-{uuid.uuid4().hex[:12].upper()}",
            "bookingReference": booking_reference,
            "amount": amount,
            "currency": currency,
            "paymentMethod": "Blockchain/Crypto",
            "paymentStatus": "Confirmed on test network",
            "bookingStatus": "Confirmed",
            "txHash": payload["txHash"],
            "walletAddress": payload["walletAddress"],
            "chainId": payload["chainId"],
            "cryptoAmount": payload.get("cryptoAmount") or "",
            "gatewayMode": "blockchain-testnet",
        }
    )


@app.post("/weather-ai")
def weather_ai_suggestions():
    payload = request.get_json(silent=True) or {}
    city = (payload.get("city") or "").strip()
    weather = (payload.get("weather") or "").strip()
    temp = payload.get("temp")

    if not city or not weather or temp is None:
        return jsonify({"error": "city, weather, and temp are required"}), 400

    prompt = (
        f"Suggest 4 simple things to do in {city} when the weather is {weather} "
        f"and temperature is {temp}\u00b0C."
    )

    try:
        ollama_resp = http_req.post(
            OLLAMA_API_URL,
            json={"model": OLLAMA_MODEL, "prompt": prompt, "stream": False},
            timeout=OLLAMA_TIMEOUT_SECONDS,
        )
        ollama_resp.raise_for_status()
        suggestions = ollama_resp.json().get("response", "")
        return jsonify({"suggestions": suggestions})
    except http_req.exceptions.ConnectionError:
        return jsonify({"error": "Ollama is not running. Start it with: ollama serve"}), 503
    except http_req.exceptions.ReadTimeout:
        return jsonify(
            {
                "error": (
                    f"Ollama took longer than {OLLAMA_TIMEOUT_SECONDS} seconds to respond. "
                    "Try again after the model finishes loading, or use a smaller model."
                )
            }
        ), 504
    except Exception as exc:
        return jsonify({"error": str(exc)}), 502


if __name__ == "__main__":
    app.run(debug=True)
