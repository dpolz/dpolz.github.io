# Fairgemeinschaft

Eine installierbare, passwortgeschützte PWA zum fairen Verteilen gemeinsamer Fahrten. Sie speichert jede Fahrt, empfiehlt den Fahrer ausschließlich anhand der exakt gleichen Mitfahrer-Kombination und zeigt Fahrten, eingesparte Kilometer sowie eingespartes CO₂ an. Im Kalender lassen sich vergangene Fahrten nachtragen, korrigieren und löschen.

## Konfiguration

Nutzer, Streckenlänge und CO₂-Faktor stehen in `config.js`. Neue Nutzer erhalten dort eine eindeutige, kleingeschriebene `id` und einen Anzeigenamen.

Die Anmeldung nutzt zwei serverseitige Umgebungsvariablen:

- `AUTH_PASSWORD_HASH`: SHA-256-Hash des gemeinsamen Passworts
- `SESSION_SECRET`: zufälliges Geheimnis zum Signieren der Sitzung

## Build

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build.ps1
```

Die sichtbare PWA läuft unter `https://dpolz.github.io`. Da GitHub Pages selbst keine serverseitige Datenbank anbietet, nutzt sie den Cloudflare-kompatiblen Worker als geschützte API und eine D1-Datenbank für die gemeinsame Historie.
