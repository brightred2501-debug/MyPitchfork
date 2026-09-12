export function formatDuration(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs < 0) return "--";

  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatDurationInput(durationMs) {
  return Number.isFinite(durationMs) && durationMs >= 0 ? formatDuration(durationMs) : "";
}

export function parseDurationInput(value) {
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d+):([0-5]\d)$/);
  if (!match) return undefined;

  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  return (minutes * 60 + seconds) * 1000;
}

export function releaseYear(releaseDate) {
  if (!releaseDate) return "";

  const year = new Date(releaseDate).getFullYear();
  return Number.isFinite(year) ? String(year) : "";
}

export function sanitizeFilename(value) {
  return (
    value
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
      .replace(/\s+/g, " ")
      .trim() || "my-pitchfork-rating"
  );
}

export function posterFilename(draft) {
  return sanitizeFilename(`${draft.artistName} - ${draft.albumName} rating.png`);
}
