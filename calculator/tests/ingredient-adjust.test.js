// Run: node --test calculator/tests/ingredient-adjust.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const adjust = require("../../assets/js/ingredient-adjust.js");

// Copy of the groups and styles from feeding-config.js, so the test does not need a browser.
const CONFIG = {
  groups: {
    meat: { parts: ["muscle"] },
    organ: { parts: ["liver", "organs"] },
    bone: { parts: ["bone"] },
    veg: { parts: ["veg"] }
  },
  styles: {
    barf: { split: { muscle: 0.70, bone: 0.10, liver: 0.05, organs: 0.05, veg: 0.10 } },
    prey: { split: { muscle: 0.80, bone: 0.10, liver: 0.05, organs: 0.05, veg: 0 } }
  }
};

test("group share adds up its parts", () => {
  assert.equal(adjust.groupShare(CONFIG.styles.barf.split, CONFIG.groups.organ), 0.10);
  assert.equal(adjust.groupShare(CONFIG.styles.barf.split, CONFIG.groups.meat), 0.70);
});

test("entering meat grams scales the other ingredients by the style split", () => {
  // BARF: meat is 70% of the raw portion, so 140 g of meat means 200 g raw in total.
  const r = adjust.adjustRecipe(CONFIG, "barf", "meat", 140);
  assert.equal(r.rawTotal, 200);
  assert.deepEqual(r.perIngredient, { muscle: 140, bone: 20, liver: 10, organs: 10, veg: 20 });
});

test("entering organ grams uses liver and organs together", () => {
  // BARF: organ is 10%, so 30 g of organ means 300 g raw in total.
  const r = adjust.adjustRecipe(CONFIG, "barf", "organ", 30);
  assert.equal(r.rawTotal, 300);
  assert.equal(r.perIngredient.muscle, 210);
  assert.equal(r.perIngredient.liver + r.perIngredient.organs, 30);
});

test("a style with no vegetables gives zero veg grams", () => {
  const r = adjust.adjustRecipe(CONFIG, "prey", "bone", 20);
  assert.equal(r.rawTotal, 200);
  assert.equal(r.perIngredient.veg, 0);
  assert.equal(r.perIngredient.muscle, 160);
});

test("ingredient grams always add back to the raw total", () => {
  const r = adjust.adjustRecipe(CONFIG, "barf", "veg", 33);
  const sum = Object.values(r.perIngredient).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - r.rawTotal) <= 3, `sum ${sum} vs ${r.rawTotal}`);
});

test("zero, negative or missing amounts give no result", () => {
  assert.equal(adjust.adjustRecipe(CONFIG, "barf", "meat", 0), null);
  assert.equal(adjust.adjustRecipe(CONFIG, "barf", "meat", -5), null);
  assert.equal(adjust.adjustRecipe(CONFIG, "barf", "meat", NaN), null);
});

test("a group with no share in the style gives no result", () => {
  // PMR has no veg, so entering veg grams cannot set the raw total.
  assert.equal(adjust.adjustRecipe(CONFIG, "prey", "veg", 50), null);
});

test("unknown style or group gives no result", () => {
  assert.equal(adjust.adjustRecipe(CONFIG, "80-10-10", "meat", 100), null);
  assert.equal(adjust.adjustRecipe(CONFIG, "barf", "fish", 100), null);
});

// The meat breakdown shown in the page must add up to the meat share of each style in feeding-config.js.
test("meat breakdown matches the meat share of each style", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const vm = require("node:vm");
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../../assets/js/feeding-config.js"), "utf8"), sandbox);
  const cfg = sandbox.window.FEEDING_CONFIG;
  assert.equal(cfg.meatMix.confirmed, true);
  Object.keys(cfg.meatMix.styles).forEach((styleKey) => {
    const mix = cfg.meatMix.styles[styleKey];
    const total = Object.values(mix).reduce((a, b) => a + b, 0);
    const meatShare = adjust.groupShare(cfg.styles[styleKey].split, cfg.groups.meat);
    assert.equal(total, Math.round(meatShare * 100), styleKey);
  });
});
