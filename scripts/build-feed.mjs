// Builds BOYS IN THE WILD's live feed: reads Homeboys' latest Instagram posts through Instagram's own API,
// applies the pin and hide list in feed.config.json, copies each picture into out/img (Instagram's picture links
// expire, and loading them from Instagram would hand visitors' details to Meta) and writes out/feed.json for the
// website. Fewer than four usable posts and it stops with an error, so the last good feed stays up.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const token = process.env.INSTAGRAM_TOKEN;
const api = process.env.INSTAGRAM_API ?? "https://graph.instagram.com";
const out = process.env.OUT_DIR ?? "out";
const MIN = 4;
if (!token) throw new Error("INSTAGRAM_TOKEN is missing. Add it under Settings > Secrets and variables > Actions.");

const config = JSON.parse(await readFile("feed.config.json", "utf8"));
const show = Math.min(Math.max(Number(config.show) || 6, MIN), 12);
// Pins and hides can be written as the post's link or just its code (the bit after /p/ or /reel/).
const code = (s) => String(s).match(/(?:\/(?:p|reel|tv)\/)?([\w-]{5,})\/?(?:\?.*)?$/)?.[1] ?? String(s);
const pins = (config.pin ?? []).map(code);
const hides = new Set((config.hide ?? []).map(code));

async function getJson(url) {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Instagram said ${res.status}: ${body?.error?.message ?? "no details"}`);
  return body;
}

// The latest 100 posts are plenty to find any pinned ones.
const fields = "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp";
let next = `${api}/me/media?fields=${fields}&limit=50&access_token=${encodeURIComponent(token)}`;
const media = [];
while (next && media.length < 100) {
  const page = await getJson(next);
  media.push(...(page.data ?? []));
  next = page.paging?.next;
}
console.log(`Instagram returned ${media.length} posts.`);

const posts = media
  .map((m) => {
    const c = code(m.permalink ?? "");
    const picture = m.media_type === "VIDEO" ? m.thumbnail_url : m.media_url;
    return { m, c, picture };
  })
  .filter(({ c, picture }) => picture && c && !hides.has(c));
const pinned = pins.map((p) => posts.find((x) => x.c === p)).filter(Boolean);
for (const p of pins) if (!pinned.some((x) => x.c === p)) console.warn(`Pinned post ${p} isn't in the latest 100, so it's left out.`);
const chosen = [...pinned, ...posts.filter((x) => !pins.includes(x.c))].slice(0, show);

// A short description from the caption: first line, no hashtags or links, cut at a word.
function alt(caption) {
  const line = (caption ?? "").split("\n").find((l) => l.trim()) ?? "";
  const text = line.replace(/https?:\/\/\S+/g, "").replace(/#[\p{L}\p{N}_]+/gu, "").replace(/\s+/g, " ").trim();
  if (!text) return "A post from Homeboys on Instagram";
  return text.length <= 120 ? text : `${text.slice(0, 120).replace(/\s+\S*$/, "")}…`;
}

await mkdir(`${out}/img`, { recursive: true });
const done = [];
for (const { m, c, picture } of chosen) {
  try {
    const res = await fetch(picture);
    if (!res.ok) throw new Error(`picture ${res.status}`);
    const file = `img/${m.id}.jpg`;
    // 4:5 like the tiles, sharp enough for a six-across row on a big screen.
    await sharp(Buffer.from(await res.arrayBuffer()))
      .rotate()
      .resize(720, 900, { fit: "cover", position: "attention" })
      .jpeg({ quality: 78, mozjpeg: true })
      .toFile(`${out}/${file}`);
    const reel = m.media_type === "VIDEO";
    done.push({ id: m.id, href: `https://www.instagram.com/${reel ? "reel" : "p"}/${c}/`, src: file, alt: alt(m.caption), reel, at: m.timestamp });
  } catch (e) {
    console.warn(`Skipped post ${c}: ${e.message}`);
  }
}
if (done.length < MIN) throw new Error(`Only ${done.length} usable posts (need ${MIN}). Nothing published, so the last good feed stays up.`);

await writeFile(`${out}/feed.json`, JSON.stringify({ updated: new Date().toISOString(), posts: done }, null, 2));
await writeFile(`${out}/index.html`, '<!doctype html><meta charset="utf-8"><title>Homeboys feed</title><meta name="robots" content="noindex"><p>The picture feed for homeboyspizza.co.uk. Nothing to see here.</p>\n');
await writeFile(`${out}/robots.txt`, "User-agent: *\nDisallow: /\n");
console.log(`Published ${done.length} posts: ${done.map((p) => p.href).join(" ")}`);
