"""Tests for the kibble product store. Run: cd calculator && python3 -I -m unittest discover -s tests -v"""
import json
import pathlib
import sys
import tempfile
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
import products as p  # noqa: E402

GOOD = {"brand": "Acme", "name": "Adult Chicken", "kcal_per_100g": 380, "source": "label"}


class ValidationTests(unittest.TestCase):
    def test_accepts_a_valid_product(self):
        self.assertEqual(p.clean_product(GOOD)["kcal_per_100g"], 380.0)

    def test_brand_and_name_are_required(self):
        for field in ("brand", "name"):
            data = dict(GOOD, **{field: "   "})
            with self.assertRaises(p.ValidationError):
                p.clean_product(data)

    def test_kcal_must_be_a_number_from_0_to_1000(self):
        for bad in ("380", True, None, float("nan"), -1, 1000.5):
            with self.subTest(value=bad), self.assertRaises(p.ValidationError):
                p.clean_product(dict(GOOD, kcal_per_100g=bad))
        self.assertEqual(p.clean_product(dict(GOOD, kcal_per_100g=0))["kcal_per_100g"], 0.0)
        self.assertEqual(p.clean_product(dict(GOOD, kcal_per_100g=1000))["kcal_per_100g"], 1000.0)

    def test_source_is_label_or_http_url(self):
        self.assertEqual(p.clean_product(dict(GOOD, source="Label"))["source"], "Label")
        self.assertEqual(p.clean_product(dict(GOOD, source="https://shop.example.com/x"))["source"],
                         "https://shop.example.com/x")
        for bad in ("", "ftp://x.example.com", "javascript:alert(1)", "shop.example.com"):
            with self.subTest(source=bad), self.assertRaises(p.ValidationError):
                p.clean_product(dict(GOOD, source=bad))

    def test_non_object_is_rejected(self):
        with self.assertRaises(p.ValidationError):
            p.clean_product(["Acme"])


class StoreTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.store = p.ProductStore(pathlib.Path(self.dir.name) / "kibble-products.json")

    def tearDown(self):
        self.dir.cleanup()

    def test_create_then_search_is_case_insensitive_and_matches_every_word(self):
        self.store.create(GOOD)
        self.store.create(dict(GOOD, brand="Zeta", name="Puppy Lamb"))
        self.assertEqual([x["name"] for x in self.store.search("acme ADULT")], ["Adult Chicken"])
        self.assertEqual([x["brand"] for x in self.store.search("")], ["Acme", "Zeta"])
        self.assertEqual(self.store.search("nothing here"), [])

    def test_duplicate_brand_and_name_is_rejected_ignoring_case_and_spacing(self):
        self.store.create(GOOD)
        with self.assertRaises(p.DuplicateError):
            self.store.create(dict(GOOD, brand="  ACME ", name="adult   chicken"))

    def test_update_can_keep_its_own_name_but_not_take_another_products(self):
        first = self.store.create(GOOD)
        second = self.store.create(dict(GOOD, name="Senior"))
        self.assertEqual(self.store.update(first["id"], dict(GOOD, kcal_per_100g=390))["kcal_per_100g"], 390.0)
        with self.assertRaises(p.DuplicateError):
            self.store.update(second["id"], GOOD)

    def test_update_and_delete_unknown_id_raise_not_found(self):
        with self.assertRaises(p.NotFoundError):
            self.store.update("missing", GOOD)
        with self.assertRaises(p.NotFoundError):
            self.store.delete("missing")

    def test_delete_removes_the_product(self):
        product = self.store.create(GOOD)
        self.store.delete(product["id"])
        self.assertEqual(self.store.search(""), [])

    def test_saved_file_is_plain_json_with_no_other_fields(self):
        self.store.create(GOOD)
        saved = json.loads(self.store.path.read_text(encoding="utf-8"))
        self.assertEqual(set(saved), {"products"})
        self.assertEqual(set(saved["products"][0]), {"id", "brand", "name", "kcal_per_100g", "source"})


if __name__ == "__main__":
    unittest.main()
