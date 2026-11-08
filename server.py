"""Flask account service and same-origin host for AI4SFiguresByasim."""

import hashlib
import os
import re
import secrets
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash


ROOT = Path(__file__).resolve().parent
FRONTEND = ROOT / "dist" if (ROOT / "dist" / "index.html").is_file() else ROOT
COOKIE = "ai4s_session"
SESSION_AGE = 7 * 24 * 60 * 60
PASSWORD_METHOD = "scrypt:32768:8:3"
USERNAME = re.compile(r"[a-zA-Z0-9_]{3,32}")
SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_attempts (
    scope TEXT NOT NULL,
    address TEXT NOT NULL,
    bucket INTEGER NOT NULL,
    count INTEGER NOT NULL,
    PRIMARY KEY(scope, address, bucket)
);
"""


def create_app(database=None, secure_cookies=None):
    app = Flask(__name__, static_folder=None)
    app.config.update(
        MAX_CONTENT_LENGTH=4096,
        SECURE_COOKIES=(os.environ.get("AI4S_SECURE_COOKIES", "1") == "1"
                        if secure_cookies is None else secure_cookies),
    )
    database = Path(database or os.environ.get("AI4S_DATABASE", ROOT / "private" / "accounts.sqlite3"))
    database.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    dummy_hash = generate_password_hash(secrets.token_hex(24), method=PASSWORD_METHOD)

    @contextmanager
    def connection():
        db = sqlite3.connect(database, timeout=5)
        try:
            db.execute("PRAGMA foreign_keys = ON")
            with db:
                yield db
        finally:
            db.close()

    with connection() as db:
        db.executescript(SCHEMA)

    @app.after_request
    def headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        if request.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    def error(message, status):
        return jsonify(error=message), status

    def token_hash(token):
        return hashlib.sha256(token.encode()).hexdigest()

    def establish_session(username):
        token = secrets.token_urlsafe(32)
        old = request.cookies.get(COOKIE)
        with connection() as db:
            db.execute("DELETE FROM sessions WHERE expires <= ?", (int(time.time()),))
            if old:
                db.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash(old),))
            db.execute("INSERT INTO sessions VALUES (?, ?, ?)",
                       (token_hash(token), username, int(time.time()) + SESSION_AGE))
        response = jsonify(user=username)
        response.set_cookie(COOKIE, token, max_age=SESSION_AGE, httponly=True,
                            secure=app.config["SECURE_COOKIES"], samesite="Strict")
        return response

    def allow_attempt(scope):
        bucket = int(time.time()) // 600
        address = request.remote_addr or "unknown"
        with connection() as db:
            db.execute("DELETE FROM auth_attempts WHERE bucket < ?", (bucket,))
            count, = db.execute(
                """INSERT INTO auth_attempts VALUES (?, ?, ?, 1)
                   ON CONFLICT(scope, address, bucket) DO UPDATE SET count = count + 1
                   RETURNING count""", (scope, address, bucket)
            ).fetchone()
        return count <= 10

    @app.before_request
    def check_account_post():
        if request.method != "POST" or not request.path.startswith("/api/account/"):
            return None
        if not request.is_json:
            return error("Send the account request as JSON.", 415)
        origin = request.headers.get("Origin")
        configured = os.environ.get("AI4S_ORIGIN")
        allowed = configured.rstrip("/") if configured else request.host_url.rstrip("/")
        if origin and origin != allowed:
            return error("This account request must come from the same website.", 403)
        return None

    def credentials():
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return None
        username = data.get("username")
        password = data.get("password")
        if not isinstance(username, str) or not USERNAME.fullmatch(username):
            return None
        if not isinstance(password, str) or not 12 <= len(password) <= 128:
            return None
        return username.lower(), password

    @app.get("/api/account")
    def current_account():
        token = request.cookies.get(COOKIE)
        account = None
        if token:
            with connection() as db:
                account = db.execute(
                    "SELECT username FROM sessions WHERE token_hash = ? AND expires > ?",
                    (token_hash(token), int(time.time())),
                ).fetchone()
        return jsonify(user=account[0] if account else None)

    @app.post("/api/account/signup")
    def signup():
        if not allow_attempt("signup"):
            return error("Too many attempts. Try again in a few minutes.", 429)
        values = credentials()
        if not values:
            return error("Use 3–32 letters, numbers, or underscores for the username and a 12–128 character password.", 400)
        username, password = values
        password_hash = generate_password_hash(password, method=PASSWORD_METHOD)
        try:
            with connection() as db:
                db.execute("INSERT INTO users VALUES (?, ?)", (username, password_hash))
        except sqlite3.IntegrityError:
            return error("That username is already taken. Try another or log in.", 409)
        return establish_session(username)

    @app.post("/api/account/login")
    def login():
        if not allow_attempt("login"):
            return error("Too many attempts. Try again in a few minutes.", 429)
        values = credentials()
        if not values:
            return error("The username or password is incorrect.", 401)
        username, password = values
        with connection() as db:
            row = db.execute("SELECT password_hash FROM users WHERE username = ?", (username,)).fetchone()
        if not check_password_hash(row[0] if row else dummy_hash, password) or not row:
            return error("The username or password is incorrect.", 401)
        return establish_session(username)

    @app.post("/api/account/logout")
    def logout():
        token = request.cookies.get(COOKIE)
        if token:
            with connection() as db:
                db.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash(token),))
        response = jsonify(user=None)
        response.delete_cookie(COOKIE, httponly=True,
                               secure=app.config["SECURE_COOKIES"], samesite="Strict")
        return response

    @app.get("/")
    def home():
        return send_from_directory(FRONTEND, "index.html")

    @app.get("/<path:asset>")
    def static_asset(asset):
        allowed = {"styles.css", "app.js", "accounts.js", "figures.js",
                   "workspace.js", "ai-worker.js", "ai4science-logo.png"}
        if asset not in allowed:
            return error("Page not found.", 404)
        return send_from_directory(FRONTEND, asset)

    return app


if __name__ == "__main__":
    from waitress import serve

    serve(create_app(secure_cookies=False), host="127.0.0.1", port=8080)
