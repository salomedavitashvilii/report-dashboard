# -*- coding: utf-8 -*-
import os
import json
import math
import time
import sqlite3
import urllib.parse
from datetime import timedelta, datetime, timezone

import psycopg2
from psycopg2.extras import RealDictCursor
import requests
from flask import Flask, render_template, jsonify, request, redirect, url_for, session
from flask_login import (
    LoginManager,
    UserMixin,
    login_user,
    login_required,
    logout_user,
    current_user,
)
from werkzeug.security import check_password_hash, generate_password_hash
import secrets


# =========================
# SIMPLE API CACHE
# =========================

CACHE = {}
CACHE_TTL = 300  # 5 წუთი

WEATHER_CACHE = {}
WEATHER_CACHE_TTL = 3600  # 1 საათი


def get_cached_data(cache_key):
    item = CACHE.get(cache_key)
    if not item:
        return None

    created_at, data = item

    if time.time() - created_at > CACHE_TTL:
        del CACHE[cache_key]
        return None

    return data


def set_cached_data(cache_key, data):
    CACHE[cache_key] = (time.time(), data)


# =========================
# APP CONFIG
# =========================

APP_TITLE = "REPORT Dashboard"
OWM_API_KEY = os.environ.get("OWM_API_KEY", "")

WFS_URL = "https://wblr.napr.gov.ge/data/SLR/ows"
WFS_USER = "wblr_user"
WFS_PASS = "WFS_editor"
TYPENAME = "SLR:GFLD_PARCELS"
SRSNAME = "EPSG:32638"

FUNCTION_LABELS = {
    "1": "სასოფლო-სამეურნეო",
    "2": "არასასოფლო-სამეურნეო",
}

CATEGORY_LABELS = {
    "1": "საკარმიდამო",
    "2": "სახნავი",
    "3": "საძოვარი",
    "4": "სათიბი",
}

MANAGER_PREFIXES = ["10", "11", "12", "13",
                    "14", "9", "8", "7", "6", "4", "3", "2", "1"]

AZOMVIS_LABELS = {
    "0": "პირველადი აზომვა",
    "1": "ცვლილება",
    "2": "გადამოწმება",
    "3": "წასაშლელი",
    "4": "სპორადული",
}

app = Flask(
    __name__,
    static_url_path="/static",
    static_folder="static",
    template_folder="templates",
)

app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", secrets.token_hex(32))
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=7)
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SESSION_COOKIE_SECURE"] = False


# =========================
# DATABASE
# =========================

DATABASE_URL = os.environ.get("DATABASE_URL")
SQLITE_PATH = os.path.join(os.path.dirname(__file__), "rain_days.db")
USE_SQLITE = not DATABASE_URL


def get_db_connection():
    if USE_SQLITE:
        conn = sqlite3.connect(SQLITE_PATH)
        conn.row_factory = sqlite3.Row
        return conn
    return psycopg2.connect(DATABASE_URL)


def db_param():
    return "?" if USE_SQLITE else "%s"


def init_db():
    conn = get_db_connection()
    cur = conn.cursor()

    if USE_SQLITE:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS rain_days (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                rain_date TEXT NOT NULL,
                zone TEXT NOT NULL,
                UNIQUE (rain_date, zone)
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts TEXT NOT NULL,
                username TEXT NOT NULL,
                action TEXT NOT NULL,
                details TEXT
            )
        """)
    else:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS rain_days (
                id SERIAL PRIMARY KEY,
                rain_date TEXT NOT NULL,
                zone TEXT NOT NULL,
                UNIQUE (rain_date, zone)
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS audit_log (
                id SERIAL PRIMARY KEY,
                ts TEXT NOT NULL,
                username TEXT NOT NULL,
                action TEXT NOT NULL,
                details TEXT
            )
        """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS zone_targets (
            zone TEXT PRIMARY KEY,
            target_count INTEGER NOT NULL DEFAULT 0
        )
    """)

    conn.commit()
    cur.close()
    conn.close()


def log_action(username, action, details=""):
    try:
        ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        p = db_param()
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            f"INSERT INTO audit_log (ts, username, action, details) VALUES ({p},{p},{p},{p})",
            (ts, username, action, str(details)[:500]),
        )
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print("Audit log error:", e)


# =========================
# LOGIN
# =========================

login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = "login"
login_manager.login_message = "გთხოვთ გაიაროთ ავტორიზაცია"


class User(UserMixin):
    def __init__(self, username):
        self.id = username
        self.username = username


USERS = {
    "Lnukradze": {
        "password": generate_password_hash("admin1177"),
        "name": "ლუკა ნუკრაძე",
    },
    "user1": {
        "password": generate_password_hash("user2025"),
        "name": "USER",
    },
}


@login_manager.user_loader
def load_user(user_id):
    if user_id in USERS:
        return User(user_id)
    return None


@app.route("/login", methods=["GET", "POST"])
def login():
    if current_user.is_authenticated:
        return redirect(url_for("index"))

    if request.method == "POST":
        username = request.form.get("username")
        password = request.form.get("password")
        remember = request.form.get("remember") == "on"

        if username in USERS and check_password_hash(USERS[username]["password"], password):
            user = User(username)
            login_user(user, remember=remember)
            log_action(username, "LOGIN", request.remote_addr)

            if remember:
                session.permanent = True

            next_page = request.args.get("next")
            return redirect(next_page or url_for("index"))

        return render_template(
            "login.html",
            error="არასწორი მომხმარებელი ან პაროლი",
        )

    return render_template("login.html")


@app.route("/logout")
@login_required
def logout():
    log_action(current_user.username, "LOGOUT", "")
    logout_user()
    return redirect(url_for("login"))


@app.route("/")
@login_required
def index():
    user_display_name = USERS.get(current_user.username, {}).get(
        "name",
        current_user.username,
    )

    return render_template(
        "index.html",
        app_title=APP_TITLE,
        username=current_user.username,
        user_display_name=user_display_name,
        owm_api_key=OWM_API_KEY,
    )


# =========================
# HELPERS
# =========================

def _split_multi(val: str):
    if not val:
        return []

    raw = [x.strip() for x in val.replace(",", " ").split()]
    return list(dict.fromkeys([x for x in raw if x]))


# =========================
# WFS DATA API
# =========================

@app.route("/api/data")
@login_required
def api_data():
    cache_key = request.query_string.decode("utf-8")

    cached = get_cached_data(cache_key)
    if cached is not None and request.args.get("refresh") != "1":
        return jsonify(cached)

    zones = _split_multi(request.args.get("zone", ""))
    sectors = _split_multi(request.args.get("sector", ""))
    date_from = request.args.get("date_from", "").strip()
    date_to = request.args.get("date_to", "").strip()
    azomvis = _split_multi(request.args.get("azomvis", ""))
    manager = request.args.get("manager", "").strip()

    cql = []

    if zones:
        if len(zones) == 1:
            cql.append(f"ZONE='{zones[0]}'")
        else:
            ors = " OR ".join([f"ZONE='{z}'" for z in zones])
            cql.append(f"({ors})")

    if sectors:
        if len(sectors) == 1:
            cql.append(f"SECTOR='{sectors[0]}'")
        else:
            ors = " OR ".join([f"SECTOR='{s}'" for s in sectors])
            cql.append(f"({ors})")

    if date_from:
        start_date_time = f"{date_from} 00:00:00"

        if date_to:
            end_date_time = f"{date_to} 23:59:59"
        else:
            end_date_time = f"{date_from} 23:59:59"

        cql.append(f"DATE_ BETWEEN '{start_date_time}' AND '{end_date_time}'")

    if azomvis:
        ors = " OR ".join([f"AZOMVIS_TIPI='{a}'" for a in azomvis])
        cql.append(f"({ors})")

    final_cql = " AND ".join([p for p in cql if p])

    params = {
        "service": "WFS",
        "version": "2.0.0",
        "request": "GetFeature",
        "typeNames": TYPENAME,
        "srsName": SRSNAME,
        "outputFormat": "application/json",
    }

    if final_cql:
        params["cql_filter"] = final_cql

    url = WFS_URL + "?" + urllib.parse.urlencode(params, safe=":=><' ")

    try:
        print("--- [WFS Request] ---")
        print("FINAL CQL:", final_cql)
        print("URL:", url)

        r = requests.get(url, auth=(WFS_USER, WFS_PASS), timeout=60)
        r.raise_for_status()

        data = r.json()
        features = data.get("features", [])

        print("--- [WFS Response] ---")
        print(f"Features received after filters: {len(features)}")

        rows = []

        for ft in features:
            props = ft.get("properties", {}) or {}
            geom = ft.get("geometry")
            wkt_geom_text = json.dumps(
                geom, ensure_ascii=False) if geom else ""

            tag = props.get("TAG", "")
            cad = props.get("CADCODE", "")
            date = props.get("DATE_", "")
            zone = str(props.get("ZONE", "") or "")
            sector = str(props.get("SECTOR", "") or "")
            function = str(props.get("FUNCTION", "") or "")
            category = str(props.get("CATEGORY", "") or "")
            azomvis_tipi = str(props.get("AZOMVIS_TIPI", "") or "")

            rows.append(
                {
                    "TAG": tag,
                    "CADCODE": cad,
                    "DATE_": date,
                    "ZONE": zone,
                    "SECTOR": sector,
                    "FUNCTION": function,
                    "FUNCTION_LABEL": FUNCTION_LABELS.get(function, function),
                    "CATEGORY": category,
                    "CATEGORY_LABEL": CATEGORY_LABELS.get(category, category),
                    "AZOMVIS_TIPI": azomvis_tipi,
                    "AZOMVIS_TIPI_LABEL": AZOMVIS_LABELS.get(
                        azomvis_tipi,
                        azomvis_tipi,
                    ),
                    "wkt_geom": wkt_geom_text,
                }
            )

        if manager and manager in MANAGER_PREFIXES:
            rows = [r for r in rows if str(r["TAG"] or "").startswith(manager)]

        result = {
            "ok": True,
            "count": len(rows),
            "items": rows,
            "filter": final_cql,
        }

        set_cached_data(cache_key, result)
        log_action(current_user.username, "DATA_QUERY",
                   f"zone={request.args.get('zone', '')},count={len(rows)}")

        return jsonify(result)

    except Exception as e:
        print("\n---!!! WFS ERROR !!!---")
        print("Failed URL:", url)
        print("Error details:", e)
        print("-----------------------\n")

        return (
            jsonify(
                {
                    "ok": False,
                    "error": str(e),
                    "items": [],
                    "count": 0,
                    "filter": "ERROR",
                }
            ),
            502,
        )


# =========================
# RAIN DAYS API
# =========================

@app.route("/api/rain-days", methods=["GET"])
@login_required
def get_rain_days():
    try:
        conn = get_db_connection()
        cur = conn.cursor() if USE_SQLITE else conn.cursor(cursor_factory=RealDictCursor)

        cur.execute(
            "SELECT rain_date, zone FROM rain_days ORDER BY rain_date ASC, zone ASC"
        )

        rows = cur.fetchall()
        cur.close()
        conn.close()

        result = {}
        for row in rows:
            date = row["rain_date"]
            zone = row["zone"]
            if date not in result:
                result[date] = []
            result[date].append(zone)

        return jsonify(result)

    except Exception as e:
        print("--- RAIN DAYS GET ERROR ---", e)
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/rain-days", methods=["POST"])
@login_required
def add_rain_day():
    try:
        data = request.get_json() or {}
        rain_date = str(data.get("date", "")).strip()
        zone = str(data.get("zone", "")).strip()

        if not rain_date or not zone:
            return jsonify({"ok": False, "error": "date and zone are required"}), 400

        p = db_param()
        conn = get_db_connection()
        cur = conn.cursor()

        if USE_SQLITE:
            cur.execute(
                f"INSERT OR IGNORE INTO rain_days (rain_date, zone) VALUES ({p}, {p})",
                (rain_date, zone),
            )
        else:
            cur.execute(
                f"INSERT INTO rain_days (rain_date, zone) VALUES ({p}, {p}) ON CONFLICT (rain_date, zone) DO NOTHING",
                (rain_date, zone),
            )

        conn.commit()
        cur.close()
        conn.close()
        log_action(current_user.username, "RAIN_ADD",
                   f"date={rain_date},zone={zone}")
        return jsonify({"ok": True})

    except Exception as e:
        print("--- RAIN DAYS POST ERROR ---", e)
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/rain-days", methods=["DELETE"])
@login_required
def delete_rain_day():
    try:
        data = request.get_json() or {}
        rain_date = str(data.get("date", "")).strip()
        zone = str(data.get("zone", "")).strip()

        if not rain_date or not zone:
            return jsonify({"ok": False, "error": "date and zone are required"}), 400

        p = db_param()
        conn = get_db_connection()
        cur = conn.cursor()

        cur.execute(
            f"DELETE FROM rain_days WHERE rain_date = {p} AND zone = {p}",
            (rain_date, zone),
        )

        conn.commit()
        cur.close()
        conn.close()
        log_action(current_user.username, "RAIN_DEL",
                   f"date={rain_date},zone={zone}")
        return jsonify({"ok": True})

    except Exception as e:
        print("--- RAIN DAYS DELETE ERROR ---", e)
        return jsonify({"ok": False, "error": str(e)}), 500


# =========================
# AUDIT LOG API
# =========================

@app.route("/api/audit-log")
@login_required
def get_audit_log():
    AUDIT_USERS = {"Lnukradze", "user1"}
    if current_user.username not in AUDIT_USERS:
        return jsonify({"ok": False, "error": "unauthorized"}), 403
    try:
        conn = get_db_connection()
        cur = conn.cursor() if USE_SQLITE else conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            "SELECT ts, username, action, details FROM audit_log ORDER BY id DESC LIMIT 300"
        )
        rows = cur.fetchall()
        cur.close()
        conn.close()
        items = [
            {"ts": r["ts"], "username": r["username"],
             "action": r["action"], "details": r["details"]}
            for r in rows
        ]
        return jsonify({"ok": True, "items": items})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# =========================
# ZONE TARGETS API
# =========================

@app.route("/api/targets", methods=["GET"])
@login_required
def get_targets():
    try:
        conn = get_db_connection()
        cur = conn.cursor() if USE_SQLITE else conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            "SELECT zone, target_count FROM zone_targets ORDER BY zone ASC")
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return jsonify({r["zone"]: r["target_count"] for r in rows})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/targets", methods=["POST"])
@login_required
def set_target():
    if current_user.username != "Lnukradze":
        return jsonify({"ok": False, "error": "unauthorized"}), 403
    try:
        data = request.get_json() or {}
        zone = str(data.get("zone", "")).strip()
        target = int(data.get("target", 0))
        if not zone:
            return jsonify({"ok": False, "error": "zone required"}), 400
        p = db_param()
        conn = get_db_connection()
        cur = conn.cursor()
        if USE_SQLITE:
            cur.execute(
                f"INSERT OR REPLACE INTO zone_targets (zone, target_count) VALUES ({p},{p})",
                (zone, target),
            )
        else:
            cur.execute(
                f"INSERT INTO zone_targets (zone, target_count) VALUES ({p},{p}) "
                f"ON CONFLICT (zone) DO UPDATE SET target_count = EXCLUDED.target_count",
                (zone, target),
            )
        conn.commit()
        cur.close()
        conn.close()
        log_action(current_user.username, "TARGET_SET",
                   f"zone={zone},target={target}")
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# =========================
# RAIN IMPACT API
# =========================

@app.route("/api/rain-impact")
@login_required
def rain_impact():
    date_from = request.args.get("date_from", "").strip()
    date_to = request.args.get("date_to",   "").strip()
    if not date_from or not date_to:
        return jsonify({"ok": False, "error": "date_from and date_to required"}), 400
    try:
        from datetime import timedelta as td
        p = db_param()
        conn = get_db_connection()
        cur = conn.cursor() if USE_SQLITE else conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            f"SELECT rain_date, zone FROM rain_days WHERE rain_date >= {p} AND rain_date <= {p}",
            (date_from, date_to),
        )
        rows = cur.fetchall()
        cur.close()
        conn.close()

        rain_by_date = {}
        for r in rows:
            d, z = r["rain_date"], r["zone"]
            rain_by_date.setdefault(d, []).append(z)

        d0 = datetime.strptime(date_from, "%Y-%m-%d").date()
        d1 = datetime.strptime(date_to,   "%Y-%m-%d").date()
        total_days = (d1 - d0).days + 1
        working_days = sum(
            1 for i in range(total_days)
            if (d0 + td(days=i)).weekday() < 5
        )
        rain_working = sum(
            1 for ds in rain_by_date
            if datetime.strptime(ds, "%Y-%m-%d").date().weekday() < 5
        )
        return jsonify({
            "ok": True,
            "date_from":      date_from,
            "date_to":        date_to,
            "total_days":     total_days,
            "working_days":   working_days,
            "rain_days":      len(rain_by_date),
            "rain_working":   rain_working,
            "net_working":    working_days - rain_working,
            "lost_hours":     rain_working * 8,
            "rain_by_date":   rain_by_date,
        })
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# =========================
# WEATHER API
# =========================

@app.route("/api/weather-zones", methods=["POST"])
@login_required
def api_weather_zones():
    from concurrent.futures import ThreadPoolExecutor

    req_data = request.get_json() or {}
    zones = req_data.get("zones", [])
    force = bool(req_data.get("force", False))

    if not zones:
        return jsonify({"ok": False, "error": "no zones provided"}), 400

    results = {}
    to_fetch = []

    for z in zones:
        zid = str(z.get("id", "")).strip()
        if not zid:
            continue
        if not force:
            cached = WEATHER_CACHE.get(f"wx_{zid}")
            if cached:
                ts, val = cached
                if time.time() - ts < WEATHER_CACHE_TTL:
                    results[zid] = val
                    continue
        to_fetch.append(z)

    def _f(v):
        try:
            return float(v) if v is not None else None
        except (ValueError, TypeError):
            return None

    def fetch_one(z):
        zid = str(z.get("id", "")).strip()
        lat, lon = z.get("lat"), z.get("lon")

        cur_wx = {}
        daily_wx = {}
        forecast_days = []

        for _ in range(2):
            cur_wx = {}
            daily_wx = {}
            forecast_days = []

            try:
                wx_url = (
                    f"https://api.open-meteo.com/v1/forecast"
                    f"?latitude={lat}&longitude={lon}"
                    f"&current=temperature_2m,precipitation,wind_speed_10m,relative_humidity_2m,cloud_cover"
                    f"&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,cloud_cover_mean"
                    f"&forecast_days=7&timezone=auto"
                )
                r = requests.get(wx_url, timeout=9)
                if r.ok:
                    wx = r.json()
                    if not wx.get("error"):
                        c = wx.get("current", {})
                        cur_wx = {
                            "temp":     c.get("temperature_2m"),
                            "rain":     c.get("precipitation"),
                            "wind":     c.get("wind_speed_10m") or c.get("windspeed_10m"),
                            "humidity": c.get("relative_humidity_2m") or c.get("relativehumidity_2m"),
                            "cloud":    c.get("cloud_cover") or c.get("cloudcover"),
                        }
                        daily_wx = wx.get("daily", {})
            except Exception:
                pass

            if not any(v is not None for v in cur_wx.values()):
                try:
                    r2 = requests.get(
                        f"https://wttr.in/{lat},{lon}?format=j1",
                        timeout=9, headers={"User-Agent": "WFS-Dashboard/1.0"})
                    if r2.ok:
                        cc = r2.json().get("current_condition", [{}])[0]
                        cur_wx = {
                            "temp":     _f(cc.get("temp_C")),
                            "rain":     _f(cc.get("precipMM")),
                            "wind":     _f(cc.get("windspeedKmph")),
                            "humidity": _f(cc.get("humidity")),
                            "cloud":    _f(cc.get("cloudcover")),
                        }
                        forecast_days = r2.json().get("weather", [])
                except Exception:
                    pass

            if any(v is not None for v in cur_wx.values()):
                break

        if not any(v is not None for v in cur_wx.values()):
            print(f"[Weather] zone {zid} — both attempts failed")
            return zid, None

        aqi_val = None
        try:
            r3 = requests.get(
                f"https://air-quality-api.open-meteo.com/v1/air-quality"
                f"?latitude={lat}&longitude={lon}&current=european_aqi&timezone=auto",
                timeout=9)
            if r3.ok:
                d3j = r3.json()
                if not d3j.get("error"):
                    aqi_val = d3j.get("current", {}).get("european_aqi")
        except Exception:
            pass

        def avg(lst):
            v = [x for x in (lst or []) if x is not None]
            return round(sum(v) / len(v), 1) if v else None

        def rsum(lst):
            v = [x for x in (lst or []) if x is not None]
            return round(sum(v), 1) if v else None

        def rmax(lst):
            v = [x for x in (lst or []) if x is not None]
            return max(v) if v else None

        def om_day(n):
            if daily_wx:
                mx = daily_wx.get("temperature_2m_max", [])[:n]
                mn = daily_wx.get("temperature_2m_min", [])[:n]
                wk = "wind_speed_10m_max" if "wind_speed_10m_max" in daily_wx else "windspeed_10m_max"
                ck = "cloud_cover_mean" if "cloud_cover_mean" in daily_wx else "cloudcover_mean"
                return {
                    "temp":     avg(mx + mn),
                    "rain":     rsum(daily_wx.get("precipitation_sum", [])[:n]),
                    "wind":     rmax(daily_wx.get(wk, [])[:n]),
                    "humidity": None,
                    "cloud":    avg(daily_wx.get(ck, [])[:n]),
                    "aqi":      None,
                }
            temps, winds, clouds, rains = [], [], [], []
            for fd in forecast_days[:n]:
                mx2, mn2 = _f(fd.get("maxtempC")), _f(fd.get("mintempC"))
                if mx2:
                    temps.append(mx2)
                if mn2:
                    temps.append(mn2)
                for h in fd.get("hourly", []):
                    w2 = _f(h.get("windspeedKmph"))
                    c2 = _f(h.get("cloudcover"))
                    p2 = _f(h.get("precipMM"))
                    if w2:
                        winds.append(w2)
                    if c2:
                        clouds.append(c2)
                    if p2:
                        rains.append(p2)
            return {"temp": avg(temps), "rain": rsum(rains), "wind": rmax(winds),
                    "humidity": None, "cloud": avg(clouds), "aqi": None}

        val = {
            "now": {**cur_wx, "aqi": aqi_val},
            "d1":  om_day(1),
            "d3":  om_day(3),
            "d7":  om_day(7),
        }
        WEATHER_CACHE[f"wx_{zid}"] = (time.time(), val)
        return zid, val

    # Limit fresh fetches to avoid Render's 30s timeout; remaining get nearest-zone fallback
    MAX_FETCH = 15
    fetch_now = to_fetch[:MAX_FETCH]

    if fetch_now:
        with ThreadPoolExecutor(max_workers=5) as ex:
            for zid, val in ex.map(fetch_one, fetch_now):
                if val:
                    results[zid] = val

    # Build coordinate index for nearest-zone interpolation
    zone_coords = {str(z.get("id", "")): (z.get("lat", 0), z.get("lon", 0)) for z in zones}
    loaded_ids = list(results.keys())
    interpolated = []

    if loaded_ids:
        for z in zones:
            zid = str(z.get("id", "")).strip()
            if not zid or zid in results:
                continue
            lat0, lon0 = zone_coords.get(zid, (0, 0))
            nearest_id = min(
                loaded_ids,
                key=lambda lid: math.sqrt(
                    (zone_coords.get(lid, (0, 0))[0] - lat0) ** 2 +
                    (zone_coords.get(lid, (0, 0))[1] - lon0) ** 2
                )
            )
            results[zid] = results[nearest_id]
            interpolated.append(zid)

    cache_hits = len(zones) - len(to_fetch)
    print(f"[Weather] zones={len(zones)} cache={cache_hits} fetched={len(fetch_now)} "
          f"loaded={len(loaded_ids)} interpolated={len(interpolated)} returned={len(results)}")

    return jsonify({
        "ok": True,
        "data": results,
        "stats": {
            "requested": len(zones),
            "returned": len(results),
            "cached": cache_hits,
            "fetched": len(fetch_now),
            "loaded": len(loaded_ids),
            "interpolated": len(interpolated),
        }
    })


# =========================
# WEATHER DEBUG
# =========================

@app.route("/api/weather-debug")
@login_required
def weather_debug():
    """One-zone test against wttr.in (current weather provider)."""
    try:
        r = requests.get("https://wttr.in/41.69,44.83?format=j1",
                         timeout=15, headers={"User-Agent": "WFS-Dashboard/1.0"})
        cache_sample = {}
        for k, (ts, v) in list(WEATHER_CACHE.items())[:3]:
            cache_sample[k] = {
                "age_min": round((time.time() - ts) / 60, 1),
                "now": v.get("now"),
            }
        return jsonify({
            "wttr_http_status": r.status_code,
            "wttr_response_keys": list(r.json().keys()) if r.ok else r.text[:300],
            "current_condition": r.json().get("current_condition", [{}])[0] if r.ok else None,
            "cache_zones_count": len(WEATHER_CACHE),
            "cache_sample": cache_sample,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# =========================
# USER INFO API
# =========================

@app.route("/api/user_info")
@login_required
def user_info():
    return jsonify(
        {
            "username": current_user.username,
            "display_name": USERS.get(current_user.username, {}).get(
                "name",
                current_user.username,
            ),
        }
    )


# =========================
# START
# =========================

init_db()

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
