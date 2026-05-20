export const attractions = [
  {
    id: "bondi-beach",
    name: "Bondi Beach",
    location: "Sydney, Australia",
    category: "Beach",
    rating: 4.8,
    reviewCount: 1842,
    image:
      "https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?w=1000&auto=format&fit=crop",
    description:
      "A lively coastal icon known for golden sand, surf culture, ocean pools, and scenic cliff walks.",
    highlights: ["Surf lessons", "Bondi to Coogee walk", "Beachfront cafes"],
    reviews: [
      "Beautiful beach with a great walking track nearby.",
      "Busy but worth it for the views and atmosphere.",
    ],
    mapQuery: "Bondi Beach Sydney Australia",
  },
  {
    id: "central-park",
    name: "Central Park",
    location: "New York, United States",
    category: "City",
    rating: 4.9,
    reviewCount: 3620,
    image:
      "https://images.unsplash.com/photo-1533929736458-ca588d08c8be?w=1000&auto=format&fit=crop",
    description:
      "A huge urban park with lakes, gardens, walking paths, museums nearby, and classic skyline views.",
    highlights: ["Bethesda Terrace", "Bow Bridge", "Picnic lawns"],
    reviews: [
      "Perfect break from the city streets.",
      "So many paths, views, and quiet corners to discover.",
    ],
    mapQuery: "Central Park New York",
  },
  {
    id: "fiordland-national-park",
    name: "Fiordland National Park",
    location: "Southland, New Zealand",
    category: "Nature",
    rating: 4.9,
    reviewCount: 1284,
    image:
      "https://images.unsplash.com/photo-1507699622108-4be3abd695ad?w=1000&auto=format&fit=crop",
    description:
      "A dramatic wilderness of fjords, waterfalls, rainforest, alpine routes, and mirror-like lakes.",
    highlights: ["Milford Sound", "Hiking trails", "Boat cruises"],
    reviews: [
      "The scenery feels unreal in the best way.",
      "Milford Sound was the highlight of our entire trip.",
    ],
    mapQuery: "Fiordland National Park New Zealand",
  },
  {
    id: "eiffel-tower",
    name: "Eiffel Tower",
    location: "Paris, France",
    category: "Landmark",
    rating: 4.7,
    reviewCount: 4975,
    image:
      "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=1000&auto=format&fit=crop",
    description:
      "Paris' most recognizable landmark, offering city views, evening lights, and classic photo spots.",
    highlights: ["Observation decks", "Night lights", "Seine river views"],
    reviews: [
      "Go near sunset if you can, the views are amazing.",
      "Crowded, but the experience still feels special.",
    ],
    mapQuery: "Eiffel Tower Paris France",
  },
  {
    id: "arashiyama-bamboo-grove",
    name: "Arashiyama Bamboo Grove",
    location: "Kyoto, Japan",
    category: "Nature",
    rating: 4.6,
    reviewCount: 2310,
    image:
      "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=1000&auto=format&fit=crop",
    description:
      "A peaceful bamboo pathway near temples, river scenery, traditional streets, and mountain views.",
    highlights: ["Bamboo path", "Tenryu-ji Temple", "River walk"],
    reviews: [
      "Early morning is quiet and magical.",
      "A beautiful Kyoto stop with lots nearby.",
    ],
    mapQuery: "Arashiyama Bamboo Grove Kyoto Japan",
  },
  {
    id: "santorini-caldera",
    name: "Santorini Caldera",
    location: "Santorini, Greece",
    category: "Scenic",
    rating: 4.8,
    reviewCount: 2056,
    image:
      "https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=1000&auto=format&fit=crop",
    description:
      "A volcanic island viewpoint famous for white villages, blue domes, cliffside paths, and sunsets.",
    highlights: ["Oia sunset", "Caldera views", "Cliffside dining"],
    reviews: [
      "The views are exactly as beautiful as the photos.",
      "Great for slow walks and sunset planning.",
    ],
    mapQuery: "Santorini Caldera Greece",
  },
  {
    id: "marina-bay-sands",
    name: "Marina Bay Sands",
    location: "Singapore",
    category: "City",
    rating: 4.7,
    reviewCount: 3198,
    image:
      "https://images.unsplash.com/photo-1525625293386-3f8f99389edd?w=1000&auto=format&fit=crop",
    description:
      "A modern waterfront district with skyline views, gardens, shopping, dining, and light shows.",
    highlights: ["SkyPark views", "Gardens by the Bay", "Evening light show"],
    reviews: [
      "Clean, easy to explore, and stunning at night.",
      "The waterfront walk is excellent after dinner.",
    ],
    mapQuery: "Marina Bay Sands Singapore",
  },
  {
    id: "grand-canyon",
    name: "Grand Canyon South Rim",
    location: "Arizona, United States",
    category: "Nature",
    rating: 4.9,
    reviewCount: 4411,
    image:
      "https://images.unsplash.com/photo-1474044159687-1ee9f3a51722?w=1000&auto=format&fit=crop",
    description:
      "A vast canyon landscape with dramatic viewpoints, hiking routes, sunrise colors, and desert air.",
    highlights: ["Mather Point", "Rim Trail", "Sunrise viewpoints"],
    reviews: [
      "Photos do not prepare you for the scale.",
      "Easy to enjoy even without doing a long hike.",
    ],
    mapQuery: "Grand Canyon South Rim Arizona",
  },
];

export const attractionCategories = [
  "All",
  ...Array.from(new Set(attractions.map((item) => item.category))).sort(),
];
