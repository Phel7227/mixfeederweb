# MixFeeder Calculator

A free, simple website for dog owners. Enter your dog's details and feeding plan, and get a daily calorie target, the kibble and raw split in calories, and a raw recipe in grams. No login for users. No personal data is stored.

## Run locally
    python3 server.py create-admin --user EMAIL   # prompts for a passphrase (12+ characters)
    python3 server.py serve --port 8080           # then open http://127.0.0.1:8080/

## Layout
- `index.html`: the calculator page, with the accept gate, form, kibble lookup and admin product editor.
- `assets/js/calculator-core.js`: calculation rules (no DOM, testable in node).
- `assets/js/feeding-config.js`: styles, breeds, life-stage factors, body shape amounts, ingredient kcal ranges.
- `assets/js/calculator.js`: page script.
- `calculator/products.py`: kibble product store. Writes are checked on the server; the admin rule is enforced there.
- `store/kibble-products.json`: runtime product data, git-ignored.

## Calculation
- Resting energy: 70 × weight(kg)^0.75
- Daily target: resting energy × life-stage factor × body shape factor (fat lowers, skinny raises)
- Kibble kcal = target × kibble %; raw kcal = target − kibble kcal
- Raw grams use the blended kcal per 100g of the chosen style's split. Ingredient kcal is a low-high range, average is the midpoint, and the user picks the basis.
- Factors, body shape amounts and ingredient kcal ranges are owner-confirmed (MERO-22). Source notes are in `feeding-config.js`.

## Tests
    node --test calculator/tests/calculator-core.test.js
    cd calculator && python3 -I -m unittest discover -s tests -v

## Status
Preview only. Not published. Publishing needs owner approval.
