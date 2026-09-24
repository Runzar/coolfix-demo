-- ΔΟΚΙΜΑΣΤΙΚΑ ραντεβού για να δείχνει «γεμάτο» το demo στον πελάτη.
-- ~140 ραντεβού στους τελευταίους 3 μήνες + μερικά κλεισμένα για τις επόμενες μέρες.
-- ΠΡΙΝ την πραγματική χρήση σβήσ' τα με:   DELETE FROM jobs;

INSERT INTO jobs (job_date, job_time, customer_name, phone, area, service,
                  agreed_price, collected, payment_method, status, notes)
WITH RECURSIVE
  n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 140),
  g AS (SELECT i, (i * 2654435761) % 4294967296 AS h FROM n),
  base AS (
    SELECT
      date('now', (5 - (h % 95)) || ' days') AS d,
      printf('%02d:%s', 9 + (h / 97) % 10, CASE (h / 13) % 2 WHEN 0 THEN '00' ELSE '30' END) AS t,
      CASE (h / 1009) % 10
        WHEN 0 THEN 'Νίκος Παπαδόπουλος' WHEN 1 THEN 'Μαρία Κωνσταντίνου'
        WHEN 2 THEN 'Γιώργος Αντωνίου'   WHEN 3 THEN 'Ελένη Δημητρίου'
        WHEN 4 THEN 'Κώστας Νικολάου'    WHEN 5 THEN 'Αννα Γεωργίου'
        WHEN 6 THEN 'Δημήτρης Ιωάννου'   WHEN 7 THEN 'Σοφία Παππά'
        WHEN 8 THEN 'Παναγιώτης Λάμπρου' ELSE 'Κατερίνα Βλάχου' END AS name,
      '69' || printf('%08d', (h * 31) % 100000000) AS phone,
      CASE (h / 10007) % 12
        WHEN 0 THEN 'Αθήνα Κέντρο' WHEN 1 THEN 'Πειραιάς'   WHEN 2 THEN 'Περιστέρι'
        WHEN 3 THEN 'Μαρούσι'      WHEN 4 THEN 'Χαλάνδρι'   WHEN 5 THEN 'Γλυφάδα'
        WHEN 6 THEN 'Καλλιθέα'     WHEN 7 THEN 'Νέα Σμύρνη' WHEN 8 THEN 'Αγία Παρασκευή'
        WHEN 9 THEN 'Αιγάλεω'      WHEN 10 THEN 'Ελληνικό'  ELSE 'Αργυρούπολη' END AS area,
      (h / 100003) % 5 AS s,
      (h / 1000003) % 8 AS v,
      CASE WHEN (h / 7) % 10 < 5 THEN 'cash' WHEN (h / 7) % 10 < 8 THEN 'card' ELSE 'bank' END AS pay,
      h % 11 AS r
    FROM g
  ),
  shaped AS (
    SELECT d, t, name, phone, area, pay,
      CASE s WHEN 0 THEN 'Service / Συντήρηση' WHEN 1 THEN 'Επισκευή βλάβης'
             WHEN 2 THEN 'Εγκατάσταση' WHEN 3 THEN 'Καθαρισμός' ELSE 'Διάγνωση' END AS service,
      CASE s WHEN 0 THEN 50 + (v % 4) * 10
             WHEN 1 THEN 80 + v * 15
             WHEN 2 THEN 150 + v * 25
             WHEN 3 THEN 40 + (v % 3) * 10
             ELSE 30 + (v % 3) * 10 END AS price,
      CASE WHEN d > date('now') THEN 'scheduled'
           WHEN d = date('now') AND r % 2 = 0 THEN 'scheduled'
           WHEN r = 0 THEN 'cancelled'
           ELSE 'done' END AS st
    FROM base
  )
SELECT d, t, name, phone, area, service, price,
       CASE WHEN st = 'done' THEN price END, pay, st, 'Δοκιμαστικό'
FROM shaped;

-- Μερικά για σήμερα, ώστε η πάνω μπάρα να δείχνει κίνηση στο demo
INSERT INTO jobs (job_date, job_time, customer_name, phone, area, service, agreed_price, collected, payment_method, status, notes) VALUES
  (date('now'), '09:30', 'Γιάννης Σταύρου',   '6971234567', 'Χαλάνδρι',   'Service / Συντήρηση', 60,  60,   'cash', 'done',      'Δοκιμαστικό'),
  (date('now'), '12:00', 'Φωτεινή Αλεξίου',   '6982345678', 'Μαρούσι',    'Επισκευή βλάβης',     120, 120,  'card', 'done',      'Δοκιμαστικό'),
  (date('now'), '17:00', 'Στέλιος Καραγιάννη','6943456789', 'Νέα Σμύρνη', 'Εγκατάσταση',         220, NULL, 'bank', 'scheduled', 'Δοκιμαστικό');
