// MixFeeder Calculator: pure calculation rules. No DOM access, so it can be tested in node.
//
// calculate(input, config, product) returns one of:
//   { status: "pending", missing: "factors" | "bodyShape" | "ingredients" }
//                                    calorie target or raw values not released yet
//   { status: "needs_product" }      kibble share set but no kibble product chosen
//   { status: "ok", ... }            results (see fields below)
//
// input.basis picks the ingredient calorie basis for the raw grams: "low", "average" or "high".
// The average is the midpoint of each ingredient's range. Grams for the full range are also returned.
(function (root) {
  var RER_FACTOR = 70;
  var RER_EXPONENT = 0.75;
  var BASES = ["low", "average", "high"];

  function roundTo(value, step) {
    return Math.round(value / step) * step;
  }

  function resting(weightKg) {
    return RER_FACTOR * Math.pow(weightKg, RER_EXPONENT);
  }

  // Blended kcal per 100g of the raw portion for the low, average and high ends of each
  // ingredient's range. Returns null if any ingredient the style uses has no range yet.
  function blendedKcalPer100g(style, config) {
    var blend = { low: 0, high: 0 };
    var keys = Object.keys(style.split);
    for (var i = 0; i < keys.length; i++) {
      var share = style.split[keys[i]];
      if (share === 0) continue;
      var range = config.ingredients[keys[i]].kcalPer100g;
      if (!range || range.low === null || range.high === null ||
          range.low === undefined || range.high === undefined) {
        return null;
      }
      blend.low += share * range.low;
      blend.high += share * range.high;
    }
    blend.average = (blend.low + blend.high) / 2;
    return blend;
  }

  function calculate(input, config, product) {
    var weight = Number(input.weightKg);
    var rawPct = Number(input.rawPct);
    var basis = BASES.indexOf(input.basis) === -1 ? "average" : input.basis;
    var style = config.styles[input.style];
    if (!style) return { status: "error", error: "Choose a feeding style." };

    if (!config.factors.confirmed || !config.factors.table[input.factorKey]) {
      return { status: "pending", missing: "factors" };
    }
    var shape = config.bodyShape.options[input.bodyShape];
    if (!config.bodyShape.confirmed || !shape || shape.factor === null || shape.factor === undefined) {
      return { status: "pending", missing: "bodyShape" };
    }
    var factor = config.factors.table[input.factorKey] * shape.factor;

    var der = roundTo(resting(weight) * factor, 5);
    var kibblePct = 100 - rawPct;
    var kibbleKcal = roundTo(der * kibblePct / 100, 5);
    var rawKcal = der - kibbleKcal;

    var result = {
      status: "ok",
      restingKcal: roundTo(resting(weight), 5),
      derKcal: der,
      bodyShapeLabel: shape.label,
      basis: basis,
      kibblePct: kibblePct,
      rawPct: rawPct,
      kibbleKcal: kibbleKcal,
      rawKcal: rawKcal,
      kibbleGrams: null,
      rawGrams: null,
      rawGramsRange: null,
      rawKcalPer100g: null,
      rawKcalRange: null,
      recipe: [],
      styleLabel: style.label
    };

    if (rawKcal > 0) {
      var blend = blendedKcalPer100g(style, config);
      if (blend === null) return { status: "pending", missing: "ingredients" };
      var per100 = blend[basis];
      result.rawKcalPer100g = per100;
      result.rawKcalRange = { low: blend.low, high: blend.high };
      result.rawGrams = Math.round(rawKcal / per100 * 100);
      result.rawGramsRange = {
        min: Math.round(rawKcal / blend.high * 100),
        max: Math.round(rawKcal / blend.low * 100)
      };
      Object.keys(style.split).forEach(function (key) {
        var share = style.split[key];
        if (share === 0) return;
        result.recipe.push({
          key: key,
          label: config.ingredients[key].label,
          grams: Math.round(result.rawGrams * share)
        });
      });
    }

    if (kibbleKcal > 0) {
      if (!product) return { status: "needs_product", result: result };
      result.kibbleGrams = Math.round(kibbleKcal / product.kcal_per_100g * 100);
      result.kibbleProduct = product;
    }

    return result;
  }

  var api = {
    RER_FACTOR: RER_FACTOR,
    RER_EXPONENT: RER_EXPONENT,
    BASES: BASES,
    resting: resting,
    roundTo: roundTo,
    blendedKcalPer100g: blendedKcalPer100g,
    calculate: calculate
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.MixFeederCore = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
