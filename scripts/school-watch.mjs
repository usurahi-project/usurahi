#!/usr/bin/env node

import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const BASEDIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const CONFIG_FILE = path.join(BASEDIR, "config", "school_watch_sources.yaml");
const STATE_FILE = path.join(BASEDIR, "queue", "news_watch_state.yaml");
const TSX = path.join(BASEDIR, "node_modules", ".bin", "tsx");
const LIBRARY_ADD = path.join(BASEDIR, "scripts", "library-add.ts");

function parseArgs(argv) {
  return {
    apply: argv.includes("--apply"),
    allowNetwork: argv.includes("--allow-network") || process.env.USURAHI_ALLOW_NETWORK_FETCH === "1",
    debug: argv.includes("--debug"),
  };
}

function now() {
  return new Date().toISOString();
}

function loadYaml(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return yaml.load(fs.readFileSync(filePath, "utf8")) || fallback;
}

function saveYaml(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, yaml.dump(data, { lineWidth: -1, noRefs: true }), "utf8");
}

function normalizeAllowedHosts(config) {
  return new Set((config.allowed_hosts || []).map((host) => String(host).toLowerCase()));
}

function normalizeUrl(rawUrl) {
  const parsed = new URL(rawUrl);
  parsed.hash = "";
  return parsed.toString();
}

function assertAllowedUrl(rawUrl, allowedHosts, label) {
  const parsed = new URL(rawUrl);
  const host = parsed.hostname.toLowerCase();
  if (!allowedHosts.has(host)) {
    throw new Error(`${label}: host not allowed: ${host}`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`${label}: only https is allowed`);
  }
  return parsed;
}

function decodeXml(text) {
  return String(text || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function stripTags(text) {
  return decodeXml(String(text || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function extractTag(block, tagName) {
  const match = block.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match ? stripTags(match[1]) : "";
}

function parseRss(xml, source) {
  const items = [];
  const blocks = [...String(xml).matchAll(/<item\b[\s\S]*?>([\s\S]*?)<\/item>/gi)];
  for (const [, block] of blocks) {
    const title = extractTag(block, "title");
    const link = extractTag(block, "link");
    const published = extractTag(block, "pubDate");
    const summary = extractTag(block, "description");
    if (!title || !link) continue;
    items.push({
      sourceId: source.id,
      title,
      link,
      published_at: published,
      summary,
    });
  }

  if (items.length > 0) return items;

  const entries = [...String(xml).matchAll(/<entry\b[\s\S]*?>([\s\S]*?)<\/entry>/gi)];
  for (const [, block] of entries) {
    const title = extractTag(block, "title");
    const linkMatch = block.match(/<link[^>]+href="([^"]+)"/i);
    const published = extractTag(block, "published") || extractTag(block, "updated");
    const summary = extractTag(block, "summary") || extractTag(block, "content");
    const link = linkMatch ? decodeXml(linkMatch[1]) : "";
    if (!title || !link) continue;
    items.push({
      sourceId: source.id,
      title,
      link,
      published_at: published,
      summary,
    });
  }
  return items;
}

function parseAnthropicNewsroom(html, source) {
  const normalized = String(html || "").replace(/\s+/g, " ");
  const links = [...normalized.matchAll(/href="(\/news\/[^"#?]+)"/g)];
  const items = [];
  const seen = new Set();

  for (const match of links) {
    const relativeLink = match[1];
    const absoluteLink = new URL(relativeLink, source.url).toString();
    if (seen.has(absoluteLink)) continue;
    seen.add(absoluteLink);

    const start = Math.max(0, match.index - 240);
    const end = Math.min(normalized.length, match.index + 360);
    const snippet = normalized.slice(start, end);
    const titleMatch = snippet.match(/>([^<>]{8,140})<\/a>/);
    const dateMatch = snippet.match(/([A-Z][a-z]{2} \d{1,2}, \d{4})/);
    const title = titleMatch ? stripTags(titleMatch[1]) : "";
    if (!title) continue;

    items.push({
      sourceId: source.id,
      title,
      link: absoluteLink,
      published_at: dateMatch ? dateMatch[1] : "",
      summary: "",
    });
  }

  return items;
}

function parseOpenAiNewsroom(html, source) {
  const normalized = String(html || "").replace(/\s+/g, " ");
  const links = [...normalized.matchAll(/href="(\/news\/[^"#?]+|\/newsroom\/[^"#?]+)"/g)];
  const items = [];
  const seen = new Set();

  for (const match of links) {
    const relativeLink = match[1];
    const absoluteLink = normalizeUrl(new URL(relativeLink, source.url).toString());
    if (seen.has(absoluteLink)) continue;
    seen.add(absoluteLink);

    const start = Math.max(0, match.index - 320);
    const end = Math.min(normalized.length, match.index + 520);
    const snippet = normalized.slice(start, end);
    const titleMatch = snippet.match(/>([^<>]{10,180})<\/a>/);
    const dateMatch = snippet.match(/([A-Z][a-z]{2} \d{1,2}, \d{4})/);
    const title = titleMatch ? stripTags(titleMatch[1]) : "";
    if (!title) continue;
    if (/Recent news|All|Filter|Sort/.test(title)) continue;

    items.push({
      sourceId: source.id,
      title,
      link: absoluteLink,
      published_at: dateMatch ? dateMatch[1] : "",
      summary: "",
    });
  }

  return items;
}

function parseZennTopic(html, source) {
  const normalized = String(html || "").replace(/\s+/g, " ");
  const links = [...normalized.matchAll(/href="\/([^"/?#]+)\/articles\/([^"/?#]+)"/g)];
  const items = [];
  const seen = new Set();

  for (const match of links) {
    const user = match[1];
    const slug = match[2];
    const absoluteLink = `https://zenn.dev/${user}/articles/${slug}`;
    if (seen.has(absoluteLink)) continue;
    seen.add(absoluteLink);

    const start = Math.max(0, match.index - 300);
    const end = Math.min(normalized.length, match.index + 500);
    const snippet = normalized.slice(start, end);
    const titleMatch =
      snippet.match(/>([^<>]{12,180})<\/a>/) ||
      snippet.match(/title="([^"]{12,180})"/);
    const title = titleMatch ? stripTags(titleMatch[1]) : "";
    if (!title) continue;
    if (/次のページへ|Trending|Alltime|Latest|Articles|Books|Scraps/.test(title)) continue;

    const dateMatch = snippet.match(/(20\d{2}\/\d{2}\/\d{2})/);
    items.push({
      sourceId: source.id,
      title,
      link: absoluteLink,
      published_at: dateMatch ? dateMatch[1].replace(/\//g, "-") : "",
      summary: "",
    });
  }

  return items;
}

function isRecentEnough(item, recencyDays) {
  if (!item.published_at) return true;
  const parsed = Date.parse(item.published_at);
  if (Number.isNaN(parsed)) return true;
  return parsed >= Date.now() - recencyDays * 24 * 60 * 60 * 1000;
}

function matchesKeywords(item, source) {
  const keywords = Array.isArray(source.include_keywords) ? source.include_keywords : [];
  if (keywords.length === 0) return true;
  const haystack = `${item.title} ${item.summary}`.toLowerCase();
  return keywords.some((keyword) => haystack.includes(String(keyword).toLowerCase()));
}

async function fetchBody(source, config, allowedHosts) {
  assertAllowedUrl(source.url, allowedHosts, `${source.id}: source url`);
  const { stdout } = await execFileAsync(
    "curl",
    [
      "-L",
      "--fail",
      "--silent",
      "--show-error",
      "--max-time",
      String(config.request_timeout_sec || 20),
      "--max-redirs",
      String(config.max_redirects || 3),
      "--user-agent",
      "usurahi-school-watch/1.0",
      source.url,
    ],
    {
      cwd: BASEDIR,
      maxBuffer: Number(config.max_response_bytes || 1200000),
      env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH || ""}` },
    }
  );

  if (Buffer.byteLength(stdout, "utf8") > Number(config.max_response_bytes || 1200000)) {
    throw new Error(`${source.id}: response too large`);
  }

  return stdout;
}

async function fetchItems(source, config, allowedHosts) {
  const body = await fetchBody(source, config, allowedHosts);
  if (source.type === "rss") {
    return parseRss(body, source);
  }
  if (source.type === "openai_newsroom") {
    return parseOpenAiNewsroom(body, source);
  }
  if (source.type === "html_newsroom") {
    return parseAnthropicNewsroom(body, source);
  }
  if (source.type === "zenn_topic") {
    return parseZennTopic(body, source);
  }
  throw new Error(`unknown source type: ${source.type}`);
}

async function enqueueItem(item, source, intent) {
  if (!String(item.link || "").startsWith("https://")) {
    throw new Error(`enqueue blocked: invalid link: ${item.link}`);
  }
  const note = `school-watch: ${source.note || source.id}${item.published_at ? ` / ${item.published_at}` : ""}`;
  const args = [LIBRARY_ADD, item.link, "--note", note, "--intent", intent];
  await execFileAsync(TSX, args, { cwd: BASEDIR });
}

async function main() {
  const { apply, allowNetwork, debug } = parseArgs(process.argv.slice(2));
  const config = loadYaml(CONFIG_FILE, { sources: [] });
  const allowedHosts = normalizeAllowedHosts(config);
  const state = loadYaml(STATE_FILE, { seen_urls: [], seen: {}, source_errors: {} });
  if (!state.source_errors || typeof state.source_errors !== "object") {
    state.source_errors = {};
  }
  const seenUrls = new Set((Array.isArray(state.seen_urls) ? state.seen_urls : []).map((url) => String(url)));
  const discovered = [];

  if (!allowNetwork) {
    console.log("school-watch: network disabled; pass --allow-network or set USURAHI_ALLOW_NETWORK_FETCH=1");
    return;
  }

  for (const source of config.sources || []) {
    try {
      const items = await fetchItems(source, config, allowedHosts);
      if (debug) {
        console.log(`school-watch: ${source.id} fetched ${items.length} candidate(s)`);
      }
      const filtered = items
        .filter((item) => isRecentEnough(item, config.recency_days || 14))
        .filter((item) => matchesKeywords(item, source))
        .map((item) => ({ ...item, link: normalizeUrl(item.link) }))
        .filter((item) => {
          assertAllowedUrl(item.link, allowedHosts, `${source.id}: discovered url`);
          return !seenUrls.has(item.link);
        })
        .slice(0, config.max_items_per_source || 5);

      if (debug) {
        console.log(`school-watch: ${source.id} kept ${filtered.length} candidate(s)`);
      }

      for (const item of filtered) {
        discovered.push({ ...item, source });
        seenUrls.add(item.link);
      }

      state.source_errors[source.id] = null;
    } catch (error) {
      state.source_errors[source.id] = {
        at: now(),
        message: error.message,
      };
      console.error(`school-watch: skip ${source.id}: ${error.message}`);
    }
  }

  for (const item of discovered) {
    console.log(`[${item.source.id}] ${item.title}`);
    console.log(`  ${item.link}`);
    if (apply) {
      await enqueueItem(item, item.source, config.enqueue_intent || "keep-for-later");
    }
  }

  state.last_checked_at = now();
  state.seen_urls = [...seenUrls].slice(-1 * Number(config.max_seen_urls || 300));
  saveYaml(STATE_FILE, state);

  console.log(`school-watch: ${discovered.length} item(s) ${apply ? "queued" : "found"}`);
}

main().catch((error) => {
  console.error(`school-watch failed: ${error.message}`);
  process.exit(1);
});
