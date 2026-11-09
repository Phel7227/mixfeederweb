// Ingredient list: the user types grams in any one row (meat, organ, bone or veg), and the other rows
// are scaled to keep the chosen feeding style's split. Rules are in adjustRecipe (no DOM, testable in
// node). Settings live in feeding-config.js.
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

  // Page wiring. Runs only on the ingredient page.
  var list = document.getElementById("ingredient-list");
  if (!list || !root.FEEDING_CONFIG) return;
  var config = root.FEEDING_CONFIG;
  var styleSelect = document.getElementById("ingredient-style");
  var errorNode = document.getElementById("ingredient-error");
  var totalNode = document.getElementById("ingredient-total");
  var rows = {};
  var source = null; // the group the user last typed in

  Object.keys(config.styles).forEach(function (key) {
    var o = document.createElement("option");
    o.value = key;
    o.textContent = config.styles[key].label;
    styleSelect.appendChild(o);
  });

  // Build one row per group: label, optional meat breakdown, and a gram input.
  Object.keys(config.groups).forEach(function (groupKey) {
    var group = config.groups[groupKey];
    var li = document.createElement("li");
    li.className = "ingredient-row";

    var head = document.createElement("div");
    head.className = "ingredient-head";
    var label = document.createElement("label");
    label.htmlFor = "ingredient-" + groupKey;
    label.textContent = group.label;
    head.appendChild(label);

    var input = document.createElement("input");
    input.type = "text";
    input.inputMode = "decimal";
    input.autocomplete = "off";
    input.id = "ingredient-" + groupKey;
    input.className = "ingredient-input";
    input.setAttribute("aria-describedby", "ingredient-" + groupKey + "-note");
    var unit = document.createElement("span");
    unit.className = "ingredient-unit";
    unit.textContent = "g";
    var field = document.createElement("div");
    field.className = "ingredient-field";
    field.appendChild(input);
    field.appendChild(unit);
    head.appendChild(field);
    li.appendChild(head);

    var note = document.createElement("p");
    note.className = "ingredient-note";
    note.id = "ingredient-" + groupKey + "-note";
    note.hidden = true;
    li.appendChild(note);

    // Optional breakdown, closed by default. Each part is its share of this group's grams.
    var breakdown = config.breakdowns && config.breakdowns[groupKey];
    var details = null;
    var sub = null;
    if (breakdown) {
      details = document.createElement("details");
      details.className = "ingredient-sub";
      var summary = document.createElement("summary");
      summary.textContent = "Show breakdown";
      sub = document.createElement("ul");
      sub.className = "ingredient-mix";
      details.appendChild(summary);
      details.appendChild(sub);
      li.appendChild(details);
    }
    rows[groupKey] = { li: li, input: input, note: note, details: details, sub: sub, breakdown: breakdown };
    if (groupKey === "bone") rows[groupKey].mince = buildMince(li);
    input.addEventListener("input", function () {
      source = groupKey;
      update();
    });
    list.appendChild(li);
  });

  // Bone can come from mince, which has some bone in it. The user says how much bone the mince has,
  // and the page works out how much mince to buy. Default 100%, which means the grams are the mince.
  function buildMince(li) {
    var panel = document.createElement("details");
    panel.className = "ingredient-sub";
    var summary = document.createElement("summary");
    summary.textContent = "Show mince";
    var field = document.createElement("div");
    field.className = "ingredient-mince";
    var label = document.createElement("label");
    label.htmlFor = "bone-mince-pct";
    label.textContent = "Bone content in mince (%)";
    var pct = document.createElement("input");
    pct.type = "range";
    pct.min = "1";
    pct.max = "100";
    pct.step = "1";
    pct.id = "bone-mince-pct";
    pct.className = "ingredient-range";
    pct.value = "100";
    var readout = document.createElement("span");
    readout.className = "ingredient-range-value";
    readout.textContent = "100%";
    var hint = document.createElement("p");
    hint.className = "ingredient-note";
    hint.textContent = "eg bone content in chicken mince";
    field.appendChild(label);
    field.appendChild(pct);
    field.appendChild(readout);
    panel.appendChild(summary);
    panel.appendChild(field);
    panel.appendChild(hint);
    var out = document.createElement("p");
    out.className = "ingredient-note";
    panel.appendChild(out);
    var remaining = document.createElement("p");
    remaining.className = "ingredient-note";
    panel.appendChild(remaining);
    li.appendChild(panel);
    pct.addEventListener("input", function () {
      readout.textContent = pct.value + "%";
      renderMince();
    });
    return { details: panel, input: pct, out: out, remaining: remaining };
  }

  // Mince needed for the bone grams: bone grams divided by the bone share of the mince.
  // The rest of the mince (mince grams minus bone grams) is muscle meat. Remaining muscle meat is the
  // muscle meat row minus the muscle meat in that mince.
  function renderMince() {
    var mince = rows.bone.mince;
    var boneGrams = parseFloat(rows.bone.input.value);
    var hasBone = boneGrams > 0 && !rows.bone.input.disabled;
    var share = Number(mince.input.value);
    var meatGrams = parseFloat(rows.meat.input.value);
    var hasMeat = meatGrams > 0 && !rows.meat.input.disabled;
    mince.remaining.textContent = "";
    if (!hasBone) {
      mince.out.textContent = "";
    } else if (!(share > 0 && share <= 100)) {
      mince.out.textContent = "Enter a percentage from 1 to 100.";
    } else {
      var minceGrams = boneGrams * 100 / share;
      mince.out.textContent = "Mince needed: " + Math.round(minceGrams) + " g";
      if (hasMeat) {
        var meatInMince = minceGrams - boneGrams;
        var left = Math.round(meatGrams - meatInMince);
        mince.remaining.textContent = left >= 0
          ? "Remaining muscle meat: " + left + " g"
          : "The mince already has more muscle meat than the total. Lower the bone or raise the meat.";
      }
    }
  }

  // Groups that this style leaves out (share 0) are read-only, and their rows say so.
  function renderStyle(styleKey) {
    var style = config.styles[styleKey];
    Object.keys(config.groups).forEach(function (groupKey) {
      var inStyle = groupShare(style.split, config.groups[groupKey]) > 0;
      var row = rows[groupKey];
      row.input.disabled = !inStyle;
      if (!inStyle) row.input.value = "";
      row.note.hidden = inStyle;
      row.note.textContent = inStyle ? "" : "Not part of this style.";
      if (row.details) row.details.hidden = !inStyle;
    });
  }

  // Each breakdown part is its share of that group's grams, so the parts add up to the group.
  function renderBreakdowns() {
    Object.keys(rows).forEach(function (groupKey) {
      var row = rows[groupKey];
      if (!row.sub) return;
      var grams = parseFloat(row.input.value);
      var hasGrams = grams > 0 && !row.input.disabled;
      var parts = row.breakdown;
      var total = Object.keys(parts).reduce(function (sum, name) { return sum + parts[name]; }, 0);
      row.sub.innerHTML = "";
      Object.keys(parts).forEach(function (name) {
        var li = document.createElement("li");
        var amount = hasGrams ? Math.round(grams * parts[name] / total) + " g" : "-";
        li.textContent = name + " (" + parts[name] + "%): " + amount;
        row.sub.appendChild(li);
      });
    });
  }

  function clearOthers() {
    Object.keys(config.groups).forEach(function (groupKey) {
      if (groupKey !== source && !rows[groupKey].input.disabled) rows[groupKey].input.value = "";
    });
  }

  // Set every row from the source row. Rows other than the source are overwritten.
  function recalc(styleKey) {
    var style = config.styles[styleKey];
    errorNode.textContent = "";
    totalNode.textContent = "";
    if (!source) return;

    var raw = rows[source].input.value.trim();
    var grams = Number(raw);
    var result = raw === "" ? null : adjustRecipe(config, styleKey, source, grams);
    if (!result) {
      clearOthers();
      if (raw !== "") {
        errorNode.textContent = !isFinite(grams) || !(grams > 0)
          ? config.groups[source].label + ": enter an amount greater than 0 grams."
          : config.groups[source].label + " is not part of this style.";
      }
      return;
    }
    Object.keys(config.groups).forEach(function (groupKey) {
      if (groupKey === source || rows[groupKey].input.disabled) return;
      var sum = config.groups[groupKey].parts.reduce(function (s, key) {
        return s + (result.perIngredient[key] || 0);
      }, 0);
      rows[groupKey].input.value = String(sum);
    });
    totalNode.textContent = "Raw total: " + result.rawTotal + " g (" + style.label + ")";
  }

  function update() {
    var styleKey = styleSelect.value;
    renderStyle(styleKey);
    recalc(styleKey);
    renderBreakdowns();
    renderMince();
  }

  styleSelect.addEventListener("change", update);
  update();
})(typeof window !== "undefined" ? window : globalThis);
