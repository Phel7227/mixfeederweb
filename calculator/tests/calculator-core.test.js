// Run: node --test calculator/tests/calculator-core.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../../assets/js/calculator-core.js");

// Test-only values. Not the owner's confirmed factors, body shape amounts or ingredient ranges.
const CONFIRMED = {
  factors: { confirmed: true, table: { adult: 1.6 } },
  activity: {
    options: {
      low: { label: "Low", factor: 0.6 },
      normal: { label: "Normal", factor: 1.0 },
      high: { label: "High", factor: 1.25 }
    }
  },
  bodyShape: {
    confirmed: true,
    options: {
      underweight: { label: "Skinny (underweight)", factor: 1.1 },
      ideal: { label: "Ideal", factor: 1.0 },
      overweight: { label: "Fat (overweight)", factor: 0.9 }
    }
  },
  ingredients: {
    muscle: { label: "Muscle meat", kcalPer100g: { low: 140, high: 160 } },
    bone: { label: "Edible bone", kcalPer100g: { low: 90, high: 110 } },
    liver: { label: "Liver", kcalPer100g: { low: 120, high: 140 } },
    organs: { label: "Other secreting organs", kcalPer100g: { low: 110, high: 130 } },
    veg: { label: "Vegetables and fruit", kcalPer100g: { low: 20, high: 40 } }
  },
  styles: {
    barf: { label: "BARF", split: { muscle: 0.70, bone: 0.10, liver: 0.05, organs: 0.05, veg: 0.10 } },
    "80-10-10": { label: "80/10/10", split: { muscle: 0.80, bone: 0.10, liver: 0.05, organs: 0.05, veg: 0 } }
  }
};
const PRODUCT = { brand: "Test", name: "Kibble", kcal_per_100g: 400 };

function input(overrides) {
  return Object.assign({ weightKg: 10, rawPct: 50, style: "barf", factorKey: "adult", bodyShape: "ideal" }, overrides);
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

test("resting energy is 70 x weight^0.75", () => {
  assert.ok(Math.abs(core.resting(10) - 70 * Math.pow(10, 0.75)) < 1e-9);
});

test("roundTo rounds to the nearest step", () => {
  assert.equal(core.roundTo(1, 5), 0);
  assert.equal(core.roundTo(3, 5), 5);
  assert.equal(core.roundTo(12, 1), 12);
});

test("calorie target is held back while factors are unconfirmed", () => {
  const c = clone(CONFIRMED);
  c.factors.confirmed = false;
  assert.deepEqual(core.calculate(input(), c, PRODUCT), { status: "pending", missing: "factors" });
});

test("calorie target is held back when the chosen factor is not in the table", () => {
  assert.deepEqual(core.calculate(input({ factorKey: "senior" }), CONFIRMED, PRODUCT),
    { status: "pending", missing: "factors" });
});

test("calorie target is held back while body shape amounts are unconfirmed", () => {
  const c = clone(CONFIRMED);
  c.bodyShape.confirmed = false;
  assert.deepEqual(core.calculate(input(), c, PRODUCT), { status: "pending", missing: "bodyShape" });
});

test("calorie target is held back while the chosen body shape has no amount", () => {
  const c = clone(CONFIRMED);
  c.bodyShape.options.overweight.factor = null;
  assert.deepEqual(core.calculate(input({ bodyShape: "overweight" }), c, PRODUCT),
    { status: "pending", missing: "bodyShape" });
});

test("fat reduces the daily target and skinny increases it", () => {
  const ideal = core.calculate(input({ bodyShape: "ideal", rawPct: 0 }), CONFIRMED, PRODUCT);
  const fat = core.calculate(input({ bodyShape: "overweight", rawPct: 0 }), CONFIRMED, PRODUCT);
  const thin = core.calculate(input({ bodyShape: "underweight", rawPct: 0 }), CONFIRMED, PRODUCT);
  assert.ok(fat.derKcal < ideal.derKcal, "fat should be lower than ideal");
  assert.ok(thin.derKcal > ideal.derKcal, "skinny should be higher than ideal");
  assert.equal(fat.derKcal, core.roundTo(core.resting(10) * 1.6 * 0.9, 5));
  assert.equal(thin.bodyShapeLabel, "Skinny (underweight)");
});

test("raw calories are held back while an ingredient range is missing", () => {
  const c = clone(CONFIRMED);
  c.ingredients.liver.kcalPer100g = { low: null, high: null };
  assert.deepEqual(core.calculate(input(), c, PRODUCT), { status: "pending", missing: "ingredients" });
});

test("a style with no vegetables does not need a vegetable range", () => {
  const c = clone(CONFIRMED);
  c.ingredients.veg.kcalPer100g = { low: null, high: null };
  const r = core.calculate(input({ style: "80-10-10", rawPct: 100 }), c, null);
  assert.equal(r.status, "ok");
});

test("average is the midpoint of the blended low and high calorie values", () => {
  const blend = core.blendedKcalPer100g(CONFIRMED.styles.barf, CONFIRMED);
  assert.ok(Math.abs(blend.average - (blend.low + blend.high) / 2) < 1e-9);
  assert.ok(blend.low < blend.average && blend.average < blend.high);
});

test("treats come out of the daily target, and food plus treats equals the target", () => {
  const r = core.calculate(input({ rawPct: 30, treatPct: 10 }), CONFIRMED, PRODUCT);
  assert.equal(r.status, "ok");
  assert.equal(r.treatKcal, core.roundTo(r.derKcal * 0.1, 5));
  assert.equal(r.foodKcal, r.derKcal - r.treatKcal);
  assert.equal(r.kibbleKcal + r.rawKcal + r.treatKcal, r.derKcal);
});

test("with no treats the food is the whole target", () => {
  const r = core.calculate(input({ rawPct: 30, treatPct: 0 }), CONFIRMED, PRODUCT);
  assert.equal(r.treatKcal, 0);
  assert.equal(r.foodKcal, r.derKcal);
});

test("activity level multiplies the target: low lowers it, normal leaves it, high raises it", () => {
  const normal = core.calculate(input({ rawPct: 0, activity: "normal" }), CONFIRMED, PRODUCT);
  const low = core.calculate(input({ rawPct: 0, activity: "low" }), CONFIRMED, PRODUCT);
  const high = core.calculate(input({ rawPct: 0, activity: "high" }), CONFIRMED, PRODUCT);
  assert.ok(low.derKcal < normal.derKcal);
  assert.ok(high.derKcal > normal.derKcal);
  assert.equal(core.calculate(input({ rawPct: 0 }), CONFIRMED, PRODUCT).derKcal, normal.derKcal);
});

test("grams mode: kibble calories come from the weight and the product, and raw takes the rest", () => {
  const r = core.calculate(input({ mode: "grams", kibbleGrams: 100, rawPct: undefined, treatPct: 10 }), CONFIRMED, PRODUCT);
  assert.equal(r.status, "ok");
  assert.equal(r.kibbleKcal, core.roundTo(100 * 400 / 100, 5));
  assert.equal(r.kibbleGrams, 100);
  assert.equal(r.kibbleKcal + r.rawKcal + r.treatKcal, r.derKcal);
  assert.equal(r.kibblePct + r.rawPct, 100);
});

test("grams mode: too much kibble returns over, with the largest weight that fits", () => {
  const r = core.calculate(input({ mode: "grams", kibbleGrams: 1000, treatPct: 0 }), CONFIRMED, PRODUCT);
  assert.equal(r.status, "over");
  assert.ok(r.excessKcal > 0);
  assert.equal(r.maxKibbleGrams, Math.floor(r.foodKcal * 100 / 400));
  assert.ok(r.maxKibbleGrams * 400 / 100 <= r.foodKcal);
});

test("grams mode needs a kibble product", () => {
  assert.equal(core.calculate(input({ mode: "grams", kibbleGrams: 100 }), CONFIRMED, null).status, "needs_product");
});

test("kibble and raw kcal add up to the daily target", () => {
  const r = core.calculate(input({ rawPct: 30 }), CONFIRMED, PRODUCT);
  assert.equal(r.status, "ok");
  assert.equal(r.kibblePct, 70);
  assert.equal(r.kibbleKcal + r.rawKcal, r.derKcal);
});

test("kibble grams come from kcal per 100g of the chosen product", () => {
  const r = core.calculate(input({ rawPct: 0 }), CONFIRMED, PRODUCT);
  assert.equal(r.kibbleKcal, r.derKcal);
  assert.equal(r.kibbleGrams, Math.round(r.derKcal / 400 * 100));
  assert.equal(r.rawKcal, 0);
  assert.equal(r.rawGrams, null);
  assert.deepEqual(r.recipe, []);
});

test("default basis is average, and raw grams use the average calorie value", () => {
  const r = core.calculate(input({ rawPct: 100 }), CONFIRMED, null);
  assert.equal(r.basis, "average");
  const blend = core.blendedKcalPer100g(CONFIRMED.styles.barf, CONFIRMED);
  assert.ok(Math.abs(r.rawKcalPer100g - blend.average) < 1e-9);
  assert.equal(r.rawGrams, Math.round(r.rawKcal / blend.average * 100));
});

test("the user's basis choice changes the raw grams, and the range covers all three", () => {
  const low = core.calculate(input({ rawPct: 100, basis: "low" }), CONFIRMED, null);
  const high = core.calculate(input({ rawPct: 100, basis: "high" }), CONFIRMED, null);
  // Lower calorie food needs more grams to reach the same kcal.
  assert.ok(low.rawGrams > high.rawGrams);
  assert.equal(low.rawGrams, low.rawGramsRange.max);
  assert.equal(high.rawGrams, high.rawGramsRange.min);
  const avg = core.calculate(input({ rawPct: 100, basis: "average" }), CONFIRMED, null);
  assert.ok(avg.rawGrams >= avg.rawGramsRange.min && avg.rawGrams <= avg.rawGramsRange.max);
});

test("an unknown basis falls back to average", () => {
  const r = core.calculate(input({ rawPct: 100, basis: "medium" }), CONFIRMED, null);
  assert.equal(r.basis, "average");
});

test("recipe grams follow the style split and skip zero shares", () => {
  const r = core.calculate(input({ style: "80-10-10", rawPct: 100 }), CONFIRMED, null);
  assert.deepEqual(r.recipe.map((i) => i.label),
    ["Muscle meat", "Edible bone", "Liver", "Other secreting organs"]);
  const total = r.recipe.reduce((sum, i) => sum + i.grams, 0);
  assert.ok(Math.abs(total - r.rawGrams) <= 2);
});

test("a kibble share with no product asks for a product", () => {
  assert.equal(core.calculate(input({ rawPct: 50 }), CONFIRMED, null).status, "needs_product");
});

test("feeding rate band: lower bound inclusive, upper bound exclusive, none outside the table", () => {
  const cfg = { feedingRates: [{ min: 5, max: 10, low: 50, high: 110 }, { min: 10, max: 20, low: 100, high: 150 }] };
  assert.equal(core.feedingRateFor(4.9, cfg), null);
  assert.equal(core.feedingRateFor(5, cfg).low, 50);
  assert.equal(core.feedingRateFor(9.9, cfg).low, 50);
  assert.equal(core.feedingRateFor(10, cfg).low, 100);
  assert.equal(core.feedingRateFor(20, cfg), null);
});

test("every style split totals 100%", () => {
  Object.values(CONFIRMED.styles).forEach((style) => {
    const total = Object.values(style.split).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(total - 1) < 1e-9, style.label);
  });
});
