-- CoolFix: βάση ραντεβού (Cloudflare D1)

CREATE TABLE IF NOT EXISTS jobs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  job_date       TEXT    NOT NULL,              -- YYYY-MM-DD
  job_time       TEXT,                          -- HH:MM
  customer_name  TEXT    NOT NULL,
  phone          TEXT,
  area           TEXT,
  service        TEXT,
  agreed_price   REAL,                          -- συμφωνημένη τιμή
  collected      REAL,                          -- ποσό που εισπράχθηκε
  payment_method TEXT    NOT NULL DEFAULT 'cash'
                 CHECK (payment_method IN ('cash', 'card', 'bank')),
  status         TEXT    NOT NULL DEFAULT 'scheduled'
                 CHECK (status IN ('scheduled', 'done', 'cancelled')),
  notes          TEXT,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_jobs_date  ON jobs (job_date);
CREATE INDEX IF NOT EXISTS idx_jobs_phone ON jobs (phone);

-- Για το κλείδωμα μετά από πολλές λάθος προσπάθειες σύνδεσης
CREATE TABLE IF NOT EXISTS login_attempts (
  ip TEXT    NOT NULL,
  ts INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_login_ip ON login_attempts (ip, ts);
