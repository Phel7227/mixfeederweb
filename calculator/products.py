"""Kibble product store for the MixFeeder Calculator. Stdlib only.

Reads are public. Writes are called by server.py only after it has checked for an admin session,
so the admin rule is enforced on the server, not just in the page.
Products are stored in store/kibble-products.json (not served as a static file).
"""
import json
import os
import pathlib
import threading
import uuid
from urllib.parse import urlparse

STORE_FILE = pathlib.Path(__file__).resolve().parent.parent / "store" / "kibble-products.json"
MAX_KCAL = 1000
MAX_TEXT = 120
SEARCH_LIMIT = 20


class ValidationError(ValueError):
    pass


class DuplicateError(ValueError):
    pass


class NotFoundError(LookupError):
    pass


def _key(brand, name):
    return (" ".join(brand.split()).lower(), " ".join(name.split()).lower())


def clean_product(data):
    """Return the stored fields for a product, or raise ValidationError."""
    if not isinstance(data, dict):
        raise ValidationError("Send the product as JSON.")
    brand = " ".join(str(data.get("brand", "")).split())
    name = " ".join(str(data.get("name", "")).split())
    if not brand or not name:
        raise ValidationError("Brand and product name are required.")
    if len(brand) > MAX_TEXT or len(name) > MAX_TEXT:
        raise ValidationError(f"Brand and product name must be {MAX_TEXT} characters or fewer.")
    kcal = data.get("kcal_per_100g")
    if isinstance(kcal, bool) or not isinstance(kcal, (int, float)):
        raise ValidationError("kcal per 100g must be a number.")
    if not 0 <= kcal <= MAX_KCAL:
        raise ValidationError(f"kcal per 100g must be from 0 to {MAX_KCAL}.")
    source = str(data.get("source", "")).strip()
    if not source:
        raise ValidationError("Source is required: enter 'label' or the shop URL.")
    if source.lower() != "label":
        parsed = urlparse(source)
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            raise ValidationError("Source must be 'label' or a shop URL starting with http:// or https://.")
    return {"brand": brand, "name": name, "kcal_per_100g": float(kcal), "source": source}


class ProductStore:
    def __init__(self, path=STORE_FILE):
        self.path = pathlib.Path(path)
        self._lock = threading.Lock()

    def _load(self):
        if not self.path.exists():
            return []
        return json.loads(self.path.read_text(encoding="utf-8")).get("products", [])

    def _save(self, products):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps({"products": products}, indent=2), encoding="utf-8")
        os.replace(tmp, self.path)

    def search(self, query=""):
        """Products whose brand or name contains every word of the query (case-insensitive)."""
        words = query.lower().split()
        with self._lock:
            products = self._load()
        matches = [
            p for p in products
            if all(w in f"{p['brand']} {p['name']}".lower() for w in words)
        ]
        matches.sort(key=lambda p: (p["brand"].lower(), p["name"].lower()))
        return matches[:SEARCH_LIMIT]

    def _check_duplicate(self, products, fields, skip_id=None):
        key = _key(fields["brand"], fields["name"])
        for p in products:
            if p["id"] != skip_id and _key(p["brand"], p["name"]) == key:
                raise DuplicateError("A product with this brand and name already exists.")

    def create(self, data):
        fields = clean_product(data)
        with self._lock:
            products = self._load()
            self._check_duplicate(products, fields)
            product = {"id": uuid.uuid4().hex, **fields}
            products.append(product)
            self._save(products)
        return product

    def update(self, product_id, data):
        fields = clean_product(data)
        with self._lock:
            products = self._load()
            for i, p in enumerate(products):
                if p["id"] == product_id:
                    self._check_duplicate(products, fields, skip_id=product_id)
                    products[i] = {"id": product_id, **fields}
                    self._save(products)
                    return products[i]
        raise NotFoundError("Product not found.")

    def delete(self, product_id):
        with self._lock:
            products = self._load()
            remaining = [p for p in products if p["id"] != product_id]
            if len(remaining) == len(products):
                raise NotFoundError("Product not found.")
            self._save(remaining)
