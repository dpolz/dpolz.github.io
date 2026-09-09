# Fahrgemeinschaft

Eine kompakte, passwortgeschützte Anwendung zum fairen Verteilen gemeinsamer Fahrten. Sie speichert jede Fahrt, empfiehlt den Fahrer ausschließlich anhand der exakt gleichen Mitfahrer-Kombination und zeigt Fahrten, eingesparte Kilometer sowie eingespartes CO₂ an.

## Konfiguration

Nutzer, Streckenlänge und CO₂-Faktor stehen in `config.js`. Neue Nutzer erhalten dort eine eindeutige, kleingeschriebene `id` und einen Anzeigenamen.

Die Anmeldung nutzt zwei serverseitige Umgebungsvariablen:

- `AUTH_PASSWORD_HASH`: SHA-256-Hash des gemeinsamen Passworts
- `SESSION_SECRET`: zufälliges Geheimnis zum Signieren der Sitzung

## Build

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build.ps1
```

Die Anwendung wird als Cloudflare-kompatibler Worker mit D1-Datenbank für OpenAI Sites gebaut. Ein rein statisches GitHub-Pages-Deployment kann die gemeinsame, geschützte Historie nicht serverseitig speichern.
