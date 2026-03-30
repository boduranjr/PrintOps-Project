import os
import csv
import io
import sqlite3
import random
from datetime import datetime, timedelta, timezone
from functools import wraps

import jwt
from flask import Flask, jsonify, request, Response
from flask_cors import CORS

BASE_DIR = os.path.dirname(__file__)
DB_PATH = os.path.join(BASE_DIR, "printops.db")

JWT_SECRET = os.environ.get("JWT_SECRET", "dev_secret_change_me")
JWT_ALG = "HS256"
TOKEN_HOURS = 12

STATUSES = ["Scheduled", "In Progress", "Completed", "On Hold"]
TYPES = ["Print", "Bindery", "Shipping", "Other"]
PRIORITIES = ["Low", "Normal", "High", "Rush"]


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def ensure_column(conn, table, column, coldef):
    cur = conn.cursor()
    cols = cur.execute(f"PRAGMA table_info({table})").fetchall()
    existing = {c["name"] for c in cols}
    if column not in existing:
        cur.execute(f"ALTER TABLE {table} ADD COLUMN {column} {coldef}")
        conn.commit()


def init_db():
    conn = db()
    cur = conn.cursor()

    # Users (simple demo auth)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'staff',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)

    # Jobs
    cur.execute("""
        CREATE TABLE IF NOT EXISTS jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_code TEXT NOT NULL,
            due_date TEXT NOT NULL,
            job_type TEXT NOT NULL,
            status TEXT NOT NULL,
            notes TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)

    # Add pro columns if missing
    ensure_column(conn, "jobs", "customer", "TEXT NOT NULL DEFAULT ''")
    ensure_column(conn, "jobs", "priority", "TEXT NOT NULL DEFAULT 'Normal'")
    ensure_column(conn, "jobs", "quantity", "INTEGER NOT NULL DEFAULT 0")
    ensure_column(conn, "jobs", "updated_at", "TEXT NOT NULL DEFAULT (datetime('now'))")

    # Settings
    cur.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    """)

    # Audit log
    cur.execute("""
        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            actor TEXT NOT NULL,
            action TEXT NOT NULL,
            entity TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            detail TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)

    # defaults
    defaults = {
        "company_name": "Royal Printing Service",
        "dashboard_title": "PrintOps Dashboard",
        "due_soon_days": "2",
        "timezone_label": "Local",
        "page_size": "10",
    }
    for k, v in defaults.items():
        cur.execute("INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)", (k, v))

    # Seed demo users (admin/staff)
    cur.execute("INSERT OR IGNORE INTO users(username, password, role) VALUES (?, ?, ?)", ("admin", "admin123", "admin"))
    cur.execute("INSERT OR IGNORE INTO users(username, password, role) VALUES (?, ?, ?)", ("staff", "staff123", "staff"))

    conn.commit()
    conn.close()


def log_audit(actor, action, entity, entity_id, detail=""):
    conn = db()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO audit_log(actor, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?)",
        (actor, action, entity, str(entity_id), detail[:500]),
    )
    conn.commit()
    conn.close()


def get_settings():
    conn = db()
    rows = conn.execute("SELECT key, value FROM settings").fetchall()
    conn.close()
    return {r["key"]: r["value"] for r in rows}


def set_setting(key, value):
    conn = db()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO settings(key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value
    """, (key, value))
    conn.commit()
    conn.close()


def seed_jobs(force=False):
    conn = db()
    cur = conn.cursor()
    count = cur.execute("SELECT COUNT(*) AS c FROM jobs").fetchone()["c"]
    if count > 0 and not force:
        conn.close()
        return {"seeded": 0, "skipped": True, "reason": "jobs already exist"}

    if force:
        cur.execute("DELETE FROM jobs")

    base = datetime.now().date()
    seeded = 0

    customers = ["Acme Co", "Garden State", "BlueWave", "Hudson Media", "NJ County", "Monarch Inc"]

    for i in range(65):
        prefix = random.choice(["NJ", "RPS", "BALLOT", "SHIP", "BIND"])
        code = f"{prefix}-{1200 + i}"
        shift = random.choice(list(range(-7, 30)))
        due = (base + timedelta(days=shift)).isoformat()

        job_type = random.choice(TYPES)
        status = random.choices(STATUSES, weights=[40, 25, 20, 15], k=1)[0]
        notes = random.choice(["Paper stock confirmed", "Waiting approval", "Rush order", "Customer pickup", "Proof sent", ""])
        customer = random.choice(customers)
        priority = random.choices(PRIORITIES, weights=[15, 55, 20, 10], k=1)[0]
        quantity = random.choice([0, 250, 500, 1000, 2000, 5000])

        cur.execute(
            "INSERT INTO jobs(job_code, due_date, job_type, status, notes, customer, priority, quantity) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (code, due, job_type, status, notes, customer, priority, quantity),
        )
        seeded += 1

    conn.commit()
    conn.close()
    return {"seeded": seeded, "skipped": False}


def make_token(username, role):
    now = datetime.now(timezone.utc)
    payload = {
        "sub": username,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=TOKEN_HOURS)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def decode_token(token):
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])


def require_auth(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return jsonify({"error": "Missing token"}), 401

        token = auth.replace("Bearer ", "").strip()
        try:
            payload = decode_token(token)
            request.user = payload.get("sub")
            request.role = payload.get("role", "staff")
        except Exception:
            return jsonify({"error": "Invalid/expired token"}), 401

        return fn(*args, **kwargs)
    return wrapper


def require_role(*roles):
    def deco(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            if getattr(request, "role", "staff") not in roles:
                return jsonify({"error": "Forbidden"}), 403
            return fn(*args, **kwargs)
        return wrapper
    return deco


app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": ["http://localhost:5173", "http://127.0.0.1:5173"]}})

init_db()
seed_jobs(force=False)


@app.get("/api/health")
def health():
    return jsonify({"ok": True})


@app.post("/api/login")
def login():
    data = request.get_json(force=True, silent=True) or {}
    username = (data.get("username") or "").strip()
    password = (data.get("password") or "").strip()

    conn = db()
    row = conn.execute("SELECT username, password, role FROM users WHERE username=?", (username,)).fetchone()
    conn.close()

    if not row or row["password"] != password:
        return jsonify({"error": "Invalid credentials"}), 401

    token = make_token(row["username"], row["role"])
    log_audit(row["username"], "LOGIN", "auth", row["username"], "User logged in")

    return jsonify({
        "token": token,
        "user": {"username": row["username"], "role": row["role"]}
    })


@app.get("/api/me")
@require_auth
def me():
    return jsonify({"username": request.user, "role": request.role})


@app.get("/api/settings")
@require_auth
def get_settings_api():
    return jsonify(get_settings())


@app.put("/api/settings")
@require_auth
@require_role("admin")
def put_settings_api():
    data = request.get_json(force=True, silent=True) or {}
    allowed = {"company_name", "dashboard_title", "due_soon_days", "timezone_label", "page_size"}
    for k, v in data.items():
        if k in allowed:
            set_setting(k, str(v))
    log_audit(request.user, "UPDATE", "settings", "all", "Updated settings")
    return jsonify(get_settings())


@app.get("/api/audit")
@require_auth
@require_role("admin")
def audit():
    limit = int(request.args.get("limit", "50"))
    conn = db()
    rows = conn.execute("""
        SELECT id, actor, action, entity, entity_id, detail, created_at
        FROM audit_log
        ORDER BY id DESC
        LIMIT ?
    """, (limit,)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.post("/api/seed")
@require_auth
@require_role("admin")
def seed():
    data = request.get_json(force=True, silent=True) or {}
    force = bool(data.get("force", False))
    result = seed_jobs(force=force)
    log_audit(request.user, "SEED", "jobs", "bulk", f"force={force} result={result}")
    return jsonify(result)


# ---------------------------
# JOBS: server-side pagination & filters
# ---------------------------
@app.get("/api/jobs")
@require_auth
def list_jobs():
    q = (request.args.get("q") or "").strip().lower()
    status = (request.args.get("status") or "").strip()
    job_type = (request.args.get("type") or "").strip()
    page = max(1, int(request.args.get("page", "1")))
    page_size = max(5, min(50, int(request.args.get("page_size", get_settings().get("page_size", "10")))))

    where = []
    params = []

    if q:
        where.append("(lower(job_code) LIKE ? OR lower(customer) LIKE ?)")
        params.extend([f"%{q}%", f"%{q}%"])
    if status and status != "All":
        where.append("status = ?")
        params.append(status)
    if job_type and job_type != "All":
        where.append("job_type = ?")
        params.append(job_type)

    where_sql = ("WHERE " + " AND ".join(where)) if where else ""

    conn = db()
    total = conn.execute(f"SELECT COUNT(*) as c FROM jobs {where_sql}", params).fetchone()["c"]

    offset = (page - 1) * page_size
    rows = conn.execute(
        f"""
        SELECT *
        FROM jobs
        {where_sql}
        ORDER BY date(due_date) ASC, id ASC
        LIMIT ? OFFSET ?
        """,
        params + [page_size, offset],
    ).fetchall()
    conn.close()

    return jsonify({
        "items": [dict(r) for r in rows],
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": max(1, (total + page_size - 1) // page_size),
    })


@app.post("/api/jobs")
@require_auth
@require_role("admin", "staff")
def create_job():
    data = request.get_json(force=True, silent=True) or {}
    job_code = (data.get("job_code") or "").strip()
    due_date = (data.get("due_date") or "").strip()
    job_type = (data.get("job_type") or "Print").strip()
    status = (data.get("status") or "Scheduled").strip()
    notes = (data.get("notes") or "").strip()
    customer = (data.get("customer") or "").strip()
    priority = (data.get("priority") or "Normal").strip()
    quantity = int(data.get("quantity") or 0)

    if not job_code:
        return jsonify({"error": "job_code is required"}), 400
    if not due_date:
        return jsonify({"error": "due_date is required"}), 400
    if status not in STATUSES:
        return jsonify({"error": "Invalid status"}), 400
    if job_type not in TYPES:
        return jsonify({"error": "Invalid job type"}), 400
    if priority not in PRIORITIES:
        return jsonify({"error": "Invalid priority"}), 400

    conn = db()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO jobs(job_code, due_date, job_type, status, notes, customer, priority, quantity, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    """, (job_code, due_date, job_type, status, notes, customer, priority, quantity))
    conn.commit()
    new_id = cur.lastrowid
    row = conn.execute("SELECT * FROM jobs WHERE id=?", (new_id,)).fetchone()
    conn.close()

    log_audit(request.user, "CREATE", "job", new_id, f"{job_code} {customer} {status}")
    return jsonify(dict(row)), 201


@app.put("/api/jobs/<int:job_id>")
@require_auth
@require_role("admin", "staff")
def update_job(job_id):
    data = request.get_json(force=True, silent=True) or {}

    fields = {}
    for k in ["job_code", "due_date", "job_type", "status", "notes", "customer", "priority", "quantity"]:
        if k in data and data[k] is not None:
            fields[k] = data[k]

    if "status" in fields and str(fields["status"]) not in STATUSES:
        return jsonify({"error": "Invalid status"}), 400
    if "job_type" in fields and str(fields["job_type"]) not in TYPES:
        return jsonify({"error": "Invalid job type"}), 400
    if "priority" in fields and str(fields["priority"]) not in PRIORITIES:
        return jsonify({"error": "Invalid priority"}), 400

    if not fields:
        return jsonify({"error": "No updates provided"}), 400

    fields["updated_at"] = "datetime('now')"  # special

    sets = []
    vals = []
    for k, v in fields.items():
        if k == "updated_at":
            sets.append("updated_at = datetime('now')")
        else:
            sets.append(f"{k}=?")
            vals.append(v)

    vals.append(job_id)

    conn = db()
    cur = conn.cursor()
    cur.execute(f"UPDATE jobs SET {', '.join(sets)} WHERE id=?", vals)
    conn.commit()
    row = conn.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
    conn.close()

    if not row:
        return jsonify({"error": "Not found"}), 404

    log_audit(request.user, "UPDATE", "job", job_id, f"Updated fields: {list(fields.keys())}")
    return jsonify(dict(row))


@app.delete("/api/jobs/<int:job_id>")
@require_auth
@require_role("admin")
def delete_job(job_id):
    conn = db()
    cur = conn.cursor()
    row = conn.execute("SELECT job_code FROM jobs WHERE id=?", (job_id,)).fetchone()
    cur.execute("DELETE FROM jobs WHERE id=?", (job_id,))
    conn.commit()
    deleted = cur.rowcount
    conn.close()

    if deleted == 0:
        return jsonify({"error": "Not found"}), 404

    log_audit(request.user, "DELETE", "job", job_id, f"Deleted {row['job_code'] if row else ''}")
    return jsonify({"deleted": True})


@app.get("/api/jobs/export")
@require_auth
@require_role("admin", "staff")
def export_jobs():
    # Same filters as /api/jobs (without pagination)
    q = (request.args.get("q") or "").strip().lower()
    status = (request.args.get("status") or "").strip()
    job_type = (request.args.get("type") or "").strip()

    where = []
    params = []

    if q:
        where.append("(lower(job_code) LIKE ? OR lower(customer) LIKE ?)")
        params.extend([f"%{q}%", f"%{q}%"])
    if status and status != "All":
        where.append("status = ?")
        params.append(status)
    if job_type and job_type != "All":
        where.append("job_type = ?")
        params.append(job_type)

    where_sql = ("WHERE " + " AND ".join(where)) if where else ""

    conn = db()
    rows = conn.execute(
        f"SELECT * FROM jobs {where_sql} ORDER BY date(due_date) ASC, id ASC",
        params
    ).fetchall()
    conn.close()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "job_code", "customer", "due_date", "job_type", "status", "priority", "quantity", "notes", "created_at", "updated_at"])
    for r in rows:
        writer.writerow([
            r["id"], r["job_code"], r["customer"], r["due_date"], r["job_type"], r["status"],
            r["priority"], r["quantity"], r["notes"], r["created_at"], r["updated_at"]
        ])

    log_audit(request.user, "EXPORT", "jobs", "csv", f"rows={len(rows)}")
    csv_data = output.getvalue()
    return Response(
        csv_data,
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=jobs_export.csv"}
    )


@app.get("/api/reports")
@require_auth
def reports():
    settings = get_settings()
    due_soon_days = int(settings.get("due_soon_days", "2") or "2")
    today = datetime.now().date()

    conn = db()
    rows = conn.execute("SELECT * FROM jobs").fetchall()
    conn.close()

    jobs = [dict(r) for r in rows]
    total = len(jobs) or 1

    by_status = {s: 0 for s in STATUSES}
    by_type = {t: 0 for t in TYPES}
    by_priority = {p: 0 for p in PRIORITIES}

    overdue = 0
    due_soon = 0

    for j in jobs:
        by_status[j["status"]] = by_status.get(j["status"], 0) + 1
        by_type[j["job_type"]] = by_type.get(j["job_type"], 0) + 1
        by_priority[j["priority"]] = by_priority.get(j["priority"], 0) + 1

        try:
            due = datetime.fromisoformat(j["due_date"]).date()
            diff = (due - today).days
            if diff < 0:
                overdue += 1
            elif diff <= due_soon_days:
                due_soon += 1
        except Exception:
            pass

    return jsonify({
        "summary": {
            "total": len(jobs),
            "overdue": overdue,
            "dueSoon": due_soon,
            "dueSoonDays": due_soon_days,
        },
        "byStatus": by_status,
        "byType": by_type,
        "byPriority": by_priority,
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    })


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5001, debug=True)
