import { upgradeArtworkUrl } from "../lib/artwork.js";
import { formatDurationInput } from "../lib/format.js";

const ITUNES_SEARCH_URL = "https://itunes.apple.com/search";
const ITUNES_LOOKUP_URL = "https://itunes.apple.com/lookup";

export async function searchAlbums(term, country) {
  const data = await requestJsonp(ITUNES_SEARCH_URL, {
    term,
    media: "music",
    entity: "album",
    limit: "10",
    country,
  });
  const seen = new Set();

  return (data.results || [])
    .filter((item) => item.collectionId && !seen.has(item.collectionId))
    .map((item) => {
      seen.add(item.collectionId);

      return {
        collectionId: item.collectionId,
        source: "itunes",
        albumName: item.collectionName || "Untitled Album",
        artistName: item.artistName || "Unknown Artist",
        artworkUrl: upgradeArtworkUrl(item.artworkUrl100 || ""),
        releaseDate: item.releaseDate,
        trackCount: item.trackCount,
        genre: item.primaryGenreName,
        country,
      };
    });
}

export async function fetchAlbumDraft(album, country) {
  const data = await requestJsonp(ITUNES_LOOKUP_URL, {
    id: String(album.collectionId),
    entity: "song",
    country,
  });
  const collection = (data.results || []).find((item) => item.wrapperType === "collection");
  const tracks = (data.results || [])
    .filter((item) => item.wrapperType === "track" && item.kind === "song" && item.trackName)
    .map((item, index) => ({
      id: item.trackId || `${item.discNumber || 1}-${item.trackNumber || index + 1}-${item.trackName}`,
      discNumber: item.discNumber || 1,
      trackNumber: item.trackNumber || index + 1,
      name: item.trackName,
      durationMs: item.trackTimeMillis,
      durationText: formatDurationInput(item.trackTimeMillis),
      liked: false,
      rating: undefined,
    }))
    .sort((a, b) => a.discNumber - b.discNumber || a.trackNumber - b.trackNumber);

  if (!tracks.length) {
    throw new Error("没有找到曲目");
  }

  return {
    source: "itunes",
    collectionId: album.collectionId,
    albumName: (collection && collection.collectionName) || album.albumName,
    artistName: (collection && collection.artistName) || album.artistName,
    artworkUrl: upgradeArtworkUrl((collection && collection.artworkUrl100) || album.artworkUrl),
    sourceArtworkUrl: (collection && collection.artworkUrl100) || album.artworkUrl,
    country,
    overallScore: undefined,
    comment: "",
    tracks,
    updatedAt: new Date().toISOString(),
  };
}

export function requestJsonp(endpoint, params) {
  return new Promise((resolve, reject) => {
    const callbackName = `myPitchforkItunes_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const script = document.createElement("script");
    const requestUrl = new URL(endpoint);

    Object.entries(params).forEach(([key, value]) => {
      requestUrl.searchParams.set(key, value);
    });
    requestUrl.searchParams.set("callback", callbackName);

    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("iTunes 请求超时"));
    }, 12000);

    function cleanup() {
      window.clearTimeout(timeout);
      script.remove();
      delete window[callbackName];
    }

    window[callbackName] = (payload) => {
      cleanup();
      resolve(payload);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("无法连接 iTunes"));
    };

    script.src = requestUrl.toString();
    document.head.appendChild(script);
  });
}
