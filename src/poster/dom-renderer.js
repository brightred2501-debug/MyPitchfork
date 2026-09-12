import { artworkRequestUrl } from "../lib/artwork.js";
import { formatDuration } from "../lib/format.js";

export function renderPoster(poster, draft) {
  poster.textContent = "";

  if (!draft) {
    poster.className = "poster poster--empty";
    const mark = document.createElement("div");
    mark.className = "poster-empty-mark";
    appendText(mark, "span", "♪");
    appendText(mark, "span", "MyPitchfork");
    poster.appendChild(mark);
    return;
  }

  poster.className = "poster";
  if (draft.tracks.length > 22) {
    poster.classList.add("poster--extended");
  } else if (draft.tracks.length > 16) {
    poster.classList.add("poster--dense");
  }

  const header = document.createElement("header");
  header.className = "poster-header";
  const kicker = document.createElement("p");
  kicker.className = "poster-kicker";
  appendText(kicker, "span", "BELREY", "poster-kicker__brand");
  kicker.appendChild(document.createTextNode(" Album Review"));
  header.appendChild(kicker);
  appendText(header, "h2", draft.albumName || "Untitled Album");
  appendText(header, "p", draft.artistName || "Unknown Artist");
  poster.appendChild(header);

  const main = document.createElement("section");
  main.className = "poster-main";

  const artwork = document.createElement("div");
  artwork.className = "poster-artwork";
  if (draft.artworkUrl) {
    const image = document.createElement("img");
    image.alt = `${draft.albumName} 封面`;
    if (draft.artworkUrl.startsWith("https:")) image.crossOrigin = "anonymous";
    image.referrerPolicy = "no-referrer";
    image.src = artworkRequestUrl(draft.artworkUrl);
    image.onerror = () => {
      artwork.textContent = "";
      const fallback = document.createElement("span");
      fallback.className = "poster-artwork__fallback";
      fallback.textContent = "♪";
      artwork.appendChild(fallback);
    };
    artwork.appendChild(image);
  } else {
    const fallback = document.createElement("span");
    fallback.className = "poster-artwork__fallback";
    fallback.textContent = "♪";
    artwork.appendChild(fallback);
  }
  main.appendChild(artwork);

  const score = document.createElement("div");
  score.className = "score-circle";
  if (draft.overallScore !== undefined && draft.overallScore >= 90) {
    score.classList.add("score-circle--hot");
  }
  appendText(score, "span", draft.overallScore === undefined ? "--" : String(draft.overallScore));
  main.appendChild(score);
  poster.appendChild(main);

  if ((draft.comment || "").trim()) {
    appendText(poster, "p", draft.comment.trim(), "poster-comment");
  }

  const trackList = document.createElement("section");
  trackList.className = "poster-tracklist";
  draft.tracks.forEach((track) => {
    const row = document.createElement("div");
    row.className = "poster-track";
    appendText(row, "span", `${track.discNumber > 1 ? `${track.discNumber}.` : ""}${track.trackNumber}`, "poster-track__number");
    appendText(row, "span", track.name, "poster-track__name");
    appendText(
      row,
      "span",
      track.durationText || formatDuration(track.durationMs),
      "poster-track__duration",
    );
    const heart = appendText(row, "span", track.liked ? "♥" : "", "poster-track__heart");
    heart.setAttribute("aria-hidden", "true");
    appendText(row, "span", track.rating === undefined ? "--" : String(track.rating), "poster-track__score");
    trackList.appendChild(row);
  });
  poster.appendChild(trackList);
}

function appendText(parent, tagName, text, className) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text;
  parent.appendChild(element);
  return element;
}
