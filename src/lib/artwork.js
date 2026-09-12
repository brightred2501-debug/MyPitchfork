const APPLE_ARTWORK_HOST = /(^|\.)mzstatic\.com$/i;
const LOCAL_ARTWORK_URL = /^data:image\/(?:jpeg|png|webp);base64,/i;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const OUTPUT_SIZE = 1200;

export function upgradeArtworkUrl(url, size = OUTPUT_SIZE) {
  if (!isAppleArtworkUrl(url)) return "";

  return url
    .replace(/\/\d+x\d+bb\.(jpg|jpeg|png|webp)$/i, `/${size}x${size}bb.$1`)
    .replace(/\d+x\d+bb(?=\.)/i, `${size}x${size}bb`);
}

export function isAppleArtworkUrl(value) {
  try {
    const url = new URL(String(value).trim());
    return url.protocol === "https:" && APPLE_ARTWORK_HOST.test(url.hostname);
  } catch {
    return false;
  }
}

export function isLocalArtworkUrl(value) {
  return LOCAL_ARTWORK_URL.test(String(value || ""));
}

export function normalizeArtworkUrl(value) {
  const url = String(value || "").trim();
  return isAppleArtworkUrl(url) || isLocalArtworkUrl(url) ? url : "";
}

export function artworkRequestUrl(value) {
  return normalizeArtworkUrl(value);
}

export async function createLocalArtwork(file) {
  if (!(file instanceof Blob)) {
    throw new Error("请选择一张图片");
  }
  if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(file.type)) {
    throw new Error("仅支持 JPG、PNG 或 WebP 图片");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("图片不能超过 10 MB");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
    if (!sourceSize) throw new Error("无法读取图片");

    const sourceX = (image.naturalWidth - sourceSize) / 2;
    const sourceY = (image.naturalHeight - sourceSize) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceSize,
      sourceSize,
      0,
      0,
      OUTPUT_SIZE,
      OUTPUT_SIZE,
    );
    return canvas.toDataURL("image/jpeg", 0.88);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("无法读取图片"));
    image.src = url;
  });
}
