// Fetches football data from football-data.org (free tier) and writes small
// static JSON files that the Android app reads from GitHub Pages.
//
// Usage: FOOTBALL_DATA_TOKEN=xxxx node sync.mjs <outputDir>
//
// Output layout:
//   meta.json                         { updatedAt }
//   competitions.json                 { competitions: [...] }
//   matches.json                      matches from 3 days ago to 6 days ahead
//   competitions/<CODE>/matches.json  full current season
//   competitions/<CODE>/standings.json

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const API = "https://api.football-data.org/v4/";
const TOKEN = process.env.FOOTBALL_DATA_TOKEN;
const OUT = process.argv[2] || "public";

// Free tier allows 10 requests per minute, so keep a safe gap between calls.
const REQUEST_GAP_MS = 6500;

// Competitions refreshed per run (season fixtures + standings = 2 calls each).
const COMPETITIONS_PER_RUN = 4;

// Same order is used by the app for sorting.
const PRIORITY = ["PL", "CL", "PD", "SA", "BL1", "FL1", "WC", "EC", "DED", "PPL", "ELC", "BSA", "CLI"];

if (!TOKEN) {
  console.error("FOOTBALL_DATA_TOKEN is not set");
  process.exit(1);
}

let lastRequestAt = 0;

async function api(endpoint) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const wait = lastRequestAt + REQUEST_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();

    const res = await fetch(API + endpoint, { headers: { "X-Auth-Token": TOKEN } });
    if (res.ok) return res.json();

    if (res.status === 429) {
      console.warn(`429 on ${endpoint}, waiting 60s`);
      await sleep(60000);
      continue;
    }
    throw new Error(`${res.status} ${res.statusText} on ${endpoint}`);
  }
  throw new Error(`Too many retries on ${endpoint}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function addDays(d, days) {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function sortOrder(code) {
  const i = PRIORITY.indexOf(code);
  return i === -1 ? 999 : i;
}

// ---------- slimming: keep only what the app shows ----------

const team = (t) =>
  t && {
    id: t.id,
    name: t.name,
    shortName: t.shortName,
    tla: t.tla,
    crest: t.crest,
  };

const competition = (c) =>
  c && {
    id: c.id,
    code: c.code,
    name: c.name,
    type: c.type,
    emblem: c.emblem,
  };

function match(m) {
  return {
    id: m.id,
    utcDate: m.utcDate,
    status: m.status,
    matchday: m.matchday,
    stage: m.stage,
    group: m.group,
    competition: competition(m.competition),
    homeTeam: team(m.homeTeam),
    awayTeam: team(m.awayTeam),
    score: m.score && {
      winner: m.score.winner,
      duration: m.score.duration,
      fullTime: m.score.fullTime,
      halfTime: m.score.halfTime,
    },
  };
}

function standings(s) {
  return {
    competition: competition(s.competition),
    season: s.season && {
      startDate: s.season.startDate,
      endDate: s.season.endDate,
      currentMatchday: s.season.currentMatchday,
    },
    standings: (s.standings || [])
      .filter((g) => g.type === "TOTAL")
      .map((g) => ({
        stage: g.stage,
        group: g.group,
        table: g.table.map((r) => ({
          position: r.position,
          team: team(r.team),
          playedGames: r.playedGames,
          won: r.won,
          draw: r.draw,
          lost: r.lost,
          points: r.points,
          goalsFor: r.goalsFor,
          goalsAgainst: r.goalsAgainst,
          goalDifference: r.goalDifference,
          form: r.form,
        })),
      })),
  };
}

// ---------- file helpers ----------

async function write(rel, data) {
  const file = path.join(OUT, rel);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data));
  console.log(`wrote ${rel}`);
}

async function readJson(rel) {
  try {
    return JSON.parse(await readFile(path.join(OUT, rel), "utf8"));
  } catch {
    return null;
  }
}

// ---------- main ----------

async function main() {
  const now = new Date();
  // One "slot" per 15 minutes, used to rotate through competitions.
  const slot = Math.floor(now.getTime() / (15 * 60 * 1000));

  // 1. Competition list: refresh every ~2 hours or when missing.
  let competitions = (await readJson("competitions.json"))?.competitions;
  if (!competitions || slot % 8 === 0) {
    const data = await api("competitions");
    competitions = data.competitions
      .map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        type: c.type,
        emblem: c.emblem,
        area: c.area && { name: c.area.name, code: c.area.code, flag: c.area.flag },
        currentMatchday: c.currentSeason?.currentMatchday ?? null,
      }))
      .sort((a, b) => sortOrder(a.code) - sortOrder(b.code));
    await write("competitions.json", { competitions });
  }

  // 2. Matches around today: every run. The API allows at most 10 days per call.
  const from = isoDate(addDays(now, -3));
  const to = isoDate(addDays(now, 6));
  const window = await api(`matches?dateFrom=${from}&dateTo=${to}`);
  const matches = window.matches.map(match);
  await write("matches.json", { dateFrom: from, dateTo: to, matches });

  // 3. Per competition season fixtures + standings, a few per run.
  //    Competitions with live or just-finished matches always get refreshed.
  const codes = competitions.map((c) => c.code);
  const rotation = [];
  const groups = Math.max(1, Math.ceil(codes.length / COMPETITIONS_PER_RUN));
  const start = (slot % groups) * COMPETITIONS_PER_RUN;
  rotation.push(...codes.slice(start, start + COMPETITIONS_PER_RUN));

  const threeHoursAgo = now.getTime() - 3 * 60 * 60 * 1000;
  for (const m of matches) {
    const active =
      m.status === "IN_PLAY" ||
      m.status === "PAUSED" ||
      (m.status === "FINISHED" && Date.parse(m.utcDate) > threeHoursAgo);
    const code = m.competition?.code;
    if (active && code && !rotation.includes(code)) rotation.push(code);
  }

  // SYNC_ALL=1 refreshes every competition (first run, or after a long pause).
  const todo = process.env.SYNC_ALL === "1" ? codes : rotation.slice(0, COMPETITIONS_PER_RUN + 3);

  for (const code of todo) {
    try {
      const season = await api(`competitions/${code}/matches`);
      await write(`competitions/${code}/matches.json`, {
        matches: season.matches.map(match),
      });
    } catch (e) {
      console.warn(`skip ${code} matches: ${e.message}`);
    }

    try {
      const table = await api(`competitions/${code}/standings`);
      await write(`competitions/${code}/standings.json`, standings(table));
    } catch (e) {
      console.warn(`skip ${code} standings: ${e.message}`);
    }
  }

  await write("meta.json", { updatedAt: now.toISOString() });
  await writeFile(path.join(OUT, ".nojekyll"), "");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
