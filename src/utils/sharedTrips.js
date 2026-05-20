import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase";

const GROUP_TRIPS_COLLECTION = "groupTrips";

function normalizeEmail(email) {
  return (email || "").trim().toLowerCase();
}

function uniqueEmails(emails) {
  return [...new Set((emails || []).map(normalizeEmail).filter(Boolean))];
}

function mergeDocs(docs) {
  const byId = new Map();
  docs.forEach((entry) => {
    byId.set(entry.id, { id: entry.id, ...entry.data() });
  });
  return [...byId.values()];
}

export function parseCollaboratorEmails(value) {
  return uniqueEmails(String(value || "").split(/[,\n;]/));
}

export function formatCollaboratorEmails(emails) {
  return uniqueEmails(emails).join(", ");
}

export async function loadSharedTrips(user) {
  if (!user?.uid) return [];

  const userEmail = normalizeEmail(user.email);
  const tripRef = collection(db, GROUP_TRIPS_COLLECTION);
  const requests = [getDocs(query(tripRef, where("ownerUid", "==", user.uid)))];

  if (userEmail) {
    requests.push(getDocs(query(tripRef, where("collaboratorEmails", "array-contains", userEmail))));
  }

  try {
    const snaps = await Promise.all(requests);
    return mergeDocs(snaps.flatMap((snap) => snap.docs));
  } catch (_) {
    return [];
  }
}

export async function saveSharedTrip(user, trip) {
  if (!user?.uid || !trip?.id) return { ok: false, error: "Missing group trip details." };

  const ownerEmail = normalizeEmail(trip.ownerEmail || user.email);
  const collaboratorEmails = uniqueEmails(trip.collaboratorEmails).filter((email) => email !== ownerEmail);
  const editorEmails = uniqueEmails([ownerEmail, ...collaboratorEmails]);

  const payload = {
    ...trip,
    ownerUid: trip.ownerUid || user.uid,
    ownerName: trip.ownerName || user.displayName || user.name || ownerEmail || "Trip owner",
    ownerEmail,
    collaboratorEmails,
    editorEmails,
    isGroupPlan: true,
    updatedAt: serverTimestamp(),
  };

  if (!payload.createdAt) {
    payload.createdAt = new Date().toISOString();
  }

  try {
    await setDoc(doc(db, GROUP_TRIPS_COLLECTION, trip.id), payload, { merge: true });
    return { ok: true, data: payload };
  } catch (error) {
    return { ok: false, error: error?.message || "Could not save group travel plan." };
  }
}

export async function deleteSharedTrip(user, trip) {
  if (!user?.uid || !trip?.id || trip.ownerUid !== user.uid) {
    return { ok: false, error: "Only the owner can delete this group travel plan." };
  }

  try {
    await deleteDoc(doc(db, GROUP_TRIPS_COLLECTION, trip.id));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || "Could not delete group travel plan." };
  }
}
