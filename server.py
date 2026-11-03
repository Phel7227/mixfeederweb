"""Local server for the MixFeeder Calculator: static files, admin login, and the kibble product API
(public reads, admin-only writes).

Stdlib only. Run: python3 server.py serve [--port 8080]
Create the admin account first: python3 server.py create-admin --user EMAIL
(the passphrase is prompted for, or read from the ADMIN_PASSWORD env var; only a salted hash is stored).
"""
import argparse
import getpass
import hashlib
import hmac
import http.cookies
import http.server
import json
import os
import pathlib
import secrets
import sys
import time
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlparse

ROOT = pathlib.Path(__file__).resolve().parent
AUTH_FILE = pathlib.Path(os.environ.get("AUTH_FILE", ROOT / "auth" / "users.json"))
COOKIE = "mercury_session"
KDF_ITERATIONS = 310_000
MIN_LENGTH = 12
MAX_BODY_BYTES = 4096
# Paths that must never be served as static files: the user store, the product store, and server code.
BLOCKED_TOP_LEVEL = {"auth", "store"}
PRODUCTS_PATH = "/api/calculator/products"

sys.path.insert(0, str(ROOT / "calculator"))
import products as calc_products  # noqa: E402  (stdlib product store under calculator/)

PRODUCT_STORE = calc_products.ProductStore()

SESSIONS = {}  # session token -> admin email. In memory, so a restart signs everyone out.


def hash_secret(value, salt=None):
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", value.encode("utf-8"), salt, KDF_ITERATIONS)
    return {"salt": salt.hex(), "hash": digest.hex(), "iterations": KDF_ITERATIONS}


def check_secret(value, record):
    salt = bytes.fromhex(record["salt"])
    digest = hashlib.pbkdf2_hmac("sha256", value.encode("utf-8"), salt, record["iterations"])
    return hmac.compare_digest(digest.hex(), record["hash"])


def load_users():
    if not AUTH_FILE.exists():
        return {}
    return json.loads(AUTH_FILE.read_text(encoding="utf-8")).get("users", {})


def save_user(email, value):
    users = load_users()
    users[email] = {"role": "admin", **hash_secret(value)}
    AUTH_FILE.parent.mkdir(parents=True, exist_ok=True)
    AUTH_FILE.write_text(json.dumps({"users": users}, indent=2), encoding="utf-8")
    os.chmod(AUTH_FILE, 0o600)


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def send_json(self, status, body, extra_headers=()):
        data = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        for name, value in extra_headers:
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(data)

    def session_user(self):
        jar = http.cookies.SimpleCookie(self.headers.get("Cookie", ""))
        token = jar[COOKIE].value if COOKIE in jar else None
        email = SESSIONS.get(token)
        if email and load_users().get(email, {}).get("role") == "admin":
            return email
        return None

    def is_blocked(self, path):
        parts = [p for p in path.split("?")[0].split("/") if p]
        if not parts:
            return False
        return parts[0] in BLOCKED_TOP_LEVEL or parts[-1].endswith(".py") or any(p.startswith(".") for p in parts)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/api/session":
            return self.send_json(200, {"admin": self.session_user() is not None})
        if path == PRODUCTS_PATH:
            query = parse_qs(urlparse(self.path).query).get("q", [""])[0][: calc_products.MAX_TEXT]
            return self.send_json(200, {"products": PRODUCT_STORE.search(query)})
        if path.startswith("/api/"):
            return self.send_json(404, {"error": "Not found."})
        if self.is_blocked(path):
            return self.send_error(404)
        return super().do_GET()

    def do_HEAD(self):
        if self.is_blocked(self.path):
            return self.send_error(404)
        return super().do_HEAD()

    def read_json(self):
        if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
            return None
        length = int(self.headers.get("Content-Length", 0))
        if length > MAX_BODY_BYTES:
            return None
        try:
            return json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            return None

    def do_POST(self):
        path = self.path.split("?")[0]
        if path == "/api/login":
            return self.login()
        if path == "/api/logout":
            jar = http.cookies.SimpleCookie(self.headers.get("Cookie", ""))
            if COOKIE in jar:
                SESSIONS.pop(jar[COOKIE].value, None)
            return self.send_json(200, {"ok": True}, [("Set-Cookie", f"{COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict")])
        if path == PRODUCTS_PATH:
            return self.product_write(lambda body: PRODUCT_STORE.create(body), created=True)
        return self.send_json(404, {"error": "Not found."})

    def do_PUT(self):
        product_id = self.product_id_from_path()
        if product_id is None:
            return self.send_json(404, {"error": "Not found."})
        return self.product_write(lambda body: PRODUCT_STORE.update(product_id, body))

    def do_DELETE(self):
        product_id = self.product_id_from_path()
        if product_id is None:
            return self.send_json(404, {"error": "Not found."})
        if not self.session_user():
            return self.send_json(403, {"error": "Only the admin can change kibble products."})
        try:
            PRODUCT_STORE.delete(product_id)
        except calc_products.NotFoundError as err:
            return self.send_json(404, {"error": str(err)})
        return self.send_json(200, {"ok": True})

    def product_id_from_path(self):
        path = self.path.split("?")[0]
        prefix = PRODUCTS_PATH + "/"
        if not path.startswith(prefix) or "/" in path[len(prefix):]:
            return None
        return path[len(prefix):] or None

    def product_write(self, action, created=False):
        # Admin check comes before reading the body, so non-admins get no detail about the input rules.
        if not self.session_user():
            return self.send_json(403, {"error": "Only the admin can change kibble products."})
        body = self.read_json()
        if body is None:
            return self.send_json(400, {"error": "Send the product as JSON (max 4 KB)."})
        try:
            product = action(body)
        except calc_products.ValidationError as err:
            return self.send_json(400, {"error": str(err)})
        except calc_products.DuplicateError as err:
            return self.send_json(409, {"error": str(err)})
        except calc_products.NotFoundError as err:
            return self.send_json(404, {"error": str(err)})
        return self.send_json(201 if created else 200, {"product": product})

    def login(self):
        body = self.read_json()
        if not isinstance(body, dict):
            return self.send_json(400, {"error": "Send the email and passphrase as JSON."})
        email = str(body.get("email", "")).strip().lower()
        given = str(body.get("passphrase", ""))
        record = load_users().get(email)
        if not record or record.get("role") != "admin" or not check_secret(given, record):
            time.sleep(0.5)  # slow down guessing
            return self.send_json(401, {"error": "Email or passphrase is not correct."})
        token = secrets.token_urlsafe(32)
        SESSIONS[token] = email
        cookie = f"{COOKIE}={token}; Path=/; HttpOnly; SameSite=Strict"
        return self.send_json(200, {"ok": True}, [("Set-Cookie", cookie)])


def create_admin(email):
    email = email.strip().lower()
    given = os.environ.get("ADMIN_PASSWORD")
    if given is None:
        given = getpass.getpass("Admin passphrase: ")
        if given != getpass.getpass("Repeat passphrase: "):
            sys.exit("Passphrases do not match.")
    if len(given) < MIN_LENGTH:
        sys.exit(f"Passphrase must be at least {MIN_LENGTH} characters.")
    save_user(email, given)
    print(f"Admin account saved for {email} in {AUTH_FILE}")


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command")
    serve = sub.add_parser("serve")
    serve.add_argument("--port", type=int, default=8080)
    serve.add_argument("--bind", default="127.0.0.1")
    admin = sub.add_parser("create-admin")
    admin.add_argument("--user", required=True)
    args = parser.parse_args()

    if args.command == "create-admin":
        return create_admin(args.user)
    port = getattr(args, "port", 8080)
    bind = getattr(args, "bind", "127.0.0.1")
    server = http.server.ThreadingHTTPServer((bind, port), Handler)
    print(f"Serving on http://{bind}:{port}/")
    server.serve_forever()


if __name__ == "__main__":
    main()
