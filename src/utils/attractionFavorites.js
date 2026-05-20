import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebase";

const localKey = (uid) => `attraction_favorites_${uid || "guest"}`;

export async function loadAttractionFavorites(uid) {
  if (!uid) return [];

  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (snap.exists()) {
      const data = snap.data();
      const favorites = Array.isArray(data.attractionFavorites) ? data.attractionFavorites : [];
      localStorage.setItem(localKey(uid), JSON.stringify(favorites));
      return favorites;
    }
  } catch (_) {
    const cached = localStorage.getItem(localKey(uid));
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (_) {}
    }
  }

  return [];
}

export async function saveAttractionFavorites(uid, favorites) {
  if (!uid) return;

  localStorage.setItem(localKey(uid), JSON.stringify(favorites));

  try {
    await setDoc(
      doc(db, "users", uid),
      { attractionFavorites: favorites, updatedAt: serverTimestamp() },
      { merge: true }
    );
  } catch (_) {}
}
