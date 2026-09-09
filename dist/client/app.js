import { APP_CONFIG } from "./config.js";

const state = {
  users: APP_CONFIG.users || [],
  slots: [],
  combinations: [],
  trips: [],
  calendarMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  selectedDay: localIsoDate(),
  config: { routeKilometers: APP_CONFIG.routeKilometers ?? 42, co2KgPerKilometer: APP_CONFIG.co2KgPerKilometer ?? 0.12 },
  currentStatistics: null,
  recommendationRequest: 0
};

const colors = ["#2673ff", "#21bdd1", "#a8d92d", "#ffb12b", "#eb5b68", "#7957d5"];
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

function initializeSlots() {
  state.slots = Array.from({ length: 4 }, (_, index) => ({
    enabled: index < Math.min(3, state.users.length),
    userId: index < state.users.length ? state.users[index].id : ""
  }));
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

async function updateCombination() {
  hideResult();
  const participants = activeParticipants();
  renderDriverOptions(participants);
  const error = $("#combination-error");
  if (hasDuplicateParticipants()) {
    error.textContent = "Eine Person kann nur einmal Teil der Kombination sein.";
    $("#recommended-driver").textContent = "—";
    $("#recommendation-reason").textContent = "Bitte doppelte Auswahl korrigieren";
    setSyncStatus("Bitte prüfen");
    return;
  }
  if (participants.length < 2) {
    error.textContent = "Wählt mindestens zwei Personen aus.";
    $("#recommended-driver").textContent = "—";
    $("#recommendation-reason").textContent = "Für eine Empfehlung fehlen Mitfahrer";
    setSyncStatus("Unvollständig");
    return;
  }
  error.textContent = "";
  setSyncStatus("Wird aktualisiert", true);
  const requestId = ++state.recommendationRequest;
  try {
    const statistics = await api("/api/recommendation", { method: "POST", body: JSON.stringify({ participants }) });
    if (requestId !== state.recommendationRequest) return;
    state.currentStatistics = statistics;
    $("#recommended-driver").textContent = statistics.recommended.name;
    const trips = statistics.recommended.trips;
    $("#recommendation-reason").textContent = trips === 0 ? "In dieser Kombination bisher noch nicht gefahren" : `${trips} ${trips === 1 ? "Fahrt" : "Fahrten"} in genau dieser Kombination`;
    renderDriverOptions(participants, statistics.recommended.id);
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
    cells.push(`<button class="calendar-day${outside ? " outside" : ""}${dateValue === localIsoDate() ? " today" : ""}${trips.length ? " has-trips" : ""}" type="button" data-date="${dateValue}" aria-label="${day}. ${new Intl.DateTimeFormat("de-DE", { month: "long" }).format(new Date(cellYear, cellMonth, 1))}${trips.length ? `, ${trips.length} ${trips.length === 1 ? "Fahrt" : "Fahrten"}` : ""}">
      <span class="day-number">${day}</span>
      ${trips.length ? `<span class="trip-count">${trips.length} ${trips.length === 1 ? "Fahrt" : "Fahrten"}</span><span class="trip-dots">${trips.slice(0, 3).map(() => "<i></i>").join("")}</span>` : ""}
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
  state.combinations = data.combinations;
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
    const key = participants.join("|");
    const existing = state.combinations.find((item) => item.key === key);
    if (existing) existing.trips += 1;
    else state.combinations.unshift({ key, participants, trips: 1 });
    renderHistoryOptions();
    $("#history-select").value = key;
    renderStatistics(result.statistics);
    await loadCalendar();
    setTimeout(() => $("#history-card").scrollIntoView({ behavior: "smooth", block: "start" }), 350);
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
