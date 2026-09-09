import { APP_CONFIG } from "./config.js";

const state = {
  users: APP_CONFIG.users || [],
  slots: [],
  combinations: [],
  trips: [],
  globalStats: { totalTrips: 0, totalSavedKm: 0, totalSavedCo2: 0 },
  userStats: [],
  calendarMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  selectedDay: localIsoDate(),
  config: { routeKilometers: APP_CONFIG.routeKilometers ?? 42, co2KgPerKilometer: APP_CONFIG.co2KgPerKilometer ?? 0.12 },
  currentStatistics: null,
  recommendationRequest: 0
};

const colors = ["#2673ff", "#21bdd1", "#a8d92d", "#ffb12b", "#eb5b68", "#7957d5", "#f97316", "#06b6d4", "#84cc16", "#a855f7"];
const $ = (selector) => document.querySelector(selector);
const API_BASE = APP_CONFIG.apiBase || (location.hostname === "localhost" || location.hostname === "127.0.0.1" ? "" : "");
const TOKEN_KEY = "fairgemeinschaft_session";

function localIsoDate() {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}

async function api(path, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "Die Anfrage ist fehlgeschlagen.");
    error.status = response.status;
    throw error;
  }
  return payload;
}

function setAuthenticated(authenticated) {
  $("#login-view").hidden = authenticated;
  $("#app-view").hidden = !authenticated;
  if (!authenticated) $("#password").focus();
}

function memberName(id) {
  return state.users.find((user) => user.id === id)?.name || id;
}

function activeParticipants() {
  return [...new Set(state.slots.filter((slot) => slot.enabled && slot.userId).map((slot) => slot.userId))].sort();
}

function hasDuplicateParticipants() {
  const selected = state.slots.filter((slot) => slot.enabled && slot.userId).map((slot) => slot.userId);
  return new Set(selected).size !== selected.length;
}

function formatCombination(participants) {
  return participants.map(memberName).join(" · ");
}

function formatDetailSchema(total, bySize = {}) {
  const s2 = bySize?.[2] || 0;
  const s3 = bySize?.[3] || 0;
  const s4 = bySize?.[4] || 0;
  const s5 = bySize?.[5] || 0;
  return `<strong class="detail-total">${total}</strong><span class="detail-breakdown">/ ${s2} / ${s3} / ${s4} / ${s5}</span>`;
}

function formatBalance(value) {
  const num = Number(value) || 0;
  const sign = num > 0.001 ? "+" : "";
  const cls = num > 0.001 ? "balance-positive" : num < -0.001 ? "balance-negative" : "balance-neutral";
  return `<span class="balance-badge ${cls}">${sign}${num.toFixed(2)}</span>`;
}

function initializeSlots() {
  state.slots = [
    { enabled: true, userId: state.users.some((u) => u.id === "felix") ? "felix" : (state.users[0]?.id || "") },
    { enabled: true, userId: state.users.some((u) => u.id === "mo") ? "mo" : (state.users[1]?.id || "") },
    { enabled: true, userId: state.users.some((u) => u.id === "daniel") ? "daniel" : (state.users[2]?.id || "") },
    { enabled: false, userId: "" },
    { enabled: false, userId: "" }
  ];
}

function renderSlots() {
  const container = $("#participant-slots");
  container.replaceChildren();
  state.slots.forEach((slot, index) => {
    const wrapper = document.createElement("div");
    wrapper.className = "participant-slot";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = slot.enabled;
    checkbox.setAttribute("aria-label", `Platz ${index + 1} aktiv`);
    checkbox.addEventListener("change", () => {
      slot.enabled = checkbox.checked;
      updateCombination();
    });
    const select = document.createElement("select");
    select.setAttribute("aria-label", `Person auf Platz ${index + 1}`);
    select.innerHTML = `<option value="">Leer</option>${state.users.map((user) => `<option value="${user.id}">${user.name}</option>`).join("")}`;
    select.value = slot.userId;
    select.addEventListener("change", () => {
      slot.userId = select.value;
      updateCombination();
    });
    wrapper.append(checkbox, select);
    container.append(wrapper);
  });
}

function renderDriverOptions(participants, recommendedId = "") {
  const select = $("#driver-select");
  const current = select.value;
  select.innerHTML = `<option value="">Bitte auswählen</option>${participants.map((id) => `<option value="${id}">${memberName(id)}</option>`).join("")}`;
  select.value = participants.includes(recommendedId) ? recommendedId : participants.includes(current) ? current : "";
  $("#confirm-driver").disabled = participants.length < 2;
}

function setSyncStatus(text, loading = false) {
  const status = $("#combination-status");
  status.textContent = text;
  status.classList.toggle("loading", loading);
}

function renderDonutChart(donutEl, legendEl, total, segments) {
  if (!donutEl) return;
  if (!total || total <= 0) {
    donutEl.style.background = "#dfe7ee";
    if (legendEl) legendEl.innerHTML = `<div class="legend-item"><span class="legend-value">Noch keine Fahrten</span></div>`;
    return;
  }
  let cursor = 0;
  const gradientParts = segments.map((seg) => {
    const start = cursor;
    const share = (seg.value / total) * 100;
    cursor += share;
    return `${seg.color} ${start}% ${cursor}%`;
  });
  donutEl.style.background = `conic-gradient(${gradientParts.join(",")})`;
  if (legendEl) {
    legendEl.innerHTML = segments.map((seg) => `
      <div class="legend-item">
        <span class="legend-dot" style="background:${seg.color}"></span>
        <span class="legend-name">${seg.label}</span>
        <span class="legend-value">${seg.displayValue || seg.value}</span>
      </div>
    `).join("");
  }
}

function renderQuickStats(globalStats, userStats) {
  if (globalStats) {
    $("#qs-total-trips").textContent = (globalStats.totalTrips || 0).toLocaleString("de-DE");
    $("#qs-saved-km").textContent = (globalStats.totalSavedKm || 0).toLocaleString("de-DE", { maximumFractionDigits: 1 });
    $("#qs-saved-co2").textContent = (globalStats.totalSavedCo2 || 0).toLocaleString("de-DE", { maximumFractionDigits: 1 });

    // Donut 1: Fahrer-Verteilung
    const driverTripsTotal = globalStats.totalTrips || 0;
    $("#qs-donut-drivers-total").textContent = driverTripsTotal.toLocaleString("de-DE");
    const activeDrivers = (userStats || []).filter((u) => u.driverTotal > 0);
    const driverSegments = activeDrivers.map((u, i) => ({
      label: u.name,
      value: u.driverTotal,
      displayValue: `${u.driverTotal} ${u.driverTotal === 1 ? "Fahrt" : "Fahrten"}`,
      color: colors[i % colors.length]
    }));
    renderDonutChart($("#qs-donut-drivers"), $("#qs-legend-drivers"), driverTripsTotal, driverSegments);

    // Donut 2: Personenkilometer
    const personKmTotal = globalStats.totalPersonKm || 0;
    $("#qs-donut-km-total").textContent = Math.round(personKmTotal).toLocaleString("de-DE");
    const kmSegments = [
      {
        label: "Tatsächlich gefahren",
        value: globalStats.actualDrivenKm || 0,
        displayValue: `${(globalStats.actualDrivenKm || 0).toLocaleString("de-DE")} km`,
        color: "#2673ff"
      },
      {
        label: "Vermieden (eingespart)",
        value: globalStats.totalSavedKm || 0,
        displayValue: `${(globalStats.totalSavedKm || 0).toLocaleString("de-DE")} km`,
        color: "#21bdd1"
      }
    ];
    renderDonutChart($("#qs-donut-km"), $("#qs-legend-km"), personKmTotal, kmSegments);

    // Donut 3: CO2 Bilanz
    const co2Total = globalStats.hypotheticalCo2Kg || 0;
    $("#qs-donut-co2-total").textContent = co2Total.toLocaleString("de-DE", { maximumFractionDigits: 1 });
    const co2Segments = [
      {
        label: "Tatsächlich ausgestoßen",
        value: globalStats.actualCo2Kg || 0,
        displayValue: `${(globalStats.actualCo2Kg || 0).toLocaleString("de-DE", { maximumFractionDigits: 1 })} kg`,
        color: "#eb5b68"
      },
      {
        label: "Vermieden (eingespart)",
        value: globalStats.totalSavedCo2 || 0,
        displayValue: `${(globalStats.totalSavedCo2 || 0).toLocaleString("de-DE", { maximumFractionDigits: 1 })} kg`,
        color: "#a8d92d"
      }
    ];
    renderDonutChart($("#qs-donut-co2"), $("#qs-legend-co2"), co2Total, co2Segments);
  }

  // Quick-Stats 3-Month Table
  const tbody = $("#quickstats-tbody");
  if (!userStats || !userStats.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="table-empty">Noch keine Daten verfügbar.</td></tr>`;
    return;
  }

  const activeUsers = userStats.filter((u) => u.activeLast3Months || u.tripsTotal > 0);
  const displayList = activeUsers.length ? activeUsers : userStats;
  const sorted = [...displayList].sort((a, b) => a.balance - b.balance || a.name.localeCompare(b.name));

  tbody.innerHTML = sorted.map((u) => `
    <tr>
      <td><strong>${u.name}</strong></td>
      <td>${formatDetailSchema(u.tripsTotal, u.tripsBySize)}</td>
      <td>${formatDetailSchema(u.driverTotal, u.driverBySize)}</td>
      <td>${formatBalance(u.balance)}</td>
    </tr>
  `).join("");
}

function renderUserStatsTable(userStats) {
  const tbody = $("#user-stats-tbody");
  if (!tbody) return;
  if (!userStats || !userStats.length) {
    tbody.innerHTML = `<tr><td colspan="11" class="table-empty">Noch keine Daten verfügbar.</td></tr>`;
    return;
  }

  const sorted = [...userStats].sort((a, b) => b.tripsTotal - a.tripsTotal || a.name.localeCompare(b.name));

  tbody.innerHTML = sorted.map((u) => `
    <tr>
      <td><strong>${u.name}</strong></td>
      <td><strong>${u.tripsTotal}</strong></td>
      <td>${u.passengerTotal}</td>
      <td>${u.driverTotal}</td>
      <td><span class="ratio-badge">${u.ratio}</span></td>
      <td>${u.favoriteSize}</td>
      <td>${u.favoriteCombination}</td>
      <td>${u.bestBuddy}</td>
      <td>${u.favoriteDriver}</td>
      <td>${u.carpoolStreak > 0 ? `<span class="streak-badge fire">${u.carpoolStreak}</span>` : "0"}</td>
      <td>${u.driverStreak > 0 ? `<span class="streak-badge fire">${u.driverStreak}</span>` : "0"}</td>
    </tr>
  `).join("");
}

async function updateCombination() {
  hideResult();
  const participants = activeParticipants();
  const error = $("#combination-error");
  const details = $("#combination-details");

  if (hasDuplicateParticipants()) {
    error.textContent = "Eine Person kann nur einmal Teil der Kombination sein.";
    if (details) details.hidden = true;
    setSyncStatus("Bitte prüfen");
    return;
  }
  if (participants.length < 2) {
    error.textContent = "Wählt mindestens zwei Personen aus.";
    if (details) details.hidden = true;
    setSyncStatus("Unvollständig");
    return;
  }

  error.textContent = "";
  if (details) details.hidden = false;
  renderDriverOptions(participants);
  setSyncStatus("Wird aktualisiert", true);

  const requestId = ++state.recommendationRequest;
  try {
    const statistics = await api("/api/recommendation", { method: "POST", body: JSON.stringify({ participants }) });
    if (requestId !== state.recommendationRequest) return;
    state.currentStatistics = statistics;

    const pTbody = $("#participant-stats-tbody");
    if (pTbody && statistics.memberStats && statistics.memberStats.length) {
      pTbody.innerHTML = statistics.memberStats.map((u) => `
        <tr>
          <td><strong>${u.name}</strong></td>
          <td>${formatDetailSchema(u.tripsTotal, u.tripsBySize)}</td>
          <td>${formatDetailSchema(u.driverTotal, u.driverBySize)}</td>
          <td>${formatBalance(u.balance)}</td>
        </tr>
      `).join("");
    }

    if (statistics.recommended) {
      $("#recommended-driver").textContent = statistics.recommended.name;
      const recBalance = (statistics.recommended.balance || 0).toFixed(2);
      const sign = statistics.recommended.balance > 0.001 ? "+" : "";
      $("#recommendation-reason").textContent = `${statistics.recommended.name} hat mit Bilanz ${sign}${recBalance} den niedrigsten Wert (ist bei ${statistics.recommended.tripsTotal} Fahrten ${statistics.recommended.driverTotal}-mal gefahren).`;
      renderDriverOptions(participants, statistics.recommended.id);
    } else {
      $("#recommended-driver").textContent = "—";
      $("#recommendation-reason").textContent = "Keine Empfehlung möglich";
    }

    ensureCurrentHistoryOption(participants);
    setSyncStatus("Aktuell");
  } catch (errorValue) {
    if (requestId !== state.recommendationRequest) return;
    error.textContent = errorValue.message;
    setSyncStatus("Fehler");
  }
}

function showResult(type, message) {
  const banner = $("#result-banner");
  banner.className = `result-banner ${type}`;
  banner.innerHTML = `<span class="result-symbol" aria-hidden="true">${type === "success" ? "✓" : "×"}</span><span>${message}</span>`;
  banner.hidden = false;
  $("#driver-controls").hidden = type === "success";
}

function hideResult() {
  $("#result-banner").hidden = true;
  $("#driver-controls").hidden = false;
}

function ensureCurrentHistoryOption(participants) {
  const key = participants.join("|");
  if (!state.combinations.some((item) => item.key === key)) {
    state.combinations.unshift({ key, participants, trips: 0 });
  }
  renderHistoryOptions();
}

function renderHistoryOptions() {
  const select = $("#history-select");
  const current = select.value;
  select.innerHTML = `<option value="">Bitte auswählen</option>${state.combinations.map((item) => `<option value="${item.key}">${formatCombination(item.participants)}</option>`).join("")}`;
  if (state.combinations.some((item) => item.key === current)) select.value = current;
}

function renderStatistics(statistics) {
  $("#history-empty").hidden = true;
  $("#history-content").hidden = false;
  $("#total-trips").textContent = statistics.totalTrips.toLocaleString("de-DE");
  $("#saved-km").textContent = statistics.savedKilometers.toLocaleString("de-DE", { maximumFractionDigits: 1 });
  $("#saved-co2").textContent = statistics.savedCo2Kg.toLocaleString("de-DE", { maximumFractionDigits: 1 });
  $("#calculation-note").textContent = `${state.config.routeKilometers} km je Fahrt · ${state.config.co2KgPerKilometer.toLocaleString("de-DE")} kg CO₂ je eingespartem Kilometer`;

  const total = statistics.totalTrips;
  let cursor = 0;
  const segments = statistics.breakdown.map((item, index) => {
    const start = cursor;
    const share = total ? (item.trips / total) * 100 : 0;
    cursor += share;
    return `${colors[index % colors.length]} ${start}% ${cursor}%`;
  });
  $("#donut").style.background = total ? `conic-gradient(${segments.join(",")})` : "#dfe7ee";
  $("#donut").setAttribute("aria-label", total ? `Verteilung von ${total} Fahrten: ${statistics.breakdown.map((item) => `${item.name} ${item.trips}`).join(", ")}` : "Noch keine Fahrten für diese Kombination");
  $("#legend").innerHTML = statistics.breakdown.map((item, index) => `
    <div class="legend-item">
      <span class="legend-dot" style="background:${colors[index % colors.length]}"></span>
      <span class="legend-name">${item.name}</span>
      <span class="legend-value">${item.trips} ${item.trips === 1 ? "Fahrt" : "Fahrten"}</span>
    </div>`).join("");
}

async function loadHistory(participants) {
  $("#history-empty").hidden = false;
  $("#history-empty").textContent = "Auswertung wird geladen …";
  $("#history-content").hidden = true;
  try {
    const statistics = await api("/api/statistics", { method: "POST", body: JSON.stringify({ participants }) });
    renderStatistics(statistics);
  } catch (errorValue) {
    $("#history-empty").textContent = errorValue.message;
  }
}

function isoDate(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthRange(date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  return {
    from: isoDate(year, month, 1),
    to: isoDate(year, month, new Date(year, month + 1, 0).getDate())
  };
}

async function loadCalendar() {
  const { from, to } = monthRange(state.calendarMonth);
  try {
    const data = await api(`/api/trips?from=${from}&to=${to}`);
    state.trips = data.trips;
    renderCalendar();
  } catch (error) {
    $("#calendar-grid").innerHTML = `<p class="inline-error">${error.message}</p>`;
  }
}

function renderCalendar() {
  const month = state.calendarMonth;
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  $("#calendar-month").textContent = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" }).format(month);
  const firstWeekday = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const daysInPrevious = new Date(year, monthIndex, 0).getDate();
  const cells = [];

  for (let cell = 0; cell < 42; cell += 1) {
    let cellYear = year;
    let cellMonth = monthIndex;
    let day = cell - firstWeekday + 1;
    let outside = false;
    if (day < 1) {
      outside = true;
      cellMonth -= 1;
      if (cellMonth < 0) { cellMonth = 11; cellYear -= 1; }
      day = daysInPrevious + day;
    } else if (day > daysInMonth) {
      outside = true;
      day -= daysInMonth;
      cellMonth += 1;
      if (cellMonth > 11) { cellMonth = 0; cellYear += 1; }
    }
    const dateValue = isoDate(cellYear, cellMonth, day);
    const trips = state.trips.filter((trip) => trip.date === dateValue);
    const driverTags = trips.map((trip) => `<span class="cal-driver-tag" title="Fahrer: ${memberName(trip.driverId)} (${trip.participants.length} Personen)">${memberName(trip.driverId)}</span>`).join("");

    cells.push(`<button class="calendar-day${outside ? " outside" : ""}${dateValue === localIsoDate() ? " today" : ""}${trips.length ? " has-trips" : ""}" type="button" data-date="${dateValue}" aria-label="${day}. ${new Intl.DateTimeFormat("de-DE", { month: "long" }).format(new Date(cellYear, cellMonth, 1))}${trips.length ? `, ${trips.length} ${trips.length === 1 ? "Fahrt" : "Fahrten"}` : ""}">
      <span class="day-number">${day}</span>
      ${trips.length ? `<div class="cal-driver-list">${driverTags}</div><span class="trip-dots">${trips.slice(0, 3).map(() => "<i></i>").join("")}</span>` : ""}
    </button>`);
  }
  $("#calendar-grid").innerHTML = cells.join("");
  $("#calendar-grid").querySelectorAll(".calendar-day").forEach((button) => button.addEventListener("click", () => openDay(button.dataset.date)));
}

function formatLongDate(dateValue) {
  return new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(new Date(`${dateValue}T12:00:00`));
}

function openDay(dateValue) {
  state.selectedDay = dateValue;
  $("#dialog-date").textContent = formatLongDate(dateValue);
  const trips = state.trips.filter((trip) => trip.date === dateValue);
  $("#day-trips").innerHTML = trips.length ? trips.map((trip) => `<article class="day-trip">
    <div><strong>${memberName(trip.driverId)} fährt</strong><span>${formatCombination(trip.participants)}</span></div>
    <button class="edit-trip" type="button" data-trip-id="${trip.id}">Bearbeiten</button>
  </article>`).join("") : `<div class="history-empty">Noch keine Fahrt eingetragen.</div>`;
  $("#day-trips").querySelectorAll(".edit-trip").forEach((button) => button.addEventListener("click", () => openTripForm(state.trips.find((trip) => String(trip.id) === button.dataset.tripId))));
  $("#day-dialog").showModal();
}

function renderTripParticipants(selected = []) {
  $("#trip-participants").innerHTML = state.users.map((user) => `<label class="trip-person"><input type="checkbox" value="${user.id}" ${selected.includes(user.id) ? "checked" : ""} /><span>${user.name}</span></label>`).join("");
  $("#trip-participants").querySelectorAll("input").forEach((input) => input.addEventListener("change", updateTripDriverOptions));
  updateTripDriverOptions();
}

function selectedTripParticipants() {
  return [...$("#trip-participants").querySelectorAll("input:checked")].map((input) => input.value).sort();
}

function updateTripDriverOptions(preferred = "") {
  const select = $("#trip-driver");
  const current = preferred || select.value;
  const participants = selectedTripParticipants();
  select.innerHTML = `<option value="">Bitte auswählen</option>${participants.map((id) => `<option value="${id}">${memberName(id)}</option>`).join("")}`;
  if (participants.includes(current)) select.value = current;
}

function openTripForm(trip = null) {
  $("#day-dialog").close();
  $("#trip-id").value = trip?.id || "";
  $("#trip-date").value = trip?.date || state.selectedDay;
  $("#trip-dialog-kicker").textContent = trip ? "Fahrt korrigieren" : "Fahrt nachtragen";
  $("#trip-dialog-title").textContent = trip ? formatLongDate(trip.date) : formatLongDate(state.selectedDay);
  $("#trip-form-error").textContent = "";
  renderTripParticipants(trip?.participants || activeParticipants());
  updateTripDriverOptions(trip?.driverId || "");
  $("#delete-trip").hidden = !trip;
  $("#trip-dialog").showModal();
}

async function refreshAfterTripChange(dateValue) {
  const data = await api("/api/bootstrap");
  state.users = data.users;
  state.combinations = data.combinations;
  state.globalStats = data.globalStats;
  state.userStats = data.userStats;
  renderQuickStats(state.globalStats, state.userStats);
  renderUserStatsTable(state.userStats);
  renderHistoryOptions();
  const changed = new Date(`${dateValue}T12:00:00`);
  state.calendarMonth = new Date(changed.getFullYear(), changed.getMonth(), 1);
  await loadCalendar();
  await updateCombination();
}

async function bootstrap() {
  try {
    const data = await api("/api/bootstrap");
    state.users = data.users;
    state.combinations = data.combinations;
    state.config = data.config;
    state.globalStats = data.globalStats;
    state.userStats = data.userStats;
    renderQuickStats(state.globalStats, state.userStats);
    renderUserStatsTable(state.userStats);
    initializeSlots();
    renderSlots();
    renderHistoryOptions();
    setAuthenticated(true);
    await updateCombination();
    await loadCalendar();
  } catch (error) {
    if (error.status === 401) setAuthenticated(false);
    else {
      setAuthenticated(false);
      $("#login-error").textContent = error.message;
    }
  }
}

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button");
  button.disabled = true;
  $("#login-error").textContent = "";
  try {
    const login = await api("/api/login", { method: "POST", body: JSON.stringify({ password: $("#password").value }) });
    if (login.sessionToken) localStorage.setItem(TOKEN_KEY, login.sessionToken);
    $("#password").value = "";
    await bootstrap();
  } catch (error) {
    $("#login-error").textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

$("#logout-button").addEventListener("click", async () => {
  await api("/api/logout", { method: "POST" }).catch(() => {});
  localStorage.removeItem(TOKEN_KEY);
  setAuthenticated(false);
});

$("#confirm-driver").addEventListener("click", async () => {
  const participants = activeParticipants();
  const driverId = $("#driver-select").value;
  if (!driverId) {
    showResult("error", "Bitte wählt zuerst einen Fahrer aus.");
    return;
  }
  const button = $("#confirm-driver");
  button.disabled = true;
  try {
    const result = await api("/api/trips", {
      method: "POST",
      body: JSON.stringify({ date: localIsoDate(), participants, driverId })
    });
    showResult("success", `Erfolgreich – ${memberName(driverId)} wurde als Fahrer gespeichert.`);
    await refreshAfterTripChange(localIsoDate());
    const key = participants.join("|");
    $("#history-select").value = key;
    renderStatistics(result.statistics);
    setTimeout(() => $("#combination-card").scrollIntoView({ behavior: "smooth", block: "start" }), 350);
  } catch (error) {
    showResult("error", error.message);
  } finally {
    button.disabled = false;
  }
});

$("#skip-driver").addEventListener("click", async () => {
  const participants = activeParticipants();
  if (participants.length < 2 || hasDuplicateParticipants()) {
    $("#combination-error").textContent = "Bitte zuerst eine gültige Kombination auswählen.";
    return;
  }
  ensureCurrentHistoryOption(participants);
  $("#history-select").value = participants.join("|");
  await loadHistory(participants);
  $("#history-card").scrollIntoView({ behavior: "smooth", block: "start" });
});

$("#history-select").addEventListener("change", async (event) => {
  const selected = state.combinations.find((item) => item.key === event.target.value);
  if (!selected) {
    $("#history-content").hidden = true;
    $("#history-empty").hidden = false;
    $("#history-empty").textContent = "Wählt eine Kombination, um ihre Historie zu sehen.";
    return;
  }
  await loadHistory(selected.participants);
});

$("#calendar-prev").addEventListener("click", async () => {
  state.calendarMonth = new Date(state.calendarMonth.getFullYear(), state.calendarMonth.getMonth() - 1, 1);
  await loadCalendar();
});

$("#calendar-next").addEventListener("click", async () => {
  state.calendarMonth = new Date(state.calendarMonth.getFullYear(), state.calendarMonth.getMonth() + 1, 1);
  await loadCalendar();
});

$("#dialog-close").addEventListener("click", () => $("#day-dialog").close());
$("#trip-dialog-close").addEventListener("click", () => $("#trip-dialog").close());
$("#add-trip").addEventListener("click", () => openTripForm());

$("#trip-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const participants = selectedTripParticipants();
  const driverId = $("#trip-driver").value;
  const date = $("#trip-date").value;
  const id = $("#trip-id").value;
  const submit = event.currentTarget.querySelector("button[type='submit']");
  if (participants.length < 2) {
    $("#trip-form-error").textContent = "Wählt mindestens zwei Personen aus.";
    return;
  }
  if (!participants.includes(driverId)) {
    $("#trip-form-error").textContent = "Wählt einen Fahrer aus der Fahrgemeinschaft.";
    return;
  }
  submit.disabled = true;
  $("#trip-form-error").textContent = "";
  try {
    await api(id ? `/api/trips/${id}` : "/api/trips", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify({ date, participants, driverId })
    });
    $("#trip-dialog").close();
    await refreshAfterTripChange(date);
    openDay(date);
  } catch (error) {
    $("#trip-form-error").textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});

$("#delete-trip").addEventListener("click", async () => {
  const id = $("#trip-id").value;
  const date = $("#trip-date").value;
  if (!id || !window.confirm("Diese Fahrt wirklich löschen?")) return;
  const button = $("#delete-trip");
  button.disabled = true;
  try {
    await api(`/api/trips/${id}`, { method: "DELETE" });
    $("#trip-dialog").close();
    await refreshAfterTripChange(date);
    openDay(date);
  } catch (error) {
    $("#trip-form-error").textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

function registerWebMcp() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const lifecycle = new AbortController();
  Promise.resolve(context.registerTool({
    name: "record_carpool_trip",
    title: "Fahrt eintragen",
    description: "Speichert eine Fahrt für ein Datum, eine Kombination aus mindestens zwei Personen und einen Fahrer aus dieser Kombination.",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        participants: { type: "array", minItems: 2, uniqueItems: true, items: { type: "string" } },
        driverId: { type: "string" }
      },
      required: ["date", "participants", "driverId"],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    async execute(input) {
      const validIds = new Set(state.users.map((user) => user.id));
      if (!input || !Array.isArray(input.participants) || input.participants.length < 2 || new Set(input.participants).size !== input.participants.length || !input.participants.every((id) => validIds.has(id)) || !input.participants.includes(input.driverId) || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
        throw new Error("Ungültige Fahrt: Kombination, Fahrer oder Datum prüfen.");
      }
      const result = await api("/api/trips", { method: "POST", body: JSON.stringify(input) });
      renderStatistics(result.statistics);
      return { status: "gespeichert", driver: memberName(input.driverId), combination: formatCombination(input.participants) };
    }
  }, { signal: lifecycle.signal })).catch(() => {});
}

const today = new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "2-digit", month: "long" }).format(new Date());
$("#today-label").textContent = today.charAt(0).toUpperCase() + today.slice(1);
registerWebMcp();
if ("serviceWorker" in navigator && location.protocol === "https:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("/service-worker.js").catch(() => {}));
}
bootstrap();
