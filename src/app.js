import { fetchAlbumDraft, searchAlbums } from "./api/itunes.js";
import { drawPosterCanvas, downloadCanvas } from "./poster/canvas-renderer.js";
import { renderPoster } from "./poster/dom-renderer.js";
import { createEmptyDraft, createEmptyTrack, normalizeDraft, renumberTracks } from "./lib/draft.js";
import {
  artworkRequestUrl,
  createLocalArtwork,
  isAppleArtworkUrl,
  isLocalArtworkUrl,
} from "./lib/artwork.js";
import {
  formatDurationInput,
  parseDurationInput,
  posterFilename,
  releaseYear,
} from "./lib/format.js";
import { loadStoredDraft, persistDraft } from "./lib/storage.js";
import {
  getDraftValidationErrors,
  normalizeScoreInput,
} from "./lib/validation.js";

const state = {
  query: "",
  country: "us",
  results: [],
  status: "idle",
  loadingAlbumId: undefined,
  draft: loadStoredDraft(),
  notice: "",
  exporting: false,
};

const els = {};

window.addEventListener("DOMContentLoaded", init);

function init() {
  [
    "album-name-input",
    "app-notice",
    "artist-name-input",
    "artwork-file-input",
    "artwork-help",
    "add-track-button",
    "clear-button",
    "comment-input",
    "completion-pill",
    "country-select",
    "download-button",
    "download-label",
    "editor-empty",
    "editor-fields",
    "empty-results",
    "manual-create-button",
    "overall-score-input",
    "poster",
    "query-input",
    "remove-artwork-button",
    "reset-button",
    "result-list",
    "search-alert",
    "search-button",
    "search-form",
    "search-label",
    "track-editor-body",
  ].forEach((id) => {
    els[toCamelCase(id)] = getElement(id);
  });

  bindEvents();
  renderAll();
}

function bindEvents() {
  els.searchForm.addEventListener("submit", handleSearch);
  els.queryInput.addEventListener("input", (event) => {
    state.query = event.target.value;
    renderSearchButton();
  });
  els.countrySelect.addEventListener("change", (event) => {
    state.country = event.target.value;
  });
  els.manualCreateButton.addEventListener("click", handleCreateManualDraft);
  els.clearButton.addEventListener("click", resetCurrentDraft);
  els.resetButton.addEventListener("click", resetCurrentDraft);
  els.addTrackButton.addEventListener("click", addTrack);
  els.downloadButton.addEventListener("click", handleDownload);
  els.artworkFileInput.addEventListener("change", handleArtworkUpload);
  els.removeArtworkButton.addEventListener("click", removeArtwork);

  els.albumNameInput.addEventListener("input", (event) => {
    if (!state.draft) return;
    state.draft.albumName = event.target.value;
    touchDraft();
    renderPosterView();
    renderDownloadState();
  });
  els.artistNameInput.addEventListener("input", (event) => {
    if (!state.draft) return;
    state.draft.artistName = event.target.value;
    touchDraft();
    renderPosterView();
    renderDownloadState();
  });
  els.overallScoreInput.addEventListener("input", (event) => {
    if (!state.draft) return;
    const score = normalizeScoreInput(event.target);
    state.draft.overallScore = score;
    touchDraft();
    renderPosterView();
    renderDownloadState();
  });
  els.commentInput.addEventListener("input", (event) => {
    if (!state.draft) return;
    state.draft.comment = event.target.value;
    touchDraft();
    renderPosterView();
  });
}

async function handleArtworkUpload(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!state.draft || !file) return;

  try {
    const artworkUrl = await createLocalArtwork(file);
    state.draft.artworkUrl = artworkUrl;
    touchDraft();
    renderArtworkControls();
    renderPosterView();
    setNotice("封面已保存在当前浏览器中，不会上传到服务器");
  } catch (error) {
    setNotice(error instanceof Error ? error.message : "封面读取失败");
  }
}

function removeArtwork() {
  if (!state.draft) return;
  state.draft.artworkUrl = "";
  touchDraft();
  renderArtworkControls();
  renderPosterView();
  setNotice("已移除封面");
}

async function handleSearch(event) {
  event.preventDefault();

  const query = state.query.trim();
  if (!query) return;

  state.status = "loading";
  state.results = [];
  renderSearchState();
  setNotice("");

  try {
    const albums = await searchAlbums(query, state.country);
    state.results = albums;
    state.status = albums.length ? "success" : "empty";
  } catch (error) {
    state.status = "error";
    state.results = [];
    els.searchAlert.textContent = error instanceof Error ? error.message : "搜索失败";
  }

  renderSearchState();
}

function handleCreateManualDraft() {
  if (!confirmDraftReplacement()) return;

  state.draft = createEmptyDraft(state.country);
  state.results = [];
  state.status = "idle";
  saveDraft();
  setNotice("已创建空白专辑草稿");
  renderAll();
  els.albumNameInput.focus();
}

async function handleSelectAlbum(album) {
  if (!confirmDraftReplacement()) return;

  state.loadingAlbumId = album.collectionId;
  renderResults();
  setNotice("");

  try {
    state.draft = normalizeDraft(await fetchAlbumDraft(album, state.country), state.country);
    saveDraft();
    setNotice("专辑已载入");
    renderAll();
  } catch (error) {
    setNotice(error instanceof Error ? error.message : "曲目载入失败");
  } finally {
    state.loadingAlbumId = undefined;
    renderResults();
  }
}

async function handleDownload() {
  const errors = getDraftValidationErrors(state.draft);
  if (errors.length) {
    const extraCount = errors.length - 1;
    setNotice(`${errors[0]}${extraCount > 0 ? `（还有 ${extraCount} 项待完成）` : ""}`);
    return;
  }

  state.exporting = true;
  renderDownloadState();
  setNotice("");

  try {
    const canvas = await drawPosterCanvas(state.draft);
    await downloadCanvas(canvas, posterFilename(state.draft));
    setNotice("PNG 已生成");
  } catch (error) {
    setNotice(error instanceof Error ? error.message : "图片导出失败");
  } finally {
    state.exporting = false;
    renderDownloadState();
  }
}

function resetCurrentDraft() {
  if (!state.draft) return;
  if (!confirmDraftReplacement()) return;

  state.draft = null;
  saveDraft();
  setNotice("已清空当前专辑，请重新创建或选择专辑");
  renderAll();
}

function addTrack() {
  if (!state.draft) return;

  const lastTrack = state.draft.tracks[state.draft.tracks.length - 1];
  const discNumber = state.draft.source === "itunes" && lastTrack ? lastTrack.discNumber : 1;
  state.draft.tracks = renumberTracks([
    ...state.draft.tracks,
    createEmptyTrack({ discNumber }),
  ]);
  touchDraft();
  renderEditor();
  renderPosterView();
  renderDownloadState();

  const trackNameInputs = els.trackEditorBody.querySelectorAll(".track-name-input");
  trackNameInputs[trackNameInputs.length - 1]?.focus();
}

function removeTrack(trackId) {
  if (!state.draft) return;

  state.draft.tracks = renumberTracks(state.draft.tracks.filter((track) => track.id !== trackId));
  touchDraft();
  renderEditor();
  renderPosterView();
  renderDownloadState();
}

function renderAll() {
  els.queryInput.value = state.query;
  els.countrySelect.value = state.country;
  renderSearchState();
  renderEditor();
  renderPosterView();
  renderDownloadState();
  renderNotice();
}

function renderSearchState() {
  renderSearchButton();
  renderResults();

  els.searchAlert.hidden = state.status !== "error";
  els.emptyResults.hidden = state.status !== "empty";

  if (state.status !== "error") {
    els.searchAlert.textContent = "";
  }
}

function renderSearchButton() {
  const isLoading = state.status === "loading";
  els.searchButton.disabled = !state.query.trim() || isLoading;
  els.searchLabel.textContent = isLoading ? "搜索中" : "搜索";
}

function renderResults() {
  els.resultList.textContent = "";

  state.results.forEach((album) => {
    const button = document.createElement("button");
    button.className = "album-result";
    button.disabled = Boolean(state.loadingAlbumId);
    button.type = "button";

    if (state.draft && state.draft.collectionId === album.collectionId) {
      button.classList.add("album-result--selected");
    }

    if (album.artworkUrl) {
      const image = document.createElement("img");
      image.alt = `${album.albumName} 封面`;
      image.className = "album-result__artwork";
      image.referrerPolicy = "no-referrer";
      image.src = artworkRequestUrl(album.artworkUrl);
      button.appendChild(image);
    } else {
      const placeholder = document.createElement("span");
      placeholder.className = "album-result__placeholder";
      placeholder.textContent = "♪";
      button.appendChild(placeholder);
    }

    const body = document.createElement("span");
    body.className = "album-result__body";
    appendText(body, "strong", album.albumName);
    appendText(body, "span", album.artistName);
    appendText(
      body,
      "small",
      [releaseYear(album.releaseDate), album.trackCount ? `${album.trackCount} 首` : "", album.genre]
        .filter(Boolean)
        .join(" / "),
    );
    button.appendChild(body);

    const action = document.createElement("span");
    action.className = "album-result__action";
    action.textContent = state.loadingAlbumId === album.collectionId ? "载入中" : "选择";
    button.appendChild(action);

    button.addEventListener("click", () => handleSelectAlbum(album));
    els.resultList.appendChild(button);
  });
}

function renderEditor() {
  const hasDraft = Boolean(state.draft);
  els.editorEmpty.hidden = hasDraft;
  els.editorFields.hidden = !hasDraft;
  els.clearButton.disabled = !hasDraft;

  if (!state.draft) {
    els.trackEditorBody.textContent = "";
    return;
  }

  els.albumNameInput.value = state.draft.albumName;
  els.artistNameInput.value = state.draft.artistName;
  renderArtworkControls();
  els.overallScoreInput.value =
    state.draft.overallScore === undefined ? "" : String(state.draft.overallScore);
  els.commentInput.value = state.draft.comment || "";
  renderTrackEditor();
}

function renderArtworkControls() {
  if (!state.draft) return;

  const hasArtwork = Boolean(state.draft.artworkUrl);
  els.removeArtworkButton.disabled = !hasArtwork;

  if (isLocalArtworkUrl(state.draft.artworkUrl)) {
    els.artworkHelp.textContent = "正在使用本机上传的图片；图片仅保存在此浏览器中。";
  } else if (isAppleArtworkUrl(state.draft.artworkUrl)) {
    els.artworkHelp.textContent = "正在使用 Apple 提供的封面，也可以上传图片替换。";
  } else {
    els.artworkHelp.textContent = "Apple 未提供封面时，可上传 JPG、PNG 或 WebP（最大 10 MB）。";
  }
}

function renderTrackEditor() {
  els.trackEditorBody.textContent = "";

  if (!state.draft.tracks.length) {
    const empty = document.createElement("p");
    empty.className = "muted-state track-editor__empty";
    empty.textContent = "还没有曲目，请添加第一首";
    els.trackEditorBody.appendChild(empty);
    return;
  }

  state.draft.tracks.forEach((track) => {
    const row = document.createElement("div");
    row.className = "track-editor__row";
    row.classList.toggle("track-editor__row--incomplete", isTrackIncomplete(track));

    const nameCell = document.createElement("div");
    nameCell.className = "track-editor__name-cell";

    const number = document.createElement("span");
    number.className = "track-editor__number";
    number.textContent = `${track.discNumber > 1 ? `${track.discNumber}.` : ""}${track.trackNumber}`;
    nameCell.appendChild(number);

    const nameInput = document.createElement("input");
    nameInput.className = "track-name-input";
    nameInput.placeholder = "曲名";
    nameInput.type = "text";
    nameInput.value = track.name;
    nameInput.setAttribute("aria-label", `第 ${track.trackNumber} 首曲目名称`);
    nameInput.addEventListener("input", () => {
      track.name = nameInput.value;
      updateTrackRowState(row, track);
      touchDraft();
      renderPosterView();
      renderDownloadState();
    });
    nameCell.appendChild(nameInput);
    row.appendChild(nameCell);

    const durationInput = document.createElement("input");
    durationInput.className = "track-duration-input";
    durationInput.inputMode = "numeric";
    durationInput.placeholder = "3:45";
    durationInput.type = "text";
    durationInput.value = track.durationText || formatDurationInput(track.durationMs);
    durationInput.setAttribute("aria-label", `${track.name || `第 ${track.trackNumber} 首曲目`}时长`);
    durationInput.addEventListener("input", () => {
      track.durationText = durationInput.value;
      track.durationMs = parseDurationInput(durationInput.value);
      updateTrackRowState(row, track);
      touchDraft();
      renderPosterView();
      renderDownloadState();
    });
    row.appendChild(durationInput);

    const heartButton = document.createElement("button");
    heartButton.className = "track-heart-toggle";
    heartButton.type = "button";
    heartButton.textContent = "♥";
    heartButton.title = "标记喜欢";
    heartButton.setAttribute("aria-label", `${track.name || `第 ${track.trackNumber} 首曲目`}喜欢`);
    updateHeartButton(heartButton, track.liked);
    heartButton.addEventListener("click", () => {
      track.liked = !track.liked;
      updateHeartButton(heartButton, track.liked);
      touchDraft();
      renderPosterView();
    });
    row.appendChild(heartButton);

    const scoreInput = document.createElement("input");
    scoreInput.className = "score-input";
    scoreInput.inputMode = "numeric";
    scoreInput.max = "100";
    scoreInput.min = "0";
    scoreInput.placeholder = "--";
    scoreInput.step = "1";
    scoreInput.type = "number";
    scoreInput.value = track.rating === undefined ? "" : String(track.rating);
    scoreInput.setAttribute("aria-label", `${track.name || `第 ${track.trackNumber} 首曲目`}评分`);
    scoreInput.addEventListener("input", () => {
      track.rating = normalizeScoreInput(scoreInput);
      updateTrackRowState(row, track);
      touchDraft();
      renderPosterView();
      renderDownloadState();
    });
    row.appendChild(scoreInput);

    const removeButton = document.createElement("button");
    removeButton.className = "track-remove-button";
    removeButton.type = "button";
    removeButton.textContent = "×";
    removeButton.title = "删除曲目";
    removeButton.setAttribute("aria-label", `删除${track.name || `第 ${track.trackNumber} 首曲目`}`);
    removeButton.addEventListener("click", () => removeTrack(track.id));
    row.appendChild(removeButton);

    els.trackEditorBody.appendChild(row);
  });
}

function isTrackIncomplete(track) {
  return (
    !track.name.trim() ||
    parseDurationInput(track.durationText || "") === undefined ||
    track.rating === undefined
  );
}

function updateTrackRowState(row, track) {
  row.classList.toggle("track-editor__row--incomplete", isTrackIncomplete(track));
}

function updateHeartButton(button, isLiked) {
  button.classList.toggle("track-heart-toggle--active", Boolean(isLiked));
  button.setAttribute("aria-pressed", isLiked ? "true" : "false");
}

function renderPosterView() {
  renderPoster(els.poster, state.draft);
}

function renderDownloadState() {
  const errors = getDraftValidationErrors(state.draft);
  els.downloadButton.disabled = !state.draft || state.exporting;
  els.downloadLabel.textContent = state.exporting ? "生成中" : "下载 PNG";
  els.resetButton.disabled = !state.draft;
  els.completionPill.hidden = !state.draft || errors.length === 0;
  els.completionPill.textContent = `${errors.length} 项待完成`;
}

function renderNotice() {
  els.appNotice.hidden = !state.notice;
  els.appNotice.textContent = state.notice;
}

function setNotice(message) {
  state.notice = message;
  renderNotice();
}

function touchDraft() {
  if (!state.draft) return;
  state.draft.updatedAt = new Date().toISOString();
  saveDraft();
}

function saveDraft() {
  try {
    persistDraft(state.draft);
  } catch {
    setNotice("草稿保存失败");
  }
}

function confirmDraftReplacement() {
  if (!state.draft) return true;
  return window.confirm("当前专辑仍在编辑，确定放弃当前内容并开始另一张专辑吗？");
}

function appendText(parent, tagName, text, className) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text;
  parent.appendChild(element);
  return element;
}

function getElement(id) {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing element #${id}`);
  }
  return element;
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}
