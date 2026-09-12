import { parseDurationInput } from "./format.js";

export function getMissingTrackRatings(draft) {
  if (!draft) return 0;
  return draft.tracks.filter((track) => track.rating === undefined).length;
}

export function getDraftValidationErrors(draft) {
  if (!draft) return ["请先创建或选择一张专辑"];

  const errors = [];
  if (!draft.albumName.trim()) errors.push("请填写专辑名");
  if (!draft.artistName.trim()) errors.push("请填写歌手 / 乐队名");
  if (!draft.tracks.length) errors.push("请至少添加一首曲目");
  if (draft.overallScore === undefined) errors.push("请填写总评分");

  draft.tracks.forEach((track, index) => {
    const trackLabel = `第 ${index + 1} 首曲目`;
    if (!track.name.trim()) errors.push(`${trackLabel}缺少曲名`);

    const durationText = track.durationText || "";
    if (parseDurationInput(durationText) === undefined) {
      errors.push(`${trackLabel}的时长需使用 3:45 格式`);
    }

    if (track.rating === undefined) errors.push(`${trackLabel}尚未评分`);
  });

  return errors;
}

export function normalizeScoreInput(input) {
  const score = scoreFromInput(input.value);
  input.value = score === undefined ? "" : String(score);
  return score;
}

export function scoreFromInput(value) {
  if (String(value).trim() === "") return undefined;

  const score = Number(value);
  if (!Number.isFinite(score)) return undefined;
  return Math.max(0, Math.min(100, Math.round(score)));
}
