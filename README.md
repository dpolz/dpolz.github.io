# Fairgemeinschaft

Eine installierbare, passwortgeschützte PWA (Progressive Web App) zum fairen Verteilen gemeinsamer Fahrten für Android, iOS und Desktop.

## Funktionen

1. **Kombination auswählen (4 Plätze)**: Mitfahrer per Checkbox und Dropdown wählen.
2. **Fahrer-Empfehlung**: Vorschlag des Fahrers basiert ausschließlich auf den historischen Fahrten der exakt identischen Kombination.
3. **Auswertung**: Donut-Diagramm je Fahrer, berechnete eingesparte Kilometer ($42\text{ km} \times (\text{Mitfahrer}-1)$) und eingespartes $\text{CO}_2$ ($0{,}12\text{ kg/km}$).
4. **Kalender**: Übersicht über alle vergangenen Fahrten nach Monaten, nachträgliches Eintragen, Ändern und Löschen.
5. **PWA-Unterstützung**: Installierbar auf Android und iOS (Homescreen).

## Konfiguration

Nutzer, Streckenlänge, CO₂-Faktor und die Worker-URL stehen in `config.js`.

```javascript
export const APP_CONFIG = {
  apiBase: "https://fairgemeinschaft-api.<subdomain>.workers.dev", // Cloudflare Worker URL
  users: [
    { id: "felix", name: "Felix" },
    { id: "mo", name: "Mo" },
    { id: "daniel", name: "Daniel" }
  ],
  routeKilometers: 42,
  co2KgPerKilometer: 0.12
};
```

## Backend einrichten (Cloudflare Worker & D1)

GitHub Pages hostet nur statische Dateien. Die gemeinsame Historie und Authentifizierung laufen über einen kostenlosen Cloudflare Worker mit D1-Datenbank:

1. **Wrangler einrichten & D1-Datenbank erstellen**:
   ```bash
   npx wrangler login
   npx wrangler d1 create fairgemeinschaft-db
   ```
   Kopiere die ausgegebene `database_id` in `wrangler.toml`.

2. **Datenbankschema initialisieren**:
   ```bash
   npx wrangler d1 execute fairgemeinschaft-db --file=drizzle/0000_initial.sql --remote
   ```

3. **Geheimnisse für Login & Session setzen**:
   - SHA-256 Hash deines Passworts berechnen (z. B. in PowerShell: `[BitConverter]::ToString((New-Object Security.Cryptography.SHA256Managed).ComputeHash([Text.Encoding]::UTF8.GetBytes("DEIN_PASSWORT"))).Replace("-","").ToLower()`)
   ```bash
   npx wrangler secret put AUTH_PASSWORD_HASH
   npx wrangler secret put SESSION_SECRET
   ```

4. **Worker deployen**:
   ```bash
   npx wrangler deploy
   ```
   Trage die resultierende Worker-URL (z. B. `https://fairgemeinschaft-api.<subdomain>.workers.dev`) in `config.js` als `apiBase` ein.

5. **Änderungen committen & pushen**:
   ```bash
   git add .
   git commit -m "Update API base URL"
   git push
   ```
   Die App ist nun unter `https://dpolz.github.io` voll funktionsfähig.
