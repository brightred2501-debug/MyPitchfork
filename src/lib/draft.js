import { isAppleArtworkUrl, normalizeArtworkUrl } from "./artwork.js";

export function createEmptyDraft(country = "us") {
  return {
    source: "manual",
    collectionId: undefined,
    albumName: "",
    artistName: "",
    artworkUrl: "",
    sourceArtworkUrl: "",
    country,
    overallScore: undefined,
    comment: "",
    tracks: [],
    updatedAt: new Date().toISOString(),
  };
}

export function createEmptyTrack({ discNumber = 1, trackNumber = 1 } = {}) {
  return {
    id: createTrackId(),
    discNumber,
    trackNumber,
    name: "",
    durationMs: undefined,
    durationText: "",
    liked: false,
    rating: undefined,
  };
}

export function normalizeTrack(track, index = 0) {
  const durationMs =
    Number.isFinite(track?.durationMs) && track.durationMs >= 0 ? track.durationMs : undefined;
  const durationText =
    typeof track?.durationText === "string"
      ? track.durationText
      : durationMs === undefined
        ? ""
        : formatDurationText(durationMs);

  return {
    ...track,
    id: track?.id || createTrackId(),
    discNumber: Number(track?.discNumber) > 0 ? Number(track.discNumber) : 1,
    trackNumber: Number(track?.trackNumber) > 0 ? Number(track.trackNumber) : index + 1,
    name: typeof track?.name === "string" ? track.name : "",
    durationMs,
    durationText,
    liked: Boolean(track?.liked),
    rating: normalizeScore(track?.rating),
  };
}

export function normalizeDraft(draft, country = "us") {
  if (!draft || !Array.isArray(draft.tracks)) return null;

  const overallScore = normalizeScore(draft.overallScore);

  return {
    ...createEmptyDraft(country),
    ...draft,
    source: draft.source || (draft.collectionId ? "itunes" : "manual"),
    albumName: typeof draft.albumName === "string" ? draft.albumName : "",
    artistName: typeof draft.artistName === "string" ? draft.artistName : "",
    artworkUrl: normalizeArtworkUrl(draft.artworkUrl),
    sourceArtworkUrl: isAppleArtworkUrl(draft.sourceArtworkUrl) ? draft.sourceArtworkUrl : "",
    country: draft.country || country,
    overallScore,
    comment: typeof draft.comment === "string" ? draft.comment : "",
    tracks: draft.tracks.map(normalizeTrack),
    updatedAt: draft.updatedAt || new Date().toISOString(),
  };
}

export function renumberTracks(tracks) {
  const counters = new Map();

  return tracks.map((track) => {
    const discNumber = Number(track.discNumber) > 0 ? Number(track.discNumber) : 1;
    const trackNumber = (counters.get(discNumber) || 0) + 1;
    counters.set(discNumber, trackNumber);
    return { ...track, discNumber, trackNumber };
  });
}

function createTrackId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `track-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return undefined;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function formatDurationText(durationMs) {
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
