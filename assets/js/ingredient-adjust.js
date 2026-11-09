// Ingredient input: the user enters grams for one ingredient group (meat, organ, bone or veg),
// and every other ingredient is scaled to keep the chosen feeding style's split.
// Rules are in adjustRecipe (no DOM, testable in node). Settings live in feeding-config.js.
(function (root) {
  // Share of the raw portion that a group makes up, for one style (0 to 1).
  function groupShare(split, group) {
    return group.parts.reduce(function (sum, key) { return sum + (split[key] || 0); }, 0);
  }

  // grams: the amount the user entered for the group. Returns the raw total and grams per ingredient,
  // or null when the input or the style cannot give a result.
  function adjustRecipe(config, styleKey, groupKey, grams) {
    var style = config.styles[styleKey];
    var group = config.groups[groupKey];
    if (!style || !group || !(grams > 0)) return null;
    var share = groupShare(style.split, group);
    if (!(share > 0)) return null;
    var rawTotal = grams / share;
    var perIngredient = {};
    Object.keys(style.split).forEach(function (key) {
      perIngredient[key] = Math.round(rawTotal * style.split[key]);
    });
    return { rawTotal: Math.round(rawTotal), perIngredient: perIngredient };
  }

  var api = {
    groupShare: groupShare,
    adjustRecipe: adjustRecipe
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  root.IngredientAdjust = api;

  // Page wiring. Runs only on a page that has the ingredient section.
  var form = document.getElementById("ingredient-form");
  if (!form || !root.FEEDING_CONFIG) return;
  var config = root.FEEDING_CONFIG;
  var el = {
    group: document.getElementById("ingredient-group"),
    style: document.getElementById("ingredient-style"),
    grams: document.getElementById("ingredient-grams"),
    error: document.getElementById("ingredient-error"),
    results: document.getElementById("ingredient-results"),
    meatMix: document.getElementById("ingredient-meat-mix")
  };

  function fillSelect(select, options) {
    options.forEach(function (opt) {
      var o = document.createElement("option");
      o.value = opt.value;
      o.textContent = opt.label;
      select.appendChild(o);
    });
  }

  fillSelect(el.group, Object.keys(config.groups).map(function (key) {
    return { value: key, label: config.groups[key].label };
  }));
  fillSelect(el.style, Object.keys(config.styles).map(function (key) {
    return { value: key, label: config.styles[key].label };
  }));

  // The meat hint stays hidden until the owner confirms the ratio.
  if (config.meatMix && config.meatMix.confirmed) {
    el.meatMix.hidden = false;
    el.meatMix.textContent = Object.keys(config.meatMix.options).map(function (name) {
      return name + " " + config.meatMix.options[name] + "%";
    }).join(", ");
  }

  function row(label, value) {
    var li = document.createElement("li");
    li.textContent = label + ": " + value;
    return li;
  }

  function render() {
    var grams = parseFloat(el.grams.value);
    var result = adjustRecipe(config, el.style.value, el.group.value, grams);
    el.results.innerHTML = "";
    if (!el.grams.value.trim()) {
      el.error.textContent = "";
      el.results.hidden = true;
      return;
    }
    if (!result) {
      el.error.textContent = "Enter an amount greater than 0 grams.";
      el.results.hidden = true;
      return;
    }
    el.error.textContent = "";
    var list = document.createElement("ul");
    list.appendChild(row("Raw portion", result.rawTotal + " g"));
    Object.keys(config.groups).forEach(function (groupKey) {
      var group = config.groups[groupKey];
      var sum = group.parts.reduce(function (s, key) { return s + (result.perIngredient[key] || 0); }, 0);
      list.appendChild(row(group.label, sum + " g"));
    });
    el.results.appendChild(list);
    el.results.hidden = false;
  }

  el.group.addEventListener("change", render);
  el.style.addEventListener("change", render);
  el.grams.addEventListener("input", render);
  form.addEventListener("submit", function (event) { event.preventDefault(); render(); });
  render();
})(typeof window !== "undefined" ? window : globalThis);
