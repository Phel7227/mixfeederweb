// MixFeeder Calculator page: form, disclaimer gate, kibble product lookup, admin product editor.
// Calculation rules live in calculator-core.js. Dog details are never sent to the server.
(function () {
  var form = document.getElementById("calc-form");
  if (!form || !window.MixFeederCore || !window.FEEDING_CONFIG) return;
  var config = window.FEEDING_CONFIG;
  var core = window.MixFeederCore;
  var API = "/api/calculator/products";

  var el = {
    accept: document.getElementById("calc-accept"),
    weight: document.getElementById("calc-weight"),
    factor: document.getElementById("calc-factor"),
    bodyShape: document.getElementById("calc-shape"),
    rawPct: document.getElementById("calc-raw"),
    percentFields: document.getElementById("calc-percent-fields"),
    gramsFields: document.getElementById("calc-grams-fields"),
    kibbleG: document.getElementById("calc-kibble-g"),
    treat: document.getElementById("calc-treat"),
    kibblePct: document.getElementById("calc-kibble-pct"),
    styleInputs: form.querySelectorAll('input[name="style"]'),
    search: document.getElementById("calc-product-search"),
    searchResults: document.getElementById("calc-product-results"),
    chosen: document.getElementById("calc-product-chosen"),
    error: document.getElementById("calc-error"),
    results: document.getElementById("calc-results"),
    placeholder: document.getElementById("calc-placeholder"),
    admin: document.getElementById("calc-admin"),
    adminForm: document.getElementById("calc-admin-form"),
    adminStatus: document.getElementById("calc-admin-status"),
    adminDelete: document.getElementById("calc-admin-delete")
  };

  var selectedProduct = null;
  var editingProduct = null;

  function setText(node, text) {
    node.textContent = text;
  }

  // Results panel: the placeholder shows until there is something to show
  function setResultsVisible(visible) {
    el.results.hidden = !visible;
    el.placeholder.hidden = visible;
  }

  function fieldError(id, message) {
    var field = document.getElementById(id);
    var errorEl = document.getElementById(id + "-err");
    if (field) field.setAttribute("aria-invalid", message ? "true" : "false");
    if (errorEl) setText(errorEl, message || "");
    return !message;
  }

  // Activity / life-stage factors. Empty until the owner confirms the table.
  var factorKeys = Object.keys(config.factors.table);
  if (config.factors.confirmed && factorKeys.length) {
    factorKeys.forEach(function (key) {
      var option = document.createElement("option");
      option.value = key;
      option.textContent = key;
      el.factor.appendChild(option);
    });
  } else {
    el.factor.disabled = true;
    var none = document.createElement("option");
    none.value = "";
    none.textContent = "Not available yet";
    el.factor.appendChild(none);
  }

  // Body shape: fat reduces the target, skinny increases it. Empty until the owner confirms the amounts.
  var shapeKeys = Object.keys(config.bodyShape.options);
  if (config.bodyShape.confirmed) {
    shapeKeys.forEach(function (key) {
      var option = document.createElement("option");
      option.value = key;
      option.textContent = config.bodyShape.options[key].label;
      el.bodyShape.appendChild(option);
    });
    el.bodyShape.value = "ideal";
  } else {
    el.bodyShape.disabled = true;
    var noShape = document.createElement("option");
    noShape.value = "";
    noShape.textContent = "Not available yet";
    el.bodyShape.appendChild(noShape);
  }

  function selectedStyle() {
    var checked = form.querySelector('input[name="style"]:checked');
    return checked ? checked.value : "";
  }

  function updateKibblePct() {
    var raw = Number(el.rawPct.value);
    setText(el.kibblePct, Number.isInteger(raw) && raw >= 0 && raw <= 100 ? String(100 - raw) : "");
  }
  el.rawPct.addEventListener("input", updateKibblePct);

  // Kibble entry mode: by percentage of food calories, or by kibble weight in grams
  function currentMode() {
    var checked = form.querySelector('input[name="mode"]:checked');
    return checked ? checked.value : "percent";
  }
  function applyMode() {
    var grams = currentMode() === "grams";
    el.percentFields.hidden = grams;
    el.gramsFields.hidden = !grams;
  }
  form.querySelectorAll('input[name="mode"]').forEach(function (radio) {
    radio.addEventListener("change", applyMode);
  });
  applyMode();
  updateKibblePct();

  // Disclaimer gate: results stay hidden until the box is ticked
  el.accept.addEventListener("change", function () {
    if (!el.accept.checked) {
      setResultsVisible(false);
      el.results.innerHTML = "";
    }
  });

  // Kibble product lookup
  var searchTimer = null;
  function runSearch() {
    var query = el.search.value.trim();
    el.searchResults.innerHTML = "";
    if (!query) return;
    fetch(API + "?q=" + encodeURIComponent(query))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var products = data.products || [];
        products.forEach(function (product) {
          var li = document.createElement("li");
          var btn = document.createElement("button");
          btn.type = "button";
          btn.className = "product-option";
          setText(btn, product.brand + " " + product.name + " (" + product.kcal_per_100g + " kcal/100g)");
          btn.addEventListener("click", function () { chooseProduct(product); });
          li.appendChild(btn);
          el.searchResults.appendChild(li);
        });
        if (!products.length) {
          var empty = document.createElement("li");
          empty.className = "field-hint";
          setText(empty, "No matching product in the database yet." +
            (adminSignedIn ? "" : " Only the admin can add new products."));
          el.searchResults.appendChild(empty);
        }
        if (adminSignedIn) prefillAdminForm(query);
      })
      .catch(function () {
        setText(el.searchResults, "Could not load products. Please try again.");
      });
  }
  el.search.addEventListener("input", function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 250);
  });

  function chooseProduct(product) {
    selectedProduct = product;
    setText(el.chosen, "Kibble: " + product.brand + " " + product.name +
      " (" + product.kcal_per_100g + " kcal/100g, source: " + product.source + ")");
    el.searchResults.innerHTML = "";
    if (adminSignedIn) loadAdminForm(product);
  }

  // Admin product editor (server enforces the same rule)
  var adminSignedIn = false;
  function prefillAdminForm(query) {
    if (editingProduct) return;
    var parts = query.split(/\s+/);
    el.adminForm.elements.brand.value = parts[0] || "";
    el.adminForm.elements.name.value = parts.slice(1).join(" ");
  }
  function loadAdminForm(product) {
    editingProduct = product;
    el.adminForm.elements.brand.value = product.brand;
    el.adminForm.elements.name.value = product.name;
    el.adminForm.elements.kcal.value = product.kcal_per_100g;
    el.adminForm.elements.source.value = product.source;
    el.adminDelete.hidden = false;
    setText(el.adminStatus, "Editing " + product.brand + " " + product.name + ".");
  }

  el.adminForm.addEventListener("submit", function (event) {
    event.preventDefault();
    var body = {
      brand: el.adminForm.elements.brand.value,
      name: el.adminForm.elements.name.value,
      kcal_per_100g: Number(el.adminForm.elements.kcal.value),
      source: el.adminForm.elements.source.value
    };
    var url = editingProduct ? API + "/" + editingProduct.id : API;
    fetch(url, {
      method: editingProduct ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    })
      .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
      .then(function (res) {
        if (!res.ok) return setText(el.adminStatus, res.data.error || "Could not save the product.");
        setText(el.adminStatus, "Saved " + res.data.product.brand + " " + res.data.product.name + ".");
        chooseProduct(res.data.product);
        editingProduct = res.data.product;
        el.adminDelete.hidden = false;
      })
      .catch(function () { setText(el.adminStatus, "Could not save the product. Please try again."); });
  });

  el.adminDelete.addEventListener("click", function () {
    if (!editingProduct || !window.confirm("Delete this product?")) return;
    fetch(API + "/" + editingProduct.id, { method: "DELETE" })
      .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
      .then(function (res) {
        if (!res.ok) return setText(el.adminStatus, res.data.error || "Could not delete the product.");
        if (selectedProduct && selectedProduct.id === editingProduct.id) {
          selectedProduct = null;
          setText(el.chosen, "");
        }
        editingProduct = null;
        el.adminForm.reset();
        el.adminDelete.hidden = true;
        setText(el.adminStatus, "Product deleted.");
      })
      .catch(function () { setText(el.adminStatus, "Could not delete the product. Please try again."); });
  });

  fetch("/api/session")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      adminSignedIn = !!data.admin;
      el.admin.hidden = !adminSignedIn;
    })
    .catch(function () { el.admin.hidden = true; });

  // Validation and calculation
  function validate() {
    var weight = el.weight.value.trim();
    var raw = el.rawPct.value.trim();
    var treat = el.treat.value.trim();
    var ok = true;
    var w = Number(weight);
    ok = fieldError("calc-weight", weight === "" || isNaN(w) || w < 0.5 || w > 90
      ? "Enter the weight in kg (0.5 to 90)." : "") && ok;
    if (currentMode() === "percent") {
      ok = fieldError("calc-raw", raw === "" || !/^\d+$/.test(raw) || Number(raw) > 100
        ? "Enter the raw share as a whole number from 0 to 100." : "") && ok;
    } else {
      var grams = el.kibbleG.value.trim();
      ok = fieldError("calc-kibble-g", grams === "" || isNaN(Number(grams)) || Number(grams) < 0 || Number(grams) > 5000
        ? "Enter the kibble weight in grams (0 to 5000)." : "") && ok;
    }
    ok = fieldError("calc-treat", treat === "" || !/^\d+$/.test(treat) || Number(treat) > 30
      ? "Enter treats as a whole number from 0 to 30." : "") && ok;
    ok = fieldError("calc-style", selectedStyle() ? "" : "Choose a feeding style.") && ok;
    ok = fieldError("calc-shape", el.bodyShape.value ? "" : "Choose the body shape.") && ok;
    return ok;
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    setText(el.error, "");
    setResultsVisible(false);
    el.results.innerHTML = "";
    if (!el.accept.checked) {
      return setText(el.error, "Tick the box to accept that this is a guide only before you see results.");
    }
    if (!validate()) return setText(el.error, "Check the highlighted fields.");

    var outcome = core.calculate({
      weightKg: Number(el.weight.value),
      mode: currentMode(),
      rawPct: Number(el.rawPct.value),
      kibbleGrams: Number(el.kibbleG.value),
      treatPct: Number(el.treat.value),
      style: selectedStyle(),
      factorKey: el.factor.value,
      bodyShape: el.bodyShape.value
    }, config, selectedProduct);

    if (outcome.status === "pending") {
      var reasons = {
        factors: "The daily calorie target is not available yet. It is waiting on confirmed activity factors.",
        bodyShape: "The daily calorie target is not available yet. It is waiting on confirmed body shape adjustments.",
        ingredients: "The raw portion calories are not available yet. Ingredient calorie values are still to be confirmed."
      };
      return setText(el.error, reasons[outcome.missing]);
    }
    if (outcome.status === "over") return renderOver(outcome);
    if (outcome.status === "needs_product") {
      return setText(el.error, "Choose a kibble product so the kibble grams can be shown.");
    }
    if (outcome.status !== "ok") return setText(el.error, outcome.error || "Something went wrong.");
    renderResults(outcome);
  });

  // Kibble weight too high for the daily target: say so in the results, with the most that fits
  function renderOver(o) {
    var heading = document.createElement("h2");
    setText(heading, "Too much kibble for today");
    el.results.appendChild(heading);
    var msg = document.createElement("p");
    setText(msg, "This kibble weight gives " + Math.round(o.kibbleKcal) + " kcal, but only " +
      Math.round(o.foodKcal) + " kcal is left in the daily target after treats. The kibble is " +
      Math.round(o.excessKcal) + " kcal too much.");
    el.results.appendChild(msg);
    var fit = document.createElement("p");
    setText(fit, "The most " + o.kibbleProduct.brand + " " + o.kibbleProduct.name + " that fits is about " +
      o.maxKibbleGrams + " g a day, with no raw food left over. Enter a lower weight, or add raw food by using the percentage option.");
    el.results.appendChild(fit);
    setResultsVisible(true);
  }

  function row(label, value) {
    var li = document.createElement("li");
    var strong = document.createElement("strong");
    setText(strong, label + ": ");
    li.appendChild(strong);
    li.appendChild(document.createTextNode(value));
    return li;
  }

  function renderResults(r) {
    var heading = document.createElement("h2");
    setText(heading, "Your results");
    el.results.appendChild(heading);

    var summary = document.createElement("ul");
    summary.appendChild(row("Daily energy target", r.derKcal + " kcal"));
    if (r.treatPct > 0) {
      summary.appendChild(row("Treats", r.treatKcal + " kcal (" + r.treatPct + "% of daily calories)"));
      if (r.treatPct > 10) {
        var treatNote = document.createElement("p");
        treatNote.className = "field-error";
        setText(treatNote, "Treats are above 10% of daily calories. Treats should not exceed 10%.");
        summary.appendChild(treatNote);
      }
    }
    el.results.appendChild(summary);

    if (r.kibbleKcal > 0) {
      var kibble = document.createElement("section");
      var kh = document.createElement("h3");
      setText(kh, "Kibble (" + r.kibblePct + "%)");
      kibble.appendChild(kh);
      kibble.appendChild(row("Calories", r.kibbleKcal + " kcal"));
      kibble.appendChild(row("Amount", r.kibbleGrams + " g"));
      el.results.appendChild(kibble);
    }

    if (r.rawKcal > 0) {
      var raw = document.createElement("section");
      var rh = document.createElement("h3");
      setText(rh, "Raw " + r.styleLabel + " (" + r.rawPct + "%)");
      raw.appendChild(rh);
      raw.appendChild(row("Calories", r.rawKcal + " kcal"));
      raw.appendChild(row("Amount", r.rawGrams + " g"));
      var basis = document.createElement("p");
      basis.className = "field-hint";
      setText(basis, "Calculated on the average calorie value of each ingredient: " + Math.round(r.rawKcalPer100g) +
        " kcal per 100g for the " + r.styleLabel + " mix.");
      raw.appendChild(basis);
      var range = document.createElement("p");
      range.className = "field-hint";
      setText(range, "Across the full calorie range the raw amount is " + r.rawGramsRange.min + " to " +
        r.rawGramsRange.max + " g.");
      raw.appendChild(range);
      var meatNote = document.createElement("p");
      meatNote.className = "field-hint";
      setText(meatNote, "Calories differ between meats, so the real amount may vary. Check the label of the meat you feed.");
      raw.appendChild(meatNote);
      var list = document.createElement("ul");
      r.recipe.forEach(function (item) { list.appendChild(row(item.label, item.grams + " g")); });
      raw.appendChild(list);
      el.results.appendChild(raw);
    }

    var shapeNote = document.createElement("p");
    shapeNote.className = "field-hint";
    setText(shapeNote, "Body shape: " + r.bodyShapeLabel + ".");
    el.results.appendChild(shapeNote);

    var note = document.createElement("p");
    note.className = "field-hint";
    setText(note, "Guide only. Figures are rounded to whole grams and the nearest 5 kcal.");
    el.results.appendChild(note);
    setResultsVisible(true);
  }
})();
