/* ==========================================================
   INVOICE SCRIPT
   Handles: line items, auto-calculation, JSON export/import,
   localStorage persistence, watermark toggle, and print.
   ==========================================================

   CALCULATION LOGIC:
   - Ext Price = Shipped qty * Unit price (per row)
   - Subtotal  = Sum of all Ext Prices + Surcharge
   - Total     = Subtotal + Tax + Freight

   Shipped qty is used (not Order qty) because the invoice
   bills for what was actually shipped.
   ========================================================== */

// ---------- Default line item data (matches the reference invoice) ----------
const DEFAULT_LINE_ITEMS = [
  {
    itemNo: "1",
    spepPN: "895",
    custPN: "N/A",
    carrier: "XPO Logistic",
    waybill: "704613792",
    deliveryNum: "101234080",
    description: "STEEL TIE RING, BLUE ZINC PLATED, 6000 LB CAPACITY",
    tariff: "31",
    order: "1000",
    shipped: "1000",
    unit: "5.92",
    extPrice: "5,920.00"
  },
  {
    itemNo: "2",
    spepPN: "FREIGHT",
    custPN: "N/A",
    carrier: "XPO Logistic",
    waybill: "N/A",
    deliveryNum: "N/A",
    description: "FREIGHT CHARGES",
    tariff: "0",
    order: "1",
    shipped: "1",
    unit: "560.66",
    extPrice: "560.66"
  },
  {
    itemNo: "3",
    spepPN: "WIRE FEE",
    custPN: "N/A",
    carrier: "XPO Logistic",
    waybill: "N/A",
    deliveryNum: "N/A",
    description: "CHARGES TO COVER WIRE FEE",
    tariff: "0",
    order: "1",
    shipped: "1",
    unit: "30.00",
    extPrice: "30.00"
  }
];

// ---------- Render a single line item row ----------
function createLineItemRow(data, index) {
  const tr = document.createElement("tr");
  tr.className = "line-item-row";
  tr.dataset.index = index;

  tr.innerHTML = `
    <td class="cell-center">
      <input type="text" value="${esc(data.itemNo)}" data-li="itemNo" style="text-align:center;">
    </td>
    <td>
      <div class="line-item-cell">
        <div class="line-item-main">
          <span class="li-label">SPEP P/N:</span>
          <input type="text" value="${esc(data.spepPN)}" data-li="spepPN" style="width:80px;">
          <span class="li-label">/ Cust P/N:</span>
          <input type="text" value="${esc(data.custPN)}" data-li="custPN" style="width:60px;">
        </div>
        <div class="line-item-carrier">
          <span class="li-label">Carrier:</span>
          <input type="text" value="${esc(data.carrier)}" data-li="carrier" style="width:90px; font-size:9px;">
          <span class="li-label">Waybill:</span>
          <input type="text" value="${esc(data.waybill)}" data-li="waybill" style="width:80px; font-size:9px;">
          <span class="li-label">Delivery #:</span>
          <input type="text" value="${esc(data.deliveryNum)}" data-li="deliveryNum" style="width:80px; font-size:9px;">
        </div>
        <div class="line-item-desc-text">
          <input type="text" value="${esc(data.description)}" data-li="description" style="width:100%; font-size:9px; text-transform:uppercase;">
        </div>
      </div>
    </td>
    <td class="cell-number">
      <input type="text" value="${esc(data.tariff)}" data-li="tariff">
    </td>
    <td class="cell-number">
      <input type="text" value="${esc(data.order)}" data-li="order">
    </td>
    <td class="cell-number">
      <input type="text" value="${esc(data.shipped)}" data-li="shipped" onchange="recalcRow(this)">
    </td>
    <td class="cell-number">
      <input type="text" value="${esc(data.unit)}" data-li="unit" onchange="recalcRow(this)">
    </td>
    <td class="cell-number">
      <input type="text" value="${esc(data.extPrice)}" data-li="extPrice" class="ext-price-input">
    </td>
    <td class="cell-center no-print">
      <button class="line-item-remove" onclick="removeLineItem(this)" title="Remove row">&times;</button>
    </td>
  `;

  return tr;
}

// ---------- Render all line items ----------
function renderLineItems(items) {
  const tbody = document.getElementById("line-items-body");
  tbody.innerHTML = "";
  items.forEach((item, i) => {
    tbody.appendChild(createLineItemRow(item, i));
  });
  recalcTotals();
}

// ---------- Add a blank line item ----------
function addLineItem() {
  const tbody = document.getElementById("line-items-body");
  const index = tbody.querySelectorAll(".line-item-row").length + 1;
  const blank = {
    itemNo: String(index),
    spepPN: "",
    custPN: "",
    carrier: "",
    waybill: "",
    deliveryNum: "",
    description: "",
    tariff: "0",
    order: "0",
    shipped: "0",
    unit: "0.00",
    extPrice: "0.00"
  };
  tbody.appendChild(createLineItemRow(blank, index - 1));
  saveToLocalStorage();
}

// ---------- Remove a line item ----------
function removeLineItem(btn) {
  const row = btn.closest("tr");
  row.remove();
  recalcTotals();
  saveToLocalStorage();
}

// ---------- Recalculate a single row ----------
// Ext Price = shipped * unit price
function recalcRow(input) {
  const row = input.closest("tr");
  const shipped = parseNum(row.querySelector('[data-li="shipped"]').value);
  const unit = parseNum(row.querySelector('[data-li="unit"]').value);
  const ext = shipped * unit;
  row.querySelector('[data-li="extPrice"]').value = formatNum(ext);
  recalcTotals();
}

// ---------- Recalculate totals ----------
function recalcTotals() {
  const extInputs = document.querySelectorAll(".ext-price-input");
  let sumExt = 0;
  extInputs.forEach(inp => {
    sumExt += parseNum(inp.value);
  });

  const surcharge = parseNum(document.getElementById("surcharge").value);
  const tax = parseNum(document.getElementById("tax").value);
  const freight = parseNum(document.getElementById("freight").value);

  const subtotal = sumExt + surcharge;
  const total = subtotal + tax + freight;

  document.getElementById("subtotal").textContent = formatNum(subtotal);
  document.getElementById("grand-total").textContent = "$" + formatNum(total);

  saveToLocalStorage();
}

// ---------- Number helpers ----------
function parseNum(str) {
  if (!str) return 0;
  // Remove commas, dollar signs, spaces
  const cleaned = String(str).replace(/[$,\s]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function formatNum(n) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function esc(str) {
  if (!str) return "";
  return String(str).replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ---------- Print ----------
function printInvoice() {
  window.print();
}

// ---------- Watermark toggle ----------
function toggleWatermark() {
  document.getElementById("watermark").classList.toggle("visible");
  saveToLocalStorage();
}

// ---------- Reset invoice ----------
function resetInvoice() {
  if (!confirm("Reset all invoice fields to defaults? This cannot be undone.")) return;
  localStorage.removeItem("invoiceData");
  location.reload();
}

// ==========================================================
// JSON EXPORT / IMPORT
// ==========================================================

function gatherInvoiceData() {
  const data = {};

  // All simple fields (inputs + contenteditable)
  document.querySelectorAll("[data-field]").forEach(el => {
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      data[el.dataset.field] = el.value;
    } else {
      data[el.dataset.field] = el.innerText;
    }
  });

  // Line items
  data.lineItems = [];
  document.querySelectorAll(".line-item-row").forEach(row => {
    const item = {};
    row.querySelectorAll("[data-li]").forEach(inp => {
      item[inp.dataset.li] = inp.value;
    });
    data.lineItems.push(item);
  });

  // Watermark state
  data._watermarkVisible = document.getElementById("watermark").classList.contains("visible");

  return data;
}

function applyInvoiceData(data) {
  if (!data) return;

  // Simple fields
  Object.keys(data).forEach(key => {
    if (key === "lineItems" || key.startsWith("_")) return;
    const el = document.querySelector(`[data-field="${key}"]`);
    if (!el) return;
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      el.value = data[key];
    } else {
      el.innerText = data[key];
    }
  });

  // Line items
  if (data.lineItems && data.lineItems.length > 0) {
    renderLineItems(data.lineItems);
  }

  // Watermark
  if (data._watermarkVisible) {
    document.getElementById("watermark").classList.add("visible");
  }

  recalcTotals();
}

function exportJSON() {
  const data = gatherInvoiceData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "invoice-" + (data.invoiceNumber || "export") + ".json";
  a.click();
  URL.revokeObjectURL(url);
}

function importJSON() {
  document.getElementById("json-file-input").click();
}

function handleFileImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      applyInvoiceData(data);
      saveToLocalStorage();
    } catch (err) {
      alert("Invalid JSON file: " + err.message);
    }
  };
  reader.readAsText(file);
  // Reset the input so the same file can be re-imported
  event.target.value = "";
}

// ==========================================================
// LOCAL STORAGE PERSISTENCE
// ==========================================================

function saveToLocalStorage() {
  try {
    const data = gatherInvoiceData();
    localStorage.setItem("invoiceData", JSON.stringify(data));
  } catch (e) {
    // Silently fail if storage is unavailable
  }
}

function loadFromLocalStorage() {
  try {
    const stored = localStorage.getItem("invoiceData");
    if (stored) {
      const data = JSON.parse(stored);
      applyInvoiceData(data);
      return true;
    }
  } catch (e) {
    // Ignore parse errors
  }
  return false;
}

// ---------- Auto-save on any input change ----------
document.addEventListener("input", function(e) {
  if (e.target.matches("input, textarea, [contenteditable]")) {
    // Debounce save
    clearTimeout(window._saveTimer);
    window._saveTimer = setTimeout(saveToLocalStorage, 500);
  }
});

// ==========================================================
// INITIALIZATION
// ==========================================================
document.addEventListener("DOMContentLoaded", function() {
  // Try loading saved data; if none, render defaults
  if (!loadFromLocalStorage()) {
    renderLineItems(DEFAULT_LINE_ITEMS);
  }
});
