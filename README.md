# Fairgemeinschaft

Eine installierbare, passwortgeschützte PWA (Progressive Web App) zum fairen Verteilen gemeinsamer Fahrten für Android, iOS und Desktop, gehostet via **Cloudflare Pages** und **Cloudflare Workers (D1-Datenbank)** unter `https://fairgemeinschaft.de`.

## Funktionen

1. **Quick-Stats**: Gesamtübersicht mit 3 Ringdiagrammen (Fahrtenverteilung, Personenkilometer, CO₂-Bilanz) und 3-Monats-Aktivitätstabelle mit Punktestand.
2. **Heutige Fairgemeinschaft (5 Plätze)**: Mitfahrer wählen, Live-Statistiken der Mitfahrer einsehen und automatische Empfehlung des Fahrers anhand der geringsten Bilanz.
3. **Fairgemeinschafts-Statistik**: Donut-Diagramm und Detailauswertung der jeweiligen Gruppenkombination.
4. **User-Statistik**: Detaillierte Kennzahlen je Nutzer (Fahrten, Fahrer/Mitfahrer-Verhältnis, bevorzugte Gruppengröße, Best Buddy, Lieblings-Fahrer, Streaks).
5. **Kalender (Fahrten verwalten)**: Monatskalender mit direkter Fahrervorschau je Tag, nachträgliches Eintragen, Ändern und Löschen.
6. **PWA-Unterstützung**: Installierbar auf Android, iOS (Homescreen) und Desktop.

## Konfiguration

Nutzer, Streckenlänge, CO₂-Faktor und die Worker-URL stehen in `config.js`.

```javascript
export const APP_CONFIG = {
  apiBase: "https://fairgemeinschaft-api.<subdomain>.workers.dev", // Cloudflare Worker URL
  users: [
    { id: "felix", name: "Felix" },
    { id: "mo", name: "Mo" },
    { id: "daniel", name: "Daniel" },
    // ...
  ],
  routeKilometers: 42,
  co2KgPerKilometer: 0.12
};
```

## Deployment (Cloudflare Worker & Cloudflare Pages)

Frontend und Backend werden komplett über Cloudflare bereitgestellt:

1. **Build & Deploy ausführen**:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\deploy.ps1
   ```
   *Dieses Skript baut die Client-Assets (`dist/client`), aktualisiert den Worker (`npx wrangler deploy`) und veröffentlicht das Frontend auf Cloudflare Pages (`npx wrangler pages deploy`).*

2. **Custom Domain `fairgemeinschaft.de` in Cloudflare Pages einrichten**:
   - Gehe im Cloudflare Dashboard zu **Workers & Pages** -> **Pages** -> **fairgemeinschaft**.
   - Klicke auf **Custom Domains** -> **Set up a custom domain**.
   - Trage `fairgemeinschaft.de` (und optional `www.fairgemeinschaft.de`) ein.
   - Cloudflare richtet automatisch die DNS-Einträge und das SSL-Zertifikat ein.

3. **Geheimnisse für Login & Session (falls noch nicht gesetzt)**:
   ```bash
   npx wrangler secret put AUTH_PASSWORD_HASH
   npx wrangler secret put SESSION_SECRET
   ```
