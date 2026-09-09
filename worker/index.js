import { APP_CONFIG } from "../config.js";

const encoder = new TextEncoder();
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers }
  });
}

function getCookie(request, name) {
  const cookie = request.headers.get("cookie") || "";
  const part = cookie.split(";").map((value) => value.trim()).find((value) => value.startsWith(`${name}=`));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : null;
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value) {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

function safeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}

async function isAuthenticated(request, env) {
  if (!env.SESSION_SECRET) return false;
  const value = getCookie(request, "carpool_session");
  if (!value) return false;
  const [expires, signature] = value.split(".");
  if (!expires || !signature || Number(expires) < Math.floor(Date.now() / 1000)) return false;
  return safeEqual(signature, await sign(expires, env.SESSION_SECRET));
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function syncConfiguredUsers(db) {
  const statements = APP_CONFIG.users.map((user, index) => db.prepare(
    "INSERT INTO users (id, name, active, sort_order) VALUES (?, ?, 1, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, active = 1, sort_order = excluded.sort_order"
  ).bind(user.id, user.name, index));
  if (statements.length) await db.batch(statements);
}

function normalizeParticipants(value, validIds) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id) => typeof id === "string" && validIds.has(id)))].sort();
}

function validDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function usersFor(db) {
  await syncConfiguredUsers(db);
  const result = await db.prepare("SELECT id, name FROM users WHERE active = 1 ORDER BY sort_order, name").all();
  return result.results || [];
}

async function statisticsFor(db, participants, users) {
  const combinationKey = participants.join("|");
  const countsResult = await db.prepare(
    "SELECT driver_id, COUNT(*) AS trips FROM trips WHERE combination_key = ? GROUP BY driver_id"
  ).bind(combinationKey).all();
  const countsById = Object.fromEntries((countsResult.results || []).map((row) => [row.driver_id, Number(row.trips)]));
  const members = users.filter((user) => participants.includes(user.id));
  const breakdown = members.map((user) => ({ id: user.id, name: user.name, trips: countsById[user.id] || 0 }));
  const totalTrips = breakdown.reduce((sum, item) => sum + item.trips, 0);
  const minimum = breakdown.length ? Math.min(...breakdown.map((item) => item.trips)) : 0;
  const recommended = breakdown.find((item) => item.trips === minimum) || null;
  const savedKilometers = totalTrips * Math.max(0, participants.length - 1) * APP_CONFIG.routeKilometers;
  return {
    combinationKey,
    participants,
    breakdown,
    totalTrips,
    recommended,
    savedKilometers,
    savedCo2Kg: savedKilometers * APP_CONFIG.co2KgPerKilometer
  };
}

async function handleApi(request, env, url) {
  if (!env.DB) return json({ error: "Die Datenbank ist nicht verfügbar." }, 503);

  if (url.pathname === "/api/login" && request.method === "POST") {
    const body = await readJson(request);
    if (!env.AUTH_PASSWORD_HASH || !env.SESSION_SECRET) return json({ error: "Die Anmeldung ist noch nicht konfiguriert." }, 503);
    const matches = body && typeof body.password === "string" && safeEqual(await sha256(body.password), env.AUTH_PASSWORD_HASH.toLowerCase());
    if (!matches) return json({ error: "Das Passwort ist nicht korrekt." }, 401);
    const expires = String(Math.floor(Date.now() / 1000) + SESSION_MAX_AGE);
    const session = `${expires}.${await sign(expires, env.SESSION_SECRET)}`;
    return json({ ok: true }, 200, { "set-cookie": `carpool_session=${encodeURIComponent(session)}; Max-Age=${SESSION_MAX_AGE}; Path=/; HttpOnly; Secure; SameSite=Strict` });
  }

  if (url.pathname === "/api/logout" && request.method === "POST") {
    return json({ ok: true }, 200, { "set-cookie": "carpool_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict" });
  }

  if (!(await isAuthenticated(request, env))) return json({ error: "Bitte erneut anmelden." }, 401);

  const users = await usersFor(env.DB);
  const validIds = new Set(users.map((user) => user.id));

  if (url.pathname === "/api/bootstrap" && request.method === "GET") {
    const combinationsResult = await env.DB.prepare(
      "SELECT combination_key, participants_json, COUNT(*) AS trips, MAX(trip_date) AS last_trip FROM trips GROUP BY combination_key, participants_json ORDER BY last_trip DESC"
    ).all();
    return json({
      users,
      config: { routeKilometers: APP_CONFIG.routeKilometers, co2KgPerKilometer: APP_CONFIG.co2KgPerKilometer },
      combinations: (combinationsResult.results || []).map((row) => ({
        key: row.combination_key,
        participants: JSON.parse(row.participants_json),
        trips: Number(row.trips),
        lastTrip: row.last_trip
      }))
    });
  }

  if (url.pathname === "/api/recommendation" && request.method === "POST") {
    const body = await readJson(request);
    const participants = normalizeParticipants(body?.participants, validIds);
    if (participants.length < 2) return json({ error: "Wählt mindestens zwei Personen aus." }, 400);
    return json(await statisticsFor(env.DB, participants, users));
  }

  if (url.pathname === "/api/statistics" && request.method === "POST") {
    const body = await readJson(request);
    const participants = normalizeParticipants(body?.participants, validIds);
    if (participants.length < 2) return json({ error: "Wählt mindestens zwei Personen aus." }, 400);
    return json(await statisticsFor(env.DB, participants, users));
  }

  if (url.pathname === "/api/trips" && request.method === "POST") {
    const body = await readJson(request);
    const participants = normalizeParticipants(body?.participants, validIds);
    if (participants.length < 2) return json({ error: "Wählt mindestens zwei Personen aus." }, 400);
    if (!participants.includes(body?.driverId)) return json({ error: "Der Fahrer muss Teil der Fahrgemeinschaft sein." }, 400);
    if (!validDate(body?.date)) return json({ error: "Das Datum ist ungültig." }, 400);
    const combinationKey = participants.join("|");
    try {
      await env.DB.prepare(
        "INSERT INTO trips (trip_date, combination_key, participants_json, participant_count, driver_id, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).bind(body.date, combinationKey, JSON.stringify(participants), participants.length, body.driverId, new Date().toISOString()).run();
    } catch (error) {
      if (String(error).toLowerCase().includes("unique")) return json({ error: "Für diese Fahrgemeinschaft wurde heute bereits eine Fahrt gespeichert." }, 409);
      throw error;
    }
    return json({ ok: true, statistics: await statisticsFor(env.DB, participants, users) }, 201);
  }

  return json({ error: "Nicht gefunden." }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/api/")) return await handleApi(request, env, url);
      if (env.ASSETS) return env.ASSETS.fetch(request);
      return new Response("Fahrgemeinschaft", { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } });
    } catch (error) {
      console.error(error);
      return json({ error: "Da ist etwas schiefgegangen. Bitte versucht es noch einmal." }, 500);
    }
  }
};
