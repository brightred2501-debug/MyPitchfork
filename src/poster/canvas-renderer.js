import { artworkRequestUrl } from "../lib/artwork.js";
import { formatDuration } from "../lib/format.js";
import {
  canvasFont,
  drawCenteredLines,
  drawLeftLines,
  limitLines,
  truncateCanvasText,
  wrapCanvasText,
} from "../lib/canvas-text.js";
import { getPosterTheme } from "./theme.js";

export async function drawPosterCanvas(draft) {
  const theme = getPosterTheme();
  // Wait before measuring, including when export starts before the first font paint.
  if (document.fonts) {
    await Promise.all([
      document.fonts.load(canvasFont(400, theme.trackSize, theme.fonts.sans)),
      document.fonts.load(canvasFont(500, theme.artistSize, theme.fonts.sans)),
      document.fonts.load(canvasFont(700, theme.scoreFont, theme.fonts.sans)),
      document.fonts.load(canvasFont(700, theme.titleSize, theme.fonts.serif)),
    ]);
    await document.fonts.ready;
  }
  const width = 1200;
  const margin = theme.margin;
  const scratch = document.createElement("canvas");
  const layout = calculateCanvasLayout(scratch.getContext("2d"), draft, width, margin, theme);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = Math.ceil(layout.height);
  const ctx = canvas.getContext("2d");
  const artwork = await loadImage(artworkRequestUrl(draft.artworkUrl)).catch(() => null);

  ctx.fillStyle = theme.surface;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = theme.inkSoft;
  ctx.lineWidth = theme.frameWidth;
  const frame = theme.frameInset + theme.frameWidth / 2;
  ctx.strokeRect(frame, frame, width - frame * 2, canvas.height - frame * 2);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  drawCanvasKicker(ctx, width / 2, layout.kickerY, theme);
  ctx.fillStyle = theme.ink;
  ctx.font = canvasFont(700, theme.titleSize, theme.fonts.serif);
  drawCenteredLines(ctx, layout.titleLines, width / 2,
    layout.titleY + lineBaseline(ctx, layout.titleLineHeight), layout.titleLineHeight);
  ctx.fillStyle = theme.inkSoft;
  ctx.font = canvasFont(500, theme.artistSize, theme.fonts.sans);
  drawCenteredLines(ctx, layout.artistLines, width / 2,
    layout.artistY + lineBaseline(ctx, layout.artistLineHeight), layout.artistLineHeight);

  drawArtwork(ctx, artwork, margin, layout.mainY, layout.coverSize, theme);
  drawScore(ctx, draft.overallScore, layout.scoreCenterX, layout.mainY + layout.coverSize / 2, theme);
  let cursorY = layout.afterMainY;
  if (layout.commentLines.length) {
    drawRule(ctx, margin, width - margin, cursorY, theme.lineStrong, theme.ruleWidth);
    ctx.textAlign = "left";
    ctx.fillStyle = theme.inkSoft;
    ctx.font = canvasFont(400, theme.commentSize, theme.fonts.sans);
    drawLeftLines(ctx, layout.commentLines, margin,
      cursorY + theme.ruleWidth + theme.commentPadding + lineBaseline(ctx, theme.commentHeight),
      theme.commentHeight);
    cursorY += layout.commentHeight;
    drawRule(ctx, margin, width - margin, cursorY - theme.ruleWidth, theme.lineStrong, theme.ruleWidth);
    cursorY += theme.commentGap;
  }
  drawCanvasTrackList(ctx, draft, {
    x: margin,
    y: cursorY,
    width: width - margin * 2,
    rowHeight: layout.trackRowHeight,
    fontSize: layout.trackFontSize,
  }, theme);
  return canvas;
}

export function calculateCanvasLayout(ctx, draft, width, margin, theme = getPosterTheme()) {
  const kickerY = theme.top;
  const titleY = kickerY + theme.kickerHeight + theme.kickerGap;
  const titleLineHeight = theme.titleHeight;
  const artistLineHeight = theme.artistHeight;
  ctx.font = canvasFont(700, theme.titleSize, theme.fonts.serif);
  const titleLines = limitLines(wrapCanvasText(ctx, draft.albumName || "Untitled Album", width - margin * 2), 3);
  const artistY = titleY + titleLines.length * titleLineHeight + theme.titleGap;
  ctx.font = canvasFont(500, theme.artistSize, theme.fonts.sans);
  const artistLines = limitLines(wrapCanvasText(ctx, draft.artistName || "Unknown Artist", width - margin * 2), 2);
  const mainY = artistY + artistLines.length * artistLineHeight + theme.headerGap;
  const coverSize = theme.coverSize;
  const afterMainY = mainY + coverSize + theme.mainGap;
  const scoreCenterX = width - margin - theme.scoreRight - theme.scoreSize / 2;
  ctx.font = canvasFont(400, theme.commentSize, theme.fonts.sans);
  const commentLines = draft.comment ? limitLines(wrapCanvasText(ctx, draft.comment.trim(), width - margin * 2), 4) : [];
  const commentHeight = commentLines.length
    ? theme.ruleWidth * 2 + theme.commentPadding * 2 + commentLines.length * theme.commentHeight : 0;
  const trackRowHeight = draft.tracks.length > 22 ? theme.extendedHeight : draft.tracks.length > 16 ? theme.denseHeight : theme.trackHeight;
  const trackFontSize = draft.tracks.length > 22 ? theme.extendedSize : draft.tracks.length > 16 ? theme.denseSize : theme.trackSize;
  const trackStartY = afterMainY + (commentLines.length ? commentHeight + theme.commentGap : 0);
  const height = trackStartY + theme.ruleWidth + draft.tracks.length * trackRowHeight + theme.bottom;
  return {
    afterMainY, artistLineHeight, artistLines, artistY, commentHeight, commentLines,
    coverSize, height, kickerY, mainY, scoreCenterX, titleLines, titleLineHeight,
    titleY, trackRowHeight, trackFontSize,
  };
}

// Match CSS line boxes, including the font's ascender and descender metrics.
function lineBaseline(ctx, lineHeight) {
  const metrics = ctx.measureText("Hg");
  return (lineHeight - metrics.fontBoundingBoxAscent - metrics.fontBoundingBoxDescent) / 2
    + metrics.fontBoundingBoxAscent;
}

function drawRule(ctx, left, right, y, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(left, y + width / 2);
  ctx.lineTo(right, y + width / 2);
  ctx.stroke();
}

function drawArtwork(ctx, image, x, y, size, theme) {
  ctx.save();
  ctx.shadowColor = theme.posterCoverShadow;
  ctx.shadowBlur = theme.shadowBlur;
  ctx.shadowOffsetY = theme.shadowY;
  ctx.fillStyle = theme.page;
  ctx.fillRect(x, y, size, size);
  ctx.shadowColor = "transparent";
  if (image) {
    const scale = Math.max(size / image.width, size / image.height);
    const sourceWidth = size / scale;
    const sourceHeight = size / scale;
    const sourceX = (image.width - sourceWidth) / 2;
    const sourceY = (image.height - sourceHeight) / 2;
    ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, size, size);
  } else {
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = theme.muted;
    ctx.font = canvasFont(400, 96, theme.fonts.sans);
    ctx.fillText("♪", x + size / 2, y + lineBaseline(ctx, size));
  }
  ctx.strokeStyle = theme.lineStrong;
  ctx.lineWidth = theme.coverBorder;
  const inset = theme.coverBorder / 2;
  ctx.strokeRect(x + inset, y + inset, size - theme.coverBorder, size - theme.coverBorder);
  ctx.restore();
}

function drawScore(ctx, score, centerX, centerY, theme) {
  const isHot = score !== undefined && score >= 90;
  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, (theme.scoreSize - theme.scoreBorder) / 2, 0, Math.PI * 2);
  ctx.fillStyle = theme.surface;
  ctx.fill();
  ctx.strokeStyle = isHot ? theme.accentRed : theme.ink;
  ctx.lineWidth = theme.scoreBorder;
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = isHot ? theme.accentRed : theme.ink;
  ctx.font = canvasFont(700, theme.scoreFont, theme.fonts.sans);
  ctx.fillText(score === undefined ? "--" : String(score), centerX,
    centerY - theme.scoreFont / 2 + lineBaseline(ctx, theme.scoreFont));
  ctx.restore();
}

function drawCanvasTrackList(ctx, draft, rect, theme) {
  ctx.save();
  drawRule(ctx, rect.x, rect.x + rect.width, rect.y, theme.lineStrong, theme.ruleWidth);
  const columns = {
    number: rect.x,
    name: rect.x + theme.numberWidth + theme.columnGap,
    duration: rect.x + rect.width - theme.ratingWidth - theme.heartWidth - theme.columnGap * 2,
    heart: rect.x + rect.width - theme.ratingWidth - theme.columnGap - theme.heartWidth / 2,
    score: rect.x + rect.width,
  };
  draft.tracks.forEach((track, index) => {
    const rowY = rect.y + theme.ruleWidth + index * rect.rowHeight;
    ctx.font = canvasFont(400, rect.fontSize, theme.fonts.sans);
    const textY = rowY + lineBaseline(ctx, rect.rowHeight - theme.ruleWidth);
    drawRule(ctx, rect.x, rect.x + rect.width,
      rowY + rect.rowHeight - theme.ruleWidth, theme.line, theme.ruleWidth);
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillStyle = theme.muted;
    ctx.fillText(`${track.discNumber > 1 ? `${track.discNumber}.` : ""}${track.trackNumber}`, columns.number, textY);
    ctx.fillStyle = theme.ink;
    ctx.font = canvasFont(500, rect.fontSize, theme.fonts.sans);
    const nameMaxWidth = columns.duration - theme.durationWidth - theme.columnGap - columns.name;
    ctx.fillText(truncateCanvasText(ctx, track.name, nameMaxWidth), columns.name, textY);
    ctx.textAlign = "right";
    ctx.fillStyle = theme.muted;
    ctx.font = canvasFont(400, rect.fontSize, theme.fonts.sans);
    ctx.fillText(track.durationText || formatDuration(track.durationMs), columns.duration, textY);
    if (track.liked) {
      drawCanvasHeart(ctx, columns.heart, textY - rect.fontSize * 0.3, rect.fontSize / 3, theme);
    }
    ctx.fillStyle = theme.ink;
    ctx.font = canvasFont(700, rect.fontSize, theme.fonts.sans);
    ctx.fillText(track.rating === undefined ? "--" : String(track.rating), columns.score, textY);
  });
  ctx.restore();
}

function drawCanvasKicker(ctx, centerX, y, theme) {
  const brand = "BERLEY";
  const label = " ALBUM REVIEW";
  ctx.save();
  ctx.font = canvasFont(700, theme.kickerSize, theme.fonts.sans);
  const brandWidth = ctx.measureText(brand).width;
  const baseline = y + lineBaseline(ctx, theme.kickerHeight);
  ctx.font = canvasFont(500, theme.kickerSize, theme.fonts.sans);
  const startX = centerX - (brandWidth + ctx.measureText(label).width) / 2;
  ctx.textAlign = "left";
  ctx.fillStyle = theme.inkSoft;
  ctx.font = canvasFont(700, theme.kickerSize, theme.fonts.sans);
  ctx.fillText(brand, startX, baseline);
  ctx.font = canvasFont(500, theme.kickerSize, theme.fonts.sans);
  ctx.fillText(label, startX + brandWidth, baseline);
  ctx.restore();
}

function drawCanvasHeart(ctx, centerX, centerY, size, theme) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(centerX, centerY + size * 0.68);
  ctx.bezierCurveTo(centerX - size * 1.25, centerY - size * 0.1, centerX - size * 0.78, centerY - size * 1.08, centerX, centerY - size * 0.48);
  ctx.bezierCurveTo(centerX + size * 0.78, centerY - size * 1.08, centerX + size * 1.25, centerY - size * 0.1, centerX, centerY + size * 0.68);
  ctx.fillStyle = theme.accentRed;
  ctx.fill();
  ctx.restore();
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    if (!url) {
      reject(new Error("No image URL"));
      return;
    }
    const image = new Image();
    if (url.startsWith("https:")) image.crossOrigin = "anonymous";
    image.referrerPolicy = "no-referrer";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("封面加载失败"));
    image.src = url;
  });
}

export function downloadCanvas(canvas, filename) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("图片导出失败"));
          return;
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.download = filename;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        resolve();
      }, "image/png");
    } catch (error) {
      reject(error);
    }
  });
}
