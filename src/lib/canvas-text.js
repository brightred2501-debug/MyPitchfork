import { getPosterFonts } from "../poster/theme.js";

export function wrapCanvasText(ctx, text, maxWidth) {
  const source = String(text || "").trim();
  if (!source) return [];

  const hasWhitespace = /\s/.test(source);
  const tokens = [];
  const sourceTokens = hasWhitespace ? source.split(/\s+/) : Array.from(source);

  sourceTokens.forEach((token) => {
    if (ctx.measureText(token).width <= maxWidth) {
      tokens.push(token);
    } else {
      tokens.push(...splitLongCanvasToken(ctx, token, maxWidth));
    }
  });

  const lines = [];
  let line = "";

  tokens.forEach((token) => {
    const next = line ? `${line}${hasWhitespace ? " " : ""}${token}` : token;

    if (ctx.measureText(next).width <= maxWidth || !line) {
      line = next;
      return;
    }

    lines.push(line);
    line = token;
  });

  if (line) {
    lines.push(line);
  }

  return lines;
}

function splitLongCanvasToken(ctx, token, maxWidth) {
  const chunks = [];
  let chunk = "";

  Array.from(token).forEach((character) => {
    const next = `${chunk}${character}`;

    if (ctx.measureText(next).width <= maxWidth || !chunk) {
      chunk = next;
      return;
    }

    chunks.push(chunk);
    chunk = character;
  });

  if (chunk) {
    chunks.push(chunk);
  }

  return chunks;
}

export function limitLines(lines, maxLines) {
  if (lines.length <= maxLines) return lines;

  const limited = lines.slice(0, maxLines);
  limited[maxLines - 1] = `${limited[maxLines - 1]}...`;
  return limited;
}

export function drawCenteredLines(ctx, lines, centerX, startY, lineHeight) {
  lines.forEach((line, index) => {
    ctx.fillText(line, centerX, startY + index * lineHeight);
  });
}

export function drawLeftLines(ctx, lines, x, startY, lineHeight) {
  lines.forEach((line, index) => {
    ctx.fillText(line, x, startY + index * lineHeight);
  });
}

export function truncateCanvasText(ctx, text, maxWidth) {
  const source = String(text || "");
  if (ctx.measureText(source).width <= maxWidth) return source;

  let result = source;
  while (result.length > 0 && ctx.measureText(`${result}...`).width > maxWidth) {
    result = result.slice(0, -1);
  }

  return `${result}...`;
}

export function canvasFont(weight, size, family = "sans") {
  const stack = family === "sans" || family === "serif" ? getPosterFonts()[family] : family;
  return `${weight} ${size}px ${stack}`;
}
