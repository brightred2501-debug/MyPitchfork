import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)));
const port = Number(process.env.PORT || 5174);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const privateHostPatterns = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
];

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url || "/", `http://${request.headers.host}`);

    if (requestUrl.pathname === "/api/image") {
      await proxyImage(requestUrl, response);
      return;
    }

    const pathname = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
    const decodedPath = decodeURIComponent(pathname);
    const normalizedPath = normalize(decodedPath).replace(/^(\.\.[/\\])+/, "");
    const filePath = resolve(join(root, normalizedPath));

    if (!filePath.startsWith(root)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    const fileStat = await stat(filePath);

    if (!fileStat.isFile()) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});

async function proxyImage(requestUrl, response) {
  const target = requestUrl.searchParams.get("url");

  if (!isPublicImageUrl(target)) {
    sendText(response, 400, "Invalid image URL");
    return;
  }

  try {
    const upstream = await fetch(target, {
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "User-Agent": "MyPitchfork image proxy",
      },
      redirect: "follow",
    });

    if (!upstream.ok || !isPublicImageUrl(upstream.url)) {
      sendText(response, 502, "Unable to load image");
      return;
    }

    const contentType = upstream.headers.get("content-type") || "";
    const contentLength = Number(upstream.headers.get("content-length") || 0);

    if (!contentType.toLowerCase().startsWith("image/")) {
      sendText(response, 415, "URL is not an image");
      return;
    }

    if (contentLength > MAX_IMAGE_BYTES) {
      sendText(response, 413, "Image is too large");
      return;
    }

    const body = Buffer.from(await upstream.arrayBuffer());
    if (body.length > MAX_IMAGE_BYTES) {
      sendText(response, 413, "Image is too large");
      return;
    }

    response.writeHead(200, {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600",
      "Content-Length": String(body.length),
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
    });
    response.end(body);
  } catch {
    sendText(response, 502, "Unable to load image");
  }
}

function isPublicImageUrl(value) {
  if (!value) return false;

  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return false;

    const hostname = url.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname === "::1" ||
      hostname.startsWith("::ffff:127.") ||
      privateHostPatterns.some((pattern) => pattern.test(hostname))
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

function sendText(response, statusCode, message) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(message);
}

server.listen(port, "127.0.0.1", () => {
  console.log(`MyPitchfork is running at http://127.0.0.1:${port}/`);
});
