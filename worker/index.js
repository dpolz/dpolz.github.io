import { APP_CONFIG } from "./config.js";

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
  const authorization = request.headers.get("authorization") || "";
  const value = authorization.startsWith("Bearer ") ? authorization.slice(7) : getCookie(request, "carpool_session");
  if (!value) return false;
  const [expires, signature] = value.split(".");
  if (!expires || !signature || Number(expires) < Math.floor(Date.now() / 1000)) return false;
  return safeEqual(signature, await sign(expires, env.SESSION_SECRET.trim()));
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

async function calculateAllStats(db, users) {
  const tripsResult = await db.prepare(
    "SELECT id, trip_date, participants_json, participant_count, driver_id, created_at FROM trips ORDER BY trip_date ASC, created_at ASC, id ASC"
  ).all();
  const trips = (tripsResult.results || []).map((row) => {
    let participants = [];
    try {
      participants = JSON.parse(row.participants_json || "[]");
    } catch {
      participants = [];
    }
    const count = participants.length || row.participant_count || 1;
    return {
      id: row.id,
      date: row.trip_date,
      participants,
      count,
      driverId: row.driver_id,
      createdAt: row.created_at
    };
  });

  const now = new Date();
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()).toISOString().slice(0, 10);

  let totalTrips = trips.length;
  let totalSavedKm = 0;
  let totalPersonKm = 0;
  let actualDrivenKm = totalTrips * APP_CONFIG.routeKilometers;

  const userStatsMap = {};
  users.forEach((u) => {
    userStatsMap[u.id] = {
      id: u.id,
      name: u.name,
      tripsTotal: 0,
      passengerTotal: 0,
      driverTotal: 0,
      tripsBySize: { 2: 0, 3: 0, 4: 0, 5: 0 },
      driverBySize: { 2: 0, 3: 0, 4: 0, 5: 0 },
      balance: 0,
      lastTripDate: null,
      activeLast3Months: false,
      carpoolStreak: 0,
      driverStreak: 0,
      buddiesCount: {},
      driverFavorites: {},
      combinationCounts: {}
    };
  });

  const globalDriverCounts = {};

  trips.forEach((trip) => {
    const count = trip.count;
    const size = Math.min(Math.max(count, 2), 5);
    const savedForTrip = Math.max(0, count - 1) * APP_CONFIG.routeKilometers;
    totalSavedKm += savedForTrip;
    totalPersonKm += count * APP_CONFIG.routeKilometers;
    const deduction = count > 0 ? 1 / count : 0;
    const combKey = trip.participants.join("|");

    globalDriverCounts[trip.driverId] = (globalDriverCounts[trip.driverId] || 0) + 1;

    trip.participants.forEach((userId) => {
      if (!userStatsMap[userId]) {
        userStatsMap[userId] = {
          id: userId,
          name: users.find((u) => u.id === userId)?.name || userId,
          tripsTotal: 0,
          passengerTotal: 0,
          driverTotal: 0,
          tripsBySize: { 2: 0, 3: 0, 4: 0, 5: 0 },
          driverBySize: { 2: 0, 3: 0, 4: 0, 5: 0 },
          balance: 0,
          lastTripDate: null,
          activeLast3Months: false,
          carpoolStreak: 0,
          driverStreak: 0,
          buddiesCount: {},
          driverFavorites: {},
          combinationCounts: {}
        };
      }
      const u = userStatsMap[userId];
      u.tripsTotal += 1;
      u.tripsBySize[size] = (u.tripsBySize[size] || 0) + 1;
      u.balance -= deduction;
      u.lastTripDate = trip.date;
      if (trip.date >= threeMonthsAgo) {
        u.activeLast3Months = true;
      }
      u.combinationCounts[combKey] = (u.combinationCounts[combKey] || 0) + 1;

      trip.participants.forEach((otherId) => {
        if (otherId !== userId) {
          u.buddiesCount[otherId] = (u.buddiesCount[otherId] || 0) + 1;
        }
      });

      if (trip.driverId === userId) {
        u.driverTotal += 1;
        u.driverBySize[size] = (u.driverBySize[size] || 0) + 1;
        u.balance += 1.0;
      } else {
        u.passengerTotal += 1;
        u.driverFavorites[trip.driverId] = (u.driverFavorites[trip.driverId] || 0) + 1;
      }
    });
  });

  users.forEach((u) => {
    const stats = userStatsMap[u.id];
    if (!stats) return;

    let maxCarpool = 0;
    let currCarpool = 0;
    for (const trip of trips) {
      if (trip.participants.includes(u.id)) {
        currCarpool += 1;
        if (currCarpool > maxCarpool) maxCarpool = currCarpool;
      } else {
        currCarpool = 0;
      }
    }
    stats.carpoolStreak = maxCarpool;

    const userRides = trips.filter((t) => t.participants.includes(u.id));
    let maxDriver = 0;
    let currDriver = 0;
    for (const trip of userRides) {
      if (trip.driverId === u.id) {
        currDriver += 1;
        if (currDriver > maxDriver) maxDriver = currDriver;
      } else {
        currDriver = 0;
      }
    }
    stats.driverStreak = maxDriver;

    let bestSize = null;
    let maxCountSize = 0;
    [2, 3, 4, 5].forEach((s) => {
      if ((stats.tripsBySize[s] || 0) > maxCountSize) {
        maxCountSize = stats.tripsBySize[s];
        bestSize = `${s}er`;
      }
    });
    stats.favoriteSize = bestSize ? `${bestSize} (${maxCountSize}×)` : "—";

    let bestCombKey = null;
    let maxCombCount = 0;
    Object.entries(stats.combinationCounts).forEach(([k, cnt]) => {
      if (cnt > maxCombCount) {
        maxCombCount = cnt;
        bestCombKey = k;
      }
    });
    if (bestCombKey) {
      const names = bestCombKey.split("|").map((id) => users.find((x) => x.id === id)?.name || id).join(" · ");
      stats.favoriteCombination = `${names} (${maxCombCount}×)`;
    } else {
      stats.favoriteCombination = "—";
    }

    let bestBuddyId = null;
    let maxBuddyCount = 0;
    Object.entries(stats.buddiesCount).forEach(([id, cnt]) => {
      if (cnt > maxBuddyCount) {
        maxBuddyCount = cnt;
        bestBuddyId = id;
      }
    });
    stats.bestBuddy = bestBuddyId ? `${users.find((x) => x.id === bestBuddyId)?.name || bestBuddyId} (${maxBuddyCount}×)` : "—";

    let favDriverId = null;
    let maxFavDriverCount = 0;
    Object.entries(stats.driverFavorites).forEach(([id, cnt]) => {
      if (cnt > maxFavDriverCount) {
        maxFavDriverCount = cnt;
        favDriverId = id;
      }
    });
    stats.favoriteDriver = favDriverId ? `${users.find((x) => x.id === favDriverId)?.name || favDriverId} (${maxFavDriverCount}×)` : "—";

    if (stats.tripsTotal === 0) {
      stats.ratio = "—";
    } else if (stats.passengerTotal === 0) {
      stats.ratio = "Nur Fahrer";
    } else if (stats.driverTotal === 0) {
      stats.ratio = "Nur Mitfahrer";
    } else {
      const r = (stats.passengerTotal / stats.driverTotal).toFixed(1);
      stats.ratio = `1 : ${r.replace(/\.0$/, "")}`;
    }
  });

  const userStats = users.map((u) => userStatsMap[u.id]);
  const totalSavedCo2 = totalSavedKm * APP_CONFIG.co2KgPerKilometer;
  const actualCo2Kg = actualDrivenKm * APP_CONFIG.co2KgPerKilometer;
  const hypotheticalCo2Kg = totalPersonKm * APP_CONFIG.co2KgPerKilometer;

  const driverBreakdown = users.map((u) => ({
    id: u.id,
    name: u.name,
    trips: globalDriverCounts[u.id] || 0
  })).filter((u) => u.trips > 0 || users.length <= 10);

  return {
    globalStats: {
      totalTrips,
      totalSavedKm,
      totalSavedCo2,
      totalPersonKm,
      actualDrivenKm,
      actualCo2Kg,
      hypotheticalCo2Kg,
      driverBreakdown
    },
    userStats
  };
}

async function statisticsFor(db, participants, users) {
  const combinationKey = participants.join("|");
  const countsResult = await db.prepare(
    "SELECT driver_id, COUNT(*) AS trips FROM trips WHERE combination_key = ? GROUP BY driver_id"
  ).bind(combinationKey).all();
  const countsById = Object.fromEntries((countsResult.results || []).map((row) => [row.driver_id, Number(row.trips)]));
  
  const { globalStats, userStats } = await calculateAllStats(db, users);
  const memberStats = userStats.filter((u) => participants.includes(u.id));

  // Sort memberStats by balance ASC (lowest balance first), then driverTotal ASC
  const sortedMembers = [...memberStats].sort((a, b) => {
    if (Math.abs(a.balance - b.balance) > 0.0001) return a.balance - b.balance;
    if (a.driverTotal !== b.driverTotal) return a.driverTotal - b.driverTotal;
    return a.name.localeCompare(b.name);
  });
  const recommended = sortedMembers[0] || null;

  const breakdown = participants.map((id) => {
    const u = users.find((item) => item.id === id);
    return {
      id,
      name: u?.name || id,
      trips: countsById[id] || 0
    };
  });
  const totalTrips = breakdown.reduce((sum, item) => sum + item.trips, 0);
  const savedKilometers = totalTrips * Math.max(0, participants.length - 1) * APP_CONFIG.routeKilometers;

  return {
    combinationKey,
    participants,
    breakdown,
    totalTrips,
    recommended,
    memberStats: sortedMembers,
    globalStats,
    savedKilometers,
    savedCo2Kg: savedKilometers * APP_CONFIG.co2KgPerKilometer
  };
}

async function handleApi(request, env, url) {
  if (!env.DB) return json({ error: "Die Datenbank ist nicht verfügbar." }, 503);

  if (url.pathname === "/api/login" && request.method === "POST") {
    const body = await readJson(request);
    if (!env.AUTH_PASSWORD_HASH || !env.SESSION_SECRET) return json({ error: "Die Anmeldung ist noch nicht konfiguriert." }, 503);
    const configuredSecret = String(env.AUTH_PASSWORD_HASH).trim();
    const inputPass = body && typeof body.password === "string" ? body.password.trim() : "";
    const hashedInput = await sha256(inputPass);
    const matches = inputPass.length > 0 && (
      safeEqual(hashedInput, configuredSecret.toLowerCase()) ||
      safeEqual(inputPass, configuredSecret)
    );
    if (!matches) return json({ error: "Das Passwort ist nicht korrekt." }, 401);
    const expires = String(Math.floor(Date.now() / 1000) + SESSION_MAX_AGE);
    const session = `${expires}.${await sign(expires, env.SESSION_SECRET.trim())}`;
    return json({ ok: true, sessionToken: session }, 200, { "set-cookie": `carpool_session=${encodeURIComponent(session)}; Max-Age=${SESSION_MAX_AGE}; Path=/; HttpOnly; Secure; SameSite=Strict` });
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
    const { globalStats, userStats } = await calculateAllStats(env.DB, users);
    return json({
      users,
      config: { routeKilometers: APP_CONFIG.routeKilometers, co2KgPerKilometer: APP_CONFIG.co2KgPerKilometer },
      globalStats,
      userStats,
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

  if (url.pathname === "/api/trips" && request.method === "GET") {
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    if (!validDate(from) || !validDate(to) || from > to) return json({ error: "Der Zeitraum ist ungültig." }, 400);
    const result = await env.DB.prepare(
      "SELECT id, trip_date, participants_json, driver_id, created_at FROM trips WHERE trip_date BETWEEN ? AND ? ORDER BY trip_date, created_at"
    ).bind(from, to).all();
    return json({ trips: (result.results || []).map((row) => ({
      id: row.id,
      date: row.trip_date,
      participants: JSON.parse(row.participants_json),
      driverId: row.driver_id,
      createdAt: row.created_at
    })) });
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

  const tripMatch = url.pathname.match(/^\/api\/trips\/(\d+)$/);
  if (tripMatch && request.method === "PUT") {
    const body = await readJson(request);
    const participants = normalizeParticipants(body?.participants, validIds);
    if (participants.length < 2) return json({ error: "Wählt mindestens zwei Personen aus." }, 400);
    if (!participants.includes(body?.driverId)) return json({ error: "Der Fahrer muss Teil der Fahrgemeinschaft sein." }, 400);
    if (!validDate(body?.date)) return json({ error: "Das Datum ist ungültig." }, 400);
    try {
      const result = await env.DB.prepare(
        "UPDATE trips SET trip_date = ?, combination_key = ?, participants_json = ?, participant_count = ?, driver_id = ? WHERE id = ?"
      ).bind(body.date, participants.join("|"), JSON.stringify(participants), participants.length, body.driverId, Number(tripMatch[1])).run();
      if (!result.meta?.changes) return json({ error: "Die Fahrt wurde nicht gefunden." }, 404);
    } catch (error) {
      if (String(error).toLowerCase().includes("unique")) return json({ error: "Für diese Fahrgemeinschaft gibt es an diesem Tag bereits eine Fahrt." }, 409);
      throw error;
    }
    return json({ ok: true });
  }

  if (tripMatch && request.method === "DELETE") {
    const result = await env.DB.prepare("DELETE FROM trips WHERE id = ?").bind(Number(tripMatch[1])).run();
    if (!result.meta?.changes) return json({ error: "Die Fahrt wurde nicht gefunden." }, 404);
    return json({ ok: true });
  }

  return json({ error: "Nicht gefunden." }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const allowedOrigin = env.APP_ORIGIN || "https://dpolz.github.io";
    const requestOrigin = request.headers.get("origin");
    const addCors = (response) => {
      if (requestOrigin !== allowedOrigin) return response;
      const headers = new Headers(response.headers);
      headers.set("access-control-allow-origin", allowedOrigin);
      headers.set("access-control-allow-credentials", "true");
      headers.set("vary", "Origin");
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    };
    try {
      if (url.pathname.startsWith("/api/") && request.method === "OPTIONS") {
        if (requestOrigin !== allowedOrigin) return new Response(null, { status: 403 });
        return new Response(null, { status: 204, headers: {
          "access-control-allow-origin": allowedOrigin,
          "access-control-allow-credentials": "true",
          "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
          "access-control-allow-headers": "Content-Type, Authorization",
          "access-control-max-age": "86400",
          "vary": "Origin"
        } });
      }
      if (url.pathname.startsWith("/api/")) return addCors(await handleApi(request, env, url));
      if (env.ASSETS) return env.ASSETS.fetch(request);
      return new Response("Fairgemeinschaft", { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } });
    } catch (error) {
      console.error(error);
      return addCors(json({ error: "Da ist etwas schiefgegangen. Bitte versucht es noch einmal." }, 500));
    }
  }
};
