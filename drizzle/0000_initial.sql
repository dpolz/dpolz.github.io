CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE trips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_date TEXT NOT NULL,
  combination_key TEXT NOT NULL,
  participants_json TEXT NOT NULL,
  participant_count INTEGER NOT NULL,
  driver_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_trips_date_combination
ON trips(trip_date, combination_key);

CREATE INDEX idx_trips_combination_driver
ON trips(combination_key, driver_id);

PRAGMA optimize;
