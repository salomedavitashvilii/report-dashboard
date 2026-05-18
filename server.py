# -*- coding: utf-8 -*-
from functools import lru_cache
import time
CACHE = {}
CACHE_TTL = 300  # 5 წუთი

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
import os
import json
import urllib.parse
from datetime import timedelta
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

APP_TITLE = "REPORT Dashboard"

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

        if username in USERS and check_password_hash(
            USERS[username]["password"], password
        ):
            user = User(username)
            login_user(user, remember=remember)

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
    )


def _split_multi(val: str):
    if not val:
        return []

    raw = [x.strip() for x in val.replace(",", " ").split()]
    return list(dict.fromkeys([x for x in raw if x]))


# def normalize_date(value):
#     if not value:
#         return ""

#     value = str(value)

#     if "T" in value:
#         return value.split("T")[0]

#     if " " in value:
#         return value.split(" ")[0]

#     return value[:10]


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
            # --- თარიღი ---
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
        # print("RAW FEATURES COUNT:", len(features))

        # for ft in features[:10]:
        #     props = ft.get("properties", {}) or {}
        #     print("RAW DATE_:", props.get("DATE_"))

        # if date_from:
        #     if not date_to:
        #         date_to = date_from

        #     filtered_features = []

        #     for ft in features:
        #         props = ft.get("properties", {}) or {}
        #         row_date = normalize_date(props.get("DATE_", ""))

        #         if date_from <= row_date <= date_to:
        #             filtered_features.append(ft)

        #     features = filtered_features

        print("--- [WFS Response] ---")
        print(f"Features received after filters: {len(features)}")

        rows = []

        for ft in features:
            props = ft.get("properties", {}) or {}
            geom = ft.get("geometry")
            wkt_geom_text = json.dumps(
                geom, ensure_ascii=False
            ) if geom else ""

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

        result = {
            "ok": True,
            "count": len(rows),
            "items": rows,
            "filter": final_cql,
        }

        set_cached_data(cache_key, result)

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
            200,
        )


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


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
