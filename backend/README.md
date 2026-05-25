# Travel Planner ML Backend

Simple Flask backend with:

- machine learning recommendation endpoints for destinations and hotels
- Gemini-powered travel chat replies
- Google Places powered live place and hotel search

## Setup

```bash
cd backend
pip install -r requirements.txt
python run_server.py
```

The API runs at `http://127.0.0.1:5000`.

## Environment variables

Set these on the backend so secrets stay out of the frontend:

```bash
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.0-flash
GOOGLE_PLACES_API_KEY=your_google_places_key
OLLAMA_API_URL=http://localhost:11434/api/generate
OLLAMA_MODEL=gemma3:1b
```

## Endpoints

### `POST /recommend`

Destination recommendations based on:

- budget
- weather
- trip type
- days

Example request:

```json
{
  "budget": 800,
  "weather": "warm",
  "trip_type": "beach",
  "days": 5
}
```

Example response:

```json
{
  "recommendations": ["Bali", "Phuket", "Gold Coast"]
}
```

### `POST /recommend-hotels`

Hotel recommendations based on:

- past user choices
- rating
- budget
- location preference
- amenities such as wifi, parking, breakfast

Example chatbot request:

```json
{
  "budget": 100,
  "location_preference": "city centre",
  "amenities": ["wifi"],
  "past_choices": ["City Centre Budget Inn", "Downtown Smart Stay"]
}
```

Example response:

```json
{
  "message": "Hotels ranked from best to least suitable.",
  "recommendations": [
    {
      "hotel_name": "City Centre Budget Inn",
      "rating": 4.1,
      "price_per_night": 85.0,
      "location_preference": "city centre",
      "amenities": {
        "wifi": true,
        "parking": false,
        "breakfast": true
      },
      "score": 0.9012
    }
  ]
}
```

## Chatbot usage

For a message like:

`Find me a cheap hotel near city centre with free wifi`

the chatbot can convert it into:

```json
{
  "budget": 100,
  "location_preference": "city centre",
  "amenities": ["wifi"],
  "past_choices": []
}
```

Then call `POST /recommend-hotels` and show the ranked results.

### `POST /chat/message`

Main chatbot workflow route.

- Uses Google Places for live place, hotel, attraction, and nearby searches
- Uses Gemini for natural-language travel guidance and advice

Example request:

```json
{
  "message": "Find hotels in Queenstown with ratings",
  "context": {
    "latestBooking": {
      "hotelName": "Lake View Hotel",
      "destination": "Queenstown, New Zealand"
    }
  }
}
```

### `POST /chat/gemini`

Direct Gemini route for travel-assistant style replies.

### `POST /chat/places`

Direct Google Places route for live place lookup.

### `POST /recommend-attractions`

Ollama-powered attraction and live-event-style ideas for itinerary planning. When
`GOOGLE_PLACES_API_KEY` is configured, the backend first gathers current Google
Places matches and passes that context to Ollama.
