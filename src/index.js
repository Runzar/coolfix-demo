/**
 * CoolFix Worker
 * - Σερβίρει τη στατική σελίδα (φάκελος public/) όπως πριν.
 * - Προσθέτει κλειδωμένο API για τη μίνι εφαρμογή διαχείρισης (/admin/).
 *
 * Χρειάζεται:
 *   Binding D1:  DB
 *   Secrets:     ADMIN_PASSWORD, SESSION_SECRET
 */

const COOKIE_NAME = 'cf_admin';
const SESSION_DAYS = 30;          // πόσες μέρες μένει συνδεδεμένος στο κινητό
const MAX_ATTEMPTS = 5;           // λάθος κωδικοί πριν το κλείδωμα
const LOCK_MINUTES = 15;          // διάρκεια κλειδώματος

const PAYMENT = ['cash', 'card', 'bank'];
const STATUS = ['scheduled', 'done', 'cancelled'];
const FIELDS = [
  'job_date', 'job_time', 'customer_name', 'phone', 'area', 'service',
  'agreed_price', 'collected', 'payment_method', 'status', 'notes',
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env, url);
      } catch (err) {
        console.error(err);
        return json({ error: 'Σφάλμα διακομιστή. Δοκίμασε ξανά.' }, 500);
      }
    }

    // Όλα τα υπόλοιπα: η στατική σελίδα
    return env.ASSETS.fetch(request);
  },
};

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */

async function handleApi(request, env, url) {
  const path = url.pathname;
  const method = request.method;

  if (method !== 'GET' && !isSameOrigin(request, url)) {
    return json({ error: 'Μη έγκυρη προέλευση αιτήματος.' }, 403);
  }

  // ---- Δημόσια routes ----
  if (path === '/api/login' && method === 'POST') return login(request, env);
  if (path === '/api/logout' && method === 'POST') return logout();

  // Αν η φόρμα επικοινωνίας της σελίδας στέλνει ήδη σε δικό σου route
  // (π.χ. /api/contact), βάλ' το ΕΔΩ, πριν από τον έλεγχο σύνδεσης.

  // ---- Από εδώ και κάτω χρειάζεται σύνδεση ----
  if (!(await isAuthed(request, env))) {
    return json({ error: 'Χρειάζεται σύνδεση.' }, 401);
  }

  if (path === '/api/me' && method === 'GET') return json({ ok: true });
  if (path === '/api/summary' && method === 'GET') return summary(env, url);
  if (path === '/api/stats' && method === 'GET') return stats(env, url);
  if (path === '/api/areas' && method === 'GET') return areas(env);
  if (path === '/api/jobs' && method === 'GET') return listJobs(env, url);
  if (path === '/api/jobs' && method === 'POST') return createJob(request, env);

  const m = path.match(/^\/api\/jobs\/(\d+)$/);
  if (m && method === 'PUT') return updateJob(request, env, Number(m[1]));
  if (m && method === 'DELETE') return deleteJob(env, Number(m[1]));

  return json({ error: 'Δεν βρέθηκε.' }, 404);
}

/* ------------------------------------------------------------------ */
/* Σύνδεση                                                             */
/* ------------------------------------------------------------------ */

async function login(request, env) {
  if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) {
    return json({ error: 'Λείπουν τα secrets ADMIN_PASSWORD / SESSION_SECRET.' }, 500);
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const now = Date.now();

  const recent = await env.DB
    .prepare('SELECT COUNT(*) AS c FROM login_attempts WHERE ip = ? AND ts > ?')
    .bind(ip, now - LOCK_MINUTES * 60_000)
    .first();

  if (recent && recent.c >= MAX_ATTEMPTS) {
    return json({ error: `Πολλές λάθος προσπάθειες. Δοκίμασε ξανά σε ${LOCK_MINUTES} λεπτά.` }, 429);
  }

  const body = await readJson(request);
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!(await safeEqual(password, env.ADMIN_PASSWORD))) {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO login_attempts (ip, ts) VALUES (?, ?)').bind(ip, now),
      env.DB.prepare('DELETE FROM login_attempts WHERE ts < ?').bind(now - 86_400_000),
    ]);
    return json({ error: 'Λάθος κωδικός.' }, 401);
  }

  await env.DB.prepare('DELETE FROM login_attempts WHERE ip = ?').bind(ip).run();

  const exp = String(now + SESSION_DAYS * 86_400_000);
  const token = `${exp}.${await sign(exp, env.SESSION_SECRET)}`;
  return json({ ok: true }, 200, { 'Set-Cookie': cookie(token, SESSION_DAYS * 86_400) });
}

function logout() {
  return json({ ok: true }, 200, { 'Set-Cookie': cookie('', 0) });
}

function cookie(value, maxAge) {
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

async function isAuthed(request, env) {
  if (!env.SESSION_SECRET) return false;
  const raw = request.headers.get('Cookie') || '';
  const pair = raw.split(/;\s*/).find((c) => c.startsWith(COOKIE_NAME + '='));
  if (!pair) return false;

  const [exp, sig] = pair.slice(COOKIE_NAME.length + 1).split('.');
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;

  return safeEqual(sig, await sign(exp, env.SESSION_SECRET));
}

function isSameOrigin(request, url) {
  const origin = request.headers.get('Origin');
  return !origin || origin === url.origin;
}

/* ------------------------------------------------------------------ */
/* Ραντεβού                                                            */
/* ------------------------------------------------------------------ */

async function listJobs(env, url) {
  const from = dateParam(url, 'from');
  const to = dateParam(url, 'to');
  const phone = (url.searchParams.get('phone') || '').replace(/\s+/g, '').slice(0, 30);

  let sql = 'SELECT * FROM jobs WHERE 1 = 1';
  const args = [];
  if (from) { sql += ' AND job_date >= ?'; args.push(from); }
  if (to) { sql += ' AND job_date <= ?'; args.push(to); }
  if (phone) { sql += ' AND phone = ?'; args.push(phone); }
  sql += " ORDER BY job_date DESC, COALESCE(job_time, '') DESC, id DESC LIMIT 1000";

  const { results } = await env.DB.prepare(sql).bind(...args).all();
  return json({ jobs: results });
}

async function createJob(request, env) {
  const { job, error } = parseJob(await readJson(request));
  if (error) return json({ error }, 400);

  const row = await env.DB
    .prepare(`INSERT INTO jobs (${FIELDS.join(', ')}) VALUES (${FIELDS.map(() => '?').join(', ')}) RETURNING *`)
    .bind(...FIELDS.map((f) => job[f]))
    .first();

  return json({ job: row }, 201);
}

async function updateJob(request, env, id) {
  const { job, error } = parseJob(await readJson(request));
  if (error) return json({ error }, 400);

  const row = await env.DB
    .prepare(`UPDATE jobs SET ${FIELDS.map((f) => `${f} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ? RETURNING *`)
    .bind(...FIELDS.map((f) => job[f]), id)
    .first();

  if (!row) return json({ error: 'Το ραντεβού δεν βρέθηκε.' }, 404);
  return json({ job: row });
}

async function deleteJob(env, id) {
  const res = await env.DB.prepare('DELETE FROM jobs WHERE id = ?').bind(id).run();
  if (!res.meta.changes) return json({ error: 'Το ραντεβού δεν βρέθηκε.' }, 404);
  return json({ ok: true });
}

function parseJob(body) {
  if (!body || typeof body !== 'object') return { error: 'Κενό αίτημα.' };

  const str = (v, max) => (v == null ? '' : String(v)).trim().slice(0, max);
  const money = (v) => {
    if (v === '' || v == null) return null;
    const n = Number(String(v).replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) && n >= 0 && n < 1_000_000 ? Math.round(n * 100) / 100 : undefined;
  };

  const job = {
    job_date: str(body.job_date, 10),
    job_time: str(body.job_time, 5) || null,
    customer_name: str(body.customer_name, 120),
    phone: str(body.phone, 40).replace(/\s+/g, ''),
    area: str(body.area, 80),
    service: str(body.service, 60),
    agreed_price: money(body.agreed_price),
    collected: money(body.collected),
    payment_method: str(body.payment_method, 10) || 'cash',
    status: str(body.status, 10) || 'scheduled',
    notes: str(body.notes, 1000),
  };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(job.job_date)) return { error: 'Βάλε ημερομηνία.' };
  if (job.job_time && !/^\d{2}:\d{2}$/.test(job.job_time)) return { error: 'Η ώρα δεν είναι σωστή.' };
  if (!job.customer_name) return { error: 'Βάλε όνομα πελάτη.' };
  if (job.agreed_price === undefined || job.collected === undefined) {
    return { error: 'Τα ποσά πρέπει να είναι αριθμοί, π.χ. 60 ή 60,50.' };
  }
  if (!PAYMENT.includes(job.payment_method)) return { error: 'Διάλεξε τρόπο πληρωμής.' };
  if (!STATUS.includes(job.status)) return { error: 'Διάλεξε κατάσταση.' };

  return { job };
}

/* ------------------------------------------------------------------ */
/* Σύνοψη & γραφήματα                                                  */
/* ------------------------------------------------------------------ */

// Εισπράξεις σήμερα / αυτή την εβδομάδα / αυτόν τον μήνα
async function summary(env, url) {
  const today = dateParam(url, 'today');
  const week = dateParam(url, 'week');
  const month = dateParam(url, 'month');
  if (!today || !week || !month) return json({ error: 'Λείπουν ημερομηνίες.' }, 400);

  const row = await env.DB.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN status = 'done' AND job_date = ?1  THEN collected END), 0) AS day_rev,
      COALESCE(SUM(CASE WHEN status = 'done' AND job_date = ?1  THEN 1 END), 0)         AS day_jobs,
      COALESCE(SUM(CASE WHEN status = 'scheduled' AND job_date = ?1 THEN 1 END), 0)     AS day_open,
      COALESCE(SUM(CASE WHEN status = 'done' AND job_date >= ?2 THEN collected END), 0) AS week_rev,
      COALESCE(SUM(CASE WHEN status = 'done' AND job_date >= ?2 THEN 1 END), 0)         AS week_jobs,
      COALESCE(SUM(CASE WHEN status = 'done' AND job_date >= ?3 THEN collected END), 0) AS month_rev,
      COALESCE(SUM(CASE WHEN status = 'done' AND job_date >= ?3 THEN 1 END), 0)         AS month_jobs
    FROM jobs
    WHERE job_date >= MIN(?2, ?3) AND job_date <= ?1
  `).bind(today, week, month).first();

  return json(row);
}

const GROUPS = {
  day: 'job_date',
  week: "date(job_date, 'weekday 0', '-6 days')",   // η Δευτέρα της εβδομάδας
  month: 'substr(job_date, 1, 7)',                    // YYYY-MM
};

async function stats(env, url) {
  const group = url.searchParams.get('group');
  const from = dateParam(url, 'from');
  const to = dateParam(url, 'to');
  if (!GROUPS[group] || !from || !to) return json({ error: 'Λάθος παράμετροι.' }, 400);

  const period = GROUPS[group]; // μόνο από τη λίστα GROUPS, ποτέ από τον χρήστη

  const [series, byPayment, byArea, totals] = await env.DB.batch([
    env.DB.prepare(`
      SELECT ${period} AS period,
             COALESCE(SUM(CASE WHEN status = 'done' THEN collected END), 0) AS revenue,
             COALESCE(SUM(CASE WHEN status = 'done' THEN 1 END), 0)         AS jobs
      FROM jobs
      WHERE job_date BETWEEN ?1 AND ?2
      GROUP BY period
      ORDER BY period
    `).bind(from, to),

    env.DB.prepare(`
      SELECT payment_method, COALESCE(SUM(collected), 0) AS revenue, COUNT(*) AS jobs
      FROM jobs
      WHERE status = 'done' AND job_date BETWEEN ?1 AND ?2
      GROUP BY payment_method
    `).bind(from, to),

    env.DB.prepare(`
      SELECT area, COALESCE(SUM(collected), 0) AS revenue, COUNT(*) AS jobs
      FROM jobs
      WHERE status = 'done' AND area <> '' AND job_date BETWEEN ?1 AND ?2
      GROUP BY area
      ORDER BY revenue DESC
      LIMIT 8
    `).bind(from, to),

    env.DB.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN status = 'done' THEN collected END), 0) AS revenue,
        COALESCE(SUM(CASE WHEN status = 'done' THEN 1 END), 0)         AS jobs,
        COALESCE(SUM(CASE WHEN status = 'cancelled' THEN 1 END), 0)    AS cancelled
      FROM jobs
      WHERE job_date BETWEEN ?1 AND ?2
    `).bind(from, to),
  ]);

  return json({
    series: series.results,
    byPayment: byPayment.results,
    byArea: byArea.results,
    totals: totals.results[0],
  });
}

async function areas(env) {
  const { results } = await env.DB.prepare(`
    SELECT area, COUNT(*) AS c FROM jobs
    WHERE area <> '' GROUP BY area ORDER BY c DESC LIMIT 60
  `).all();
  return json({ areas: results.map((r) => r.area) });
}

/* ------------------------------------------------------------------ */
/* Βοηθητικά                                                           */
/* ------------------------------------------------------------------ */

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

function dateParam(url, name) {
  const v = url.searchParams.get(name) || '';
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

const encode = (s) => new TextEncoder().encode(s);

async function sign(data, secret) {
  const key = await crypto.subtle.importKey(
    'raw', encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, encode(data)));
  let s = '';
  for (const b of sig) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Σύγκριση σε σταθερό χρόνο (δεν «μαρτυράει» τον κωδικό μέσω χρονισμού)
async function safeEqual(a, b) {
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', encode(a)),
    crypto.subtle.digest('SHA-256', encode(b)),
  ]);
  if (typeof crypto.subtle.timingSafeEqual === 'function') {
    return crypto.subtle.timingSafeEqual(ha, hb);
  }
  const x = new Uint8Array(ha);
  const y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
