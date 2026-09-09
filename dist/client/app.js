const state = {
  users: [],
  slots: [],
  combinations: [],
  config: { routeKilometers: 42, co2KgPerKilometer: 0.12 },
  currentStatistics: null,
  recommendationRequest: 0
};

const colors = ["#2673ff", "#21bdd1", "#a8d92d", "#ffb12b", "#eb5b68", "#7957d5"];
const $ = (selector) => document.querySelector(selector);

function localIsoDate() {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) }
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
    await api("/api/login", { method: "POST", body: JSON.stringify({ password: $("#password").value }) });
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
bootstrap();
