// Run with Node 22+: node tests/ui-refresh.mjs
// Uses an installed Chrome/Edge, an isolated profile and temporary artifacts.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const baseUrl = process.env.TEST_URL || "http://127.0.0.1:5174";
const executable = [
  process.env.BROWSER_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/chromium", "/usr/bin/google-chrome",
].find((path) => path && existsSync(path));
assert.ok(executable, "Set BROWSER_PATH to an installed Chrome or Edge executable");
const artifacts = await mkdtemp(join(tmpdir(), "mypitchfork-ui-"));
console.log("Artifacts:", artifacts);
const browser = spawn(executable, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
  "--remote-debugging-port=0", `--user-data-dir=${join(artifacts, "profile")}`, "about:blank",
], { windowsHide: true, stdio: "ignore" });
let cdp;
const errors = [];
const results = [];

async function waitFor(probe, label) {
  for (let attempt = 0; attempt < 150; attempt++) {
    const value = await probe();
    if (value) return value;
    await delay(100);
  }
  throw new Error(`Timed out: ${label}`);
}

class DevTools {
  constructor(socket) {
    this.socket = socket;
    this.sequence = 0;
    this.pending = new Map();
    this.listeners = new Map();
    socket.onmessage = ({ data }) => {
      const message = JSON.parse(data);
      if (message.id) {
        const task = this.pending.get(message.id);
        if (!task) return;
        this.pending.delete(message.id);
        clearTimeout(task.timeout);
        message.error ? task.reject(new Error(JSON.stringify(message.error))) : task.resolve(message.result);
      } else {
        this.listeners.get(message.method)?.(message.params);
      }
    };
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timeout = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 30000);
      this.pending.set(id, { resolve, reject, timeout });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
}

async function evaluate(fn, argument) {
  const expression = `(${fn})(${JSON.stringify(argument) ?? ""})`;
  const response = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  return response.result.value;
}
async function screenshot(name) {
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(join(artifacts, name), Buffer.from(data, "base64"));
}
async function viewport(width) {
  await cdp.send("Emulation.setDeviceMetricsOverride", { width, height: 1080, deviceScaleFactor: 1, mobile: false });
}
async function load() {
  await cdp.send("Page.navigate", { url: baseUrl });
  await waitFor(() => evaluate(() => document.readyState === "complete" && !!document.querySelector(".poster-empty-mark, .poster-header")), "app ready");
  await evaluate(() => document.fonts.ready.then(() => true));
}
async function fill(selector, value) {
  await evaluate(({ selector, value }) => {
    const input = document.querySelector(selector);
    input.focus();
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, { selector, value });
}
async function click(selector) {
  await evaluate((selector) => document.querySelector(selector).click(), selector);
}
function passed(name, detail) {
  results.push({ name, detail });
  console.log("PASS", name, detail ? JSON.stringify(detail) : "");
}

try {
  const portFile = join(artifacts, "profile", "DevToolsActivePort");
  await waitFor(() => existsSync(portFile), "Chrome debugging port");
  const port = (await readFile(portFile, "utf8")).split("\n")[0].trim();
  const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
  const socket = new WebSocket(pages.find((page) => page.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  cdp = new DevTools(socket);
  cdp.listeners.set("Runtime.exceptionThrown", (event) => errors.push(event.exceptionDetails.text));
  await cdp.send("Runtime.enable");
  await cdp.send("Page.enable");
  await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: resolve(artifacts) });
  await viewport(1440);
  await load();
  await evaluate(() => document.fonts.load('700 70px "Source Serif 4"').then(() => true));
  assert.equal(await evaluate(() => document.querySelector("#download-button").disabled), true);
  assert.equal(await evaluate(() => document.querySelector("#editor-fields").getBoundingClientRect().height), 0);
  assert.deepEqual(await evaluate(() => [...document.fonts].map((font) => [font.family, font.status])), [
    ["Inter", "loaded"], ["Source Serif 4", "loaded"],
  ]);
  await screenshot("empty-desktop.png");
  passed("Empty draft, hidden controls and local fonts");
  const fontResources = await evaluate(() => performance.getEntriesByType("resource")
    .filter((entry) => entry.name.endsWith(".woff2")).map((entry) => new URL(entry.name).origin));
  assert.equal(fontResources.length, 2);
  assert.ok(fontResources.every((origin) => origin === new URL(baseUrl).origin));
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  assert.equal(await evaluate(() => document.activeElement.id), "query-input");
  await delay(170);
  assert.equal(await evaluate(() => getComputedStyle(document.activeElement).borderColor), "rgb(78, 75, 70)");
  assert.notEqual(await evaluate(() => getComputedStyle(document.activeElement).boxShadow), "none");
  passed("Local font requests and visible keyboard focus");

  await click("#manual-create-button");
  assert.equal(await evaluate(() => document.activeElement.id), "album-name-input");
  await click("#download-button");
  assert.match(await evaluate(() => document.querySelector("#app-notice").textContent), /请填写专辑名/);
  await fill("#album-name-input", "In Rainbows");
  await fill("#artist-name-input", "Radiohead");
  await fill("#overall-score-input", "88.6");
  assert.equal(await evaluate(() => document.querySelector(".score-circle span").textContent), "89");
  assert.equal(await evaluate(() => document.querySelector(".score-circle--hot") !== null), false);
  await fill("#overall-score-input", "90");
  assert.equal(await evaluate(() => document.querySelector(".score-circle--hot") !== null), true);
  await fill("#overall-score-input", "120");
  assert.equal(await evaluate(() => document.querySelector("#overall-score-input").value), "100");
  await fill("#overall-score-input", "-10");
  assert.equal(await evaluate(() => document.querySelector("#overall-score-input").value), "0");
  await fill("#overall-score-input", "94");
  await fill("#comment-input", "A record that finds its own quiet gravity. 温暖、细腻，在流动的节奏中留下余韵。");
  for (const name of ["15 Step", "Bodysnatchers", "Nude", "Weird Fishes / Arpeggi", "All I Need", "Faust Arp", "Reckoner", "House of Cards", "Jigsaw Falling into Place", "Videotape"]) {
    await click("#add-track-button");
    await fill(".track-editor__row:last-child .track-name-input", name);
    await fill(".track-editor__row:last-child .track-duration-input", "3:45");
    await fill(".track-editor__row:last-child .score-input", "92");
  }
  await click(".track-heart-toggle");
  assert.equal(await evaluate(() => document.querySelector(".track-heart-toggle").getAttribute("aria-pressed")), "true");
  assert.equal(await evaluate(() => document.querySelector("#completion-pill").hidden), true);
  await fill(".track-duration-input", "3:99");
  assert.equal(await evaluate(() => !!document.querySelector(".track-editor__row--incomplete")), true);
  await fill(".track-duration-input", "3:45");
  await click("#add-track-button");
  await click(".track-editor__row:last-child .track-remove-button");
  assert.equal(await evaluate(() => document.querySelectorAll(".track-editor__row").length), 10);
  await load();
  assert.equal(await evaluate(() => document.querySelector("#album-name-input").value), "In Rainbows");
  assert.equal(await evaluate(() => document.querySelector(".track-heart-toggle").getAttribute("aria-pressed")), "true");
  passed("Manual create, validation, score normalization, edit, like, add/remove and storage restore");

  for (const width of [1440, 1024, 981, 980, 768, 390, 320]) {
    await viewport(width);
    await evaluate(() => { document.activeElement.blur(); window.scrollTo(0, 0); });
    await delay(230);
    const layout = await evaluate(() => {
      const rect = (selector) => document.querySelector(selector).getBoundingClientRect().toJSON();
      return {
        scrollWidth: document.documentElement.scrollWidth,
        viewport: document.documentElement.clientWidth,
        left: rect(".left-rail"), preview: rect(".preview-area"),
        cover: rect(".poster-artwork"), score: rect(".score-circle"),
        minTouchHeight: Math.min(...[...document.querySelectorAll("button, .track-editor input")].filter((el) => el.getBoundingClientRect().height).map((el) => el.getBoundingClientRect().height)),
        overlappingControls: [...document.querySelectorAll(".track-editor__row")].some((row) => {
          const cells = [...row.children].map((el) => el.getBoundingClientRect());
          return cells.some((a, i) => cells.slice(i + 1).some((b) =>
            Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
            Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1));
        }),
      };
    });
    assert.ok(layout.scrollWidth <= layout.viewport, `Page overflow at ${width}: ${layout.scrollWidth} > ${layout.viewport}`);
    assert.ok(width > 980 ? layout.preview.x > layout.left.x : layout.preview.y >= layout.left.bottom, `Panel order at ${width}`);
    assert.ok(layout.score.x >= layout.cover.right, `Cover and score must remain side by side at ${width}`);
    assert.equal(layout.overlappingControls, false);
    if (width <= 680) assert.ok(layout.minTouchHeight >= 44, `Touch target at ${width}`);
    if ([1440, 390, 320].includes(width)) await screenshot(`editor-${width}.png`);
    if (width === 320) {
      await evaluate(() => document.querySelector(".track-editor").scrollIntoView());
      await screenshot("tracks-320.png");
      await evaluate(() => document.querySelector(".preview-area").scrollIntoView());
      await screenshot("preview-320.png");
    }
    passed(`Responsive layout ${width}px`);
  }

  await viewport(1440);
  await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  assert.equal(await evaluate(() => getComputedStyle(document.querySelector("#editor-fields")).animationName), "none");
  assert.equal(await evaluate(() => getComputedStyle(document.querySelector(".track-heart-toggle")).animationName), "none");
  await cdp.send("Emulation.setEmulatedMedia", { features: [] });
  await fill("#album-name-input", "In Rainbows — 彩虹");
  assert.equal(await evaluate(() => document.querySelector("#poster").getAnimations({ subtree: true }).length), 0);
  assert.equal(await evaluate(() => document.activeElement.id), "album-name-input");
  passed("Reduced motion and stable preview during input");

  const canvasChecks = await evaluate(async () => {
    const { drawPosterCanvas, calculateCanvasLayout } = await import("/src/poster/canvas-renderer.js");
    const { renderPoster } = await import("/src/poster/dom-renderer.js");
    const { getPosterTheme } = await import("/src/poster/theme.js");
    const theme = getPosterTheme();
    const draft = JSON.parse(localStorage.getItem("my-pitchfork-review-draft"));
    const poster = document.querySelector("#poster");
    const baseTrack = draft.tracks[0];
    const cases = [];
    for (const count of [0, 1, 16, 17, 22, 23, 40]) {
      const sample = { ...draft, comment: "", tracks: Array.from({ length: count }, (_, i) => ({ ...baseTrack, name: "Song " + (i + 1), trackNumber: i + 1 })) };
      const canvas = await drawPosterCanvas(sample);
      renderPoster(poster, sample);
      cases.push({ count, width: canvas.width, height: canvas.height, className: poster.className,
        previewHeight: poster.getBoundingClientRect().height * 1200 / poster.getBoundingClientRect().width });
    }
    const boundaries = [];
    for (const score of [undefined, 89, 90, 100]) {
      const sample = { ...draft, overallScore: score };
      const canvas = await drawPosterCanvas(sample);
      renderPoster(poster, sample);
      const ctx = canvas.getContext("2d");
      const layout = calculateCanvasLayout(ctx, sample, 1200, theme.margin);
      const rgba = [...ctx.getImageData(Math.round(layout.scoreCenterX),
        Math.round(layout.mainY + layout.coverSize / 2 - theme.scoreSize / 2 + theme.scoreBorder / 2), 1, 1).data];
      boundaries.push({ score: score ?? "unset", hot: !!poster.querySelector(".score-circle--hot"), rgba });
    }
    const texts = [];
    for (const title of ["短标题", "A long album title with words ".repeat(6), "中英混合 Album 彩虹".repeat(8), "W".repeat(200)]) {
      const sample = { ...draft, albumName: title, comment: "音乐在这里慢慢展开，节奏与旋律相互交织。".repeat(12).slice(0, 180) };
      const canvas = await drawPosterCanvas(sample);
      const ctx = canvas.getContext("2d");
      const layout = calculateCanvasLayout(ctx, sample, 1200, theme.margin);
      renderPoster(poster, sample);
      texts.push({ width: canvas.width, height: canvas.height,
        titleLines: layout.titleLines.length, commentLines: layout.commentLines.length,
        headerBottom: poster.querySelector(".poster-header").getBoundingClientRect().bottom,
        mainTop: poster.querySelector(".poster-main").getBoundingClientRect().top });
    }
    renderPoster(poster, draft);
    const canvas = await drawPosterCanvas(draft);
    window.testCanvas = canvas;
    return { cases, boundaries, texts, background: [...canvas.getContext("2d").getImageData(0, 0, 1, 1).data] };
  });
  for (const item of canvasChecks.cases) {
    assert.equal(item.width, 1200);
    assert.ok(Math.abs(item.previewHeight - item.height) < 35, `Preview/export height mismatch: ${JSON.stringify(item)}`);
    assert.equal(item.className, item.count > 22 ? "poster poster--extended" : item.count > 16 ? "poster poster--dense" : "poster");
  }
  assert.ok(canvasChecks.cases.at(-1).height > canvasChecks.cases[1].height);
  for (const item of canvasChecks.boundaries) {
    const hot = typeof item.score === "number" && item.score >= 90;
    assert.equal(item.hot, hot);
    assert.deepEqual(item.rgba, hot ? [201, 37, 45, 255] : [27, 26, 24, 255]);
  }
  for (const item of canvasChecks.texts) {
    assert.equal(item.width, 1200);
    assert.ok(item.titleLines <= 3 && item.commentLines <= 4);
    assert.ok(item.mainTop >= item.headerBottom);
  }
  assert.deepEqual(canvasChecks.background, [252, 251, 248, 255]);
  const png = await evaluate(() => window.testCanvas.toDataURL("image/png").split(",")[1]);
  await writeFile(join(artifacts, "poster-export.png"), Buffer.from(png, "base64"));
  passed("Canvas size, shared colors, thresholds, long text, dense modes and proportional preview", canvasChecks.cases);

  await click("#download-button");
  await waitFor(() => evaluate(() => document.querySelector("#app-notice").textContent === "PNG 已生成"), "PNG download");
  await waitFor(async () => (await readdir(artifacts)).includes("Radiohead - In Rainbows — 彩虹 rating.png"), "downloaded file");
  passed("PNG download and unchanged filename");

  const artworkPolicy = await evaluate(async () => {
    const { artworkRequestUrl, isAppleArtworkUrl } = await import("/src/lib/artwork.js");
    return {
      appleAllowed: isAppleArtworkUrl("https://is1-ssl.mzstatic.com/image/thumb/cover/100x100bb.jpg"),
      externalBlocked: artworkRequestUrl("https://example.com/cover.jpg"),
      insecureBlocked: artworkRequestUrl("http://is1-ssl.mzstatic.com/cover.jpg"),
    };
  });
  assert.deepEqual(artworkPolicy, { appleAllowed: true, externalBlocked: "", insecureBlocked: "" });

  await evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 80;
    canvas.height = 60;
    const context = canvas.getContext("2d");
    context.fillStyle = "#45433e";
    context.fillRect(0, 0, 80, 60);
    context.fillStyle = "#d8d5ce";
    context.fillRect(20, 10, 40, 40);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], "local-cover.png", { type: "image/png" }));
    const input = document.querySelector("#artwork-file-input");
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await waitFor(() => evaluate(() => JSON.parse(localStorage.getItem("my-pitchfork-review-draft")).artworkUrl.startsWith("data:image/jpeg;base64,")), "local artwork stored");
  await load();
  await waitFor(() => evaluate(() => document.querySelector(".poster-artwork img")?.naturalWidth === 1200), "local artwork loaded");
  assert.match(await evaluate(() => document.querySelector("#artwork-help").textContent), /本机上传/);
  await evaluate(async () => {
    const { drawPosterCanvas } = await import("/src/poster/canvas-renderer.js");
    window.testCanvas = await drawPosterCanvas(JSON.parse(localStorage.getItem("my-pitchfork-review-draft")));
    window.scrollTo(0, 0);
  });
  await screenshot("editor-cover-desktop.png");
  const coverPng = await evaluate(() => window.testCanvas.toDataURL("image/png").split(",")[1]);
  await writeFile(join(artifacts, "poster-cover-export.png"), Buffer.from(coverPng, "base64"));
  await click("#remove-artwork-button");
  await waitFor(() => evaluate(() => !!document.querySelector(".poster-artwork__fallback")), "cover removed");
  assert.equal(await evaluate(() => JSON.parse(localStorage.getItem("my-pitchfork-review-draft")).artworkUrl), "");
  passed("Apple-only artwork policy, local upload, persistence, Canvas export and removal");

  // Exercise JSONP through real script elements while keeping the fixture deterministic.
  const searchRequests = [];
  let searchMode = "results";
  await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*itunes.apple.com/*" }, { urlPattern: "*mzstatic.com/*" }] });
  cdp.listeners.set("Fetch.requestPaused", async ({ requestId, request }) => {
    const url = new URL(request.url);
    if (url.hostname.endsWith("mzstatic.com")) {
      await cdp.send("Fetch.fulfillRequest", { requestId, responseCode: 200,
        responseHeaders: [{ name: "Content-Type", value: "image/svg+xml" }, { name: "Access-Control-Allow-Origin", value: "*" }],
        body: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="620" height="620"><rect width="620" height="620" fill="#45433e"/><circle cx="310" cy="310" r="200" fill="#d8d5ce"/></svg>').toString("base64") });
      return;
    }
    searchRequests.push(Object.fromEntries(url.searchParams));
    if (searchMode === "error") { await cdp.send("Fetch.failRequest", { requestId, errorReason: "Failed" }); return; }
    const album = { wrapperType: "collection", collectionId: 123, collectionName: "Test Album", artistName: "Test Artist", artworkUrl100: "https://is1-ssl.mzstatic.com/image/thumb/test/100x100bb.jpg", releaseDate: "2020-01-01", trackCount: 2, primaryGenreName: "Alternative" };
    const tracks = [2, 1].map((i) => ({ wrapperType: "track", kind: "song", trackId: i, trackName: "Song " + i, trackTimeMillis: 180000, discNumber: 1, trackNumber: i }));
    const data = { results: searchMode === "empty" ? [] : url.pathname === "/lookup" ? [album, ...tracks] : [album, { ...album, collectionId: 124, collectionName: "Another Album" }] };
    await cdp.send("Fetch.fulfillRequest", { requestId, responseCode: 200,
      responseHeaders: [{ name: "Content-Type", value: "text/javascript" }],
      body: Buffer.from(`${url.searchParams.get("callback")}(${JSON.stringify(data)})`).toString("base64") });
  });
  cdp.listeners.set("Page.javascriptDialogOpening", () => { void cdp.send("Page.handleJavaScriptDialog", { accept: true }); });
  await click("#clear-button");
  assert.equal(await evaluate(() => localStorage.getItem("my-pitchfork-review-draft")), null);
  for (const country of ["us", "cn", "jp"]) {
    await evaluate((country) => { const el = document.querySelector("#country-select"); el.value = country; el.dispatchEvent(new Event("change")); }, country);
    await fill("#query-input", "test");
    await click("#search-button");
    await waitFor(() => evaluate(() => document.querySelectorAll(".album-result").length === 2), "search results");
    assert.equal(searchRequests.at(-1).country, country);
    assert.equal(searchRequests.at(-1).entity, "album");
  }
  await screenshot("search-results.png");
  await waitFor(() => evaluate(() => document.querySelector(".album-result__artwork")?.naturalWidth > 0), "Apple result artwork");
  await click(".album-result");
  await waitFor(() => evaluate(() => document.querySelectorAll(".track-editor__row").length === 2), "lookup");
  assert.equal(await evaluate(() => document.querySelector(".track-name-input").value), "Song 1");
  assert.equal(await evaluate(() => !!document.querySelector(".album-result--selected")), true);
  assert.match(await evaluate(() => document.querySelector("#artwork-help").textContent), /Apple 提供/);
  assert.match(await evaluate(() => JSON.parse(localStorage.getItem("my-pitchfork-review-draft")).artworkUrl), /^https:\/\/is1-ssl\.mzstatic\.com\//);
  assert.equal(searchRequests.at(-1).entity, "song");
  await viewport(320);
  await evaluate(() => window.scrollTo(0, 0));
  await delay(230);
  assert.equal(await evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  assert.equal(await evaluate(() => document.querySelector("#completion-pill").hidden), false);
  await screenshot("pending-search-320.png");
  searchMode = "empty";
  await click("#search-button");
  await waitFor(() => evaluate(() => !document.querySelector("#empty-results").hidden), "empty search");
  searchMode = "error";
  await click("#search-button");
  await waitFor(() => evaluate(() => !document.querySelector("#search-alert").hidden), "failed search");
  await click("#reset-button");
  assert.equal(await evaluate(() => localStorage.getItem("my-pitchfork-review-draft")), null);
  passed("JSONP search/lookup, US/CN/JP parameters, selected/empty/error states and reset");
  assert.deepEqual(errors, []);
  await writeFile(join(artifacts, "results.json"), JSON.stringify(results, null, 2));
  console.log("Artifacts:", artifacts);
} finally {
  if (cdp) {
    await cdp.send("Browser.close").catch(() => {});
    cdp.socket.close();
  }
  browser.kill();
}
