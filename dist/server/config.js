export const APP_CONFIG = {
  // Trage hier nach dem Cloudflare-Worker-Deploy deine Worker-URL ein (z. B. "https://fairgemeinschaft-api.<subdomain>.workers.dev")
  // Leer lassen (""), falls lokaler Dev-Server oder Reverse Proxy genutzt wird
  apiBase: "https://fairgemeinschaft-api.fairgemeinschaft.workers.dev",
  users: [
    { id: "felix", name: "Felix" },
    { id: "mo", name: "Mo" },
    { id: "daniel", name: "Daniel" }
  ],
  routeKilometers: 42,
  co2KgPerKilometer: 0.12
};
