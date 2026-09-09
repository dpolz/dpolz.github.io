export const APP_CONFIG = {
  // Trage hier nach dem Cloudflare-Worker-Deploy deine Worker-URL ein (z. B. "https://fairgemeinschaft-api.<subdomain>.workers.dev")
  // Leer lassen (""), falls lokaler Dev-Server oder Reverse Proxy genutzt wird
  apiBase: "https://fairgemeinschaft-api.fairgemeinschaft.workers.dev",
  users: [
    { id: "felix", name: "Felix" },
    { id: "mo", name: "Mo" },
    { id: "daniel", name: "Daniel" },
    { id: "julian", name: "Julian" },
    { id: "gautam", name: "Gautam" },
    { id: "samu", name: "Samu" },
    { id: "michi", name: "Michi" },
    { id: "strobl", name: "Strobl" },
    { id: "daniel_l", name: "Daniel Lengerer" },
    { id: "el_profesor", name: "El Profesor" }
  ],
  routeKilometers: 42,
  co2KgPerKilometer: 0.12
};
