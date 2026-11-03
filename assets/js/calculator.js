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
    basis: document.getElementById("calc-basis"),
    rawPct: document.getElementById("calc-raw"),
    kibblePct: document.getElementById("calc-kibble-pct"),
    styleInputs: form.querySelectorAll('input[name="style"]'),
    search: document.getElementById("calc-product-search"),
    searchResults: document.getElementById("calc-product-results"),
    chosen: document.getElementById("calc-product-chosen"),
    error: document.getElementById("calc-error"),
    results: document.getElementById("calc-results"),
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
  updateKibblePct();

  // Disclaimer gate: results stay hidden until the box is ticked
  el.accept.addEventListener("change", function () {
    if (!el.accept.checked) {
      el.results.hidden = true;
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
    var ok = true;
    var w = Number(weight);
    ok = fieldError("calc-weight", weight === "" || isNaN(w) || w < 0.5 || w > 90
      ? "Enter the weight in kg (0.5 to 90)." : "") && ok;
    ok = fieldError("calc-raw", raw === "" || !/^\d+$/.test(raw) || Number(raw) > 100
      ? "Enter the raw share as a whole number from 0 to 100." : "") && ok;
    ok = fieldError("calc-style", selectedStyle() ? "" : "Choose a feeding style.") && ok;
    ok = fieldError("calc-shape", el.bodyShape.value ? "" : "Choose the body shape.") && ok;
    return ok;
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    setText(el.error, "");
    el.results.hidden = true;
    el.results.innerHTML = "";
    if (!el.accept.checked) {
      return setText(el.error, "Tick the box to accept that this is a guide only before you see results.");
    }
    if (!validate()) return setText(el.error, "Check the highlighted fields.");

    var outcome = core.calculate({
      weightKg: Number(el.weight.value),
      rawPct: Number(el.rawPct.value),
      style: selectedStyle(),
      factorKey: el.factor.value,
      bodyShape: el.bodyShape.value,
      basis: el.basis.value
    }, config, selectedProduct);

    if (outcome.status === "pending") {
      var reasons = {
        factors: "The daily calorie target is not available yet. It is waiting on confirmed activity factors.",
        bodyShape: "The daily calorie target is not available yet. It is waiting on confirmed body shape adjustments.",
        ingredients: "The raw portion calories are not available yet. Ingredient calorie values are still to be confirmed."
      };
      return setText(el.error, reasons[outcome.missing]);
    }
    if (outcome.status === "needs_product") {
      return setText(el.error, "Choose a kibble product so the kibble grams can be shown.");
    }
    if (outcome.status !== "ok") return setText(el.error, outcome.error || "Something went wrong.");
    renderResults(outcome);
  });

  var BASIS_LABELS = { low: "lower calorie", average: "average", high: "higher calorie" };

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
      setText(basis, "Basis: " + Math.round(r.rawKcalPer100g) + " kcal per 100g (" + BASIS_LABELS[r.basis] +
        " of a " + Math.round(r.rawKcalRange.low) + " to " + Math.round(r.rawKcalRange.high) +
        " kcal per 100g range), blended from the " + r.styleLabel + " ingredient split.");
      raw.appendChild(basis);
      var range = document.createElement("p");
      range.className = "field-hint";
      setText(range, "Across the full calorie range the raw amount is " + r.rawGramsRange.min + " to " +
        r.rawGramsRange.max + " g.");
      raw.appendChild(range);
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
    el.results.hidden = false;
  }
})();
