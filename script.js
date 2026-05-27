const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSEYtCDQrbxiln-82ECtRwK_8hq6_3bo0uVGu1IRKtKEuVqsk8xWQ2x_sL7CatdyQ/pub?output=csv&gid=2076140585";

const state = {
  items: [],
  activeFilter: "All",
  searchTerm: ""
};

const els = {
  grid: document.getElementById("itemsGrid"),
  status: document.getElementById("statusMessage"),
  search: document.getElementById("searchInput"),
  toggles: document.querySelectorAll(".toggle"),
  metricItems: document.getElementById("metricItems"),
  metricClosetValue: document.getElementById("metricClosetValue"),
  metricListedValue: document.getElementById("metricListedValue"),
  metricSoldRevenue: document.getElementById("metricSoldRevenue")
};

function parseCSV(text) {
  const rows = [];
  let current = "";
  let row = [];
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && insideQuotes && next === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === "," && !insideQuotes) {
      row.push(current.trim());
      current = "";
    } else if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (char === "\r" && next === "\n") i++;
      row.push(current.trim());
      if (row.some(cell => cell !== "")) rows.push(row);
      row = [];
      current = "";
    } else {
      current += char;
    }
  }

  row.push(current.trim());
  if (row.some(cell => cell !== "")) rows.push(row);

  return rows;
}

function normalizeHeader(header) {
  return header.trim().replace(/^\uFEFF/, "");
}

function rowsToObjects(rows) {
  if (!rows.length) return [];

  const headers = rows[0].map(normalizeHeader);

  return rows.slice(1).map(row => {
    const item = {};
    headers.forEach((header, index) => {
      item[header] = row[index] || "";
    });
    return item;
  }).filter(item => item.id || item.brand || item.name);
}

function parseMoney(value) {
  if (!value) return 0;

  const matches = String(value).match(/\$?\d+(?:,\d{3})*(?:\.\d+)?/g);
  if (!matches) return 0;

  const numbers = matches.map(num => Number(num.replace(/[$,]/g, ""))).filter(Number.isFinite);
  if (!numbers.length) return 0;

  // If value is a range like $120-$160, use the midpoint.
  return numbers.reduce((sum, num) => sum + num, 0) / numbers.length;
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value || 0);
}

function cleanStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();

  if (normalized === "closet") return "Closet";
  if (normalized === "listed") return "Listed";
  if (normalized === "sold") return "Sold";

  return status || "Closet";
}

function calculateMetrics(items) {
  const closetValue = items
    .filter(item => cleanStatus(item.status) !== "Sold")
    .reduce((sum, item) => sum + parseMoney(item.value), 0);

  const listedValue = items
    .filter(item => cleanStatus(item.status) === "Listed")
    .reduce((sum, item) => sum + (parseMoney(item.price) || parseMoney(item.value)), 0);

  const soldRevenue = items
    .filter(item => cleanStatus(item.status) === "Sold")
    .reduce((sum, item) => sum + parseMoney(item.price), 0);

  els.metricItems.textContent = items.length;
  els.metricClosetValue.textContent = formatMoney(closetValue);
  els.metricListedValue.textContent = formatMoney(listedValue);
  els.metricSoldRevenue.textContent = formatMoney(soldRevenue);
}

function getFilteredItems() {
  return state.items.filter(item => {
    const statusMatch = state.activeFilter === "All" || cleanStatus(item.status) === state.activeFilter;
    const searchableText = [
      item.brand,
      item.name,
      item.category,
      item.status,
      item.liquidity,
      item.thesis
    ].join(" ").toLowerCase();

    const searchMatch = searchableText.includes(state.searchTerm.toLowerCase());

    return statusMatch && searchMatch;
  });
}

function itemCard(item) {
  const status = cleanStatus(item.status);
  const imageUrl = item.imageUrl || item.image || "";
  const listingUrl = item.listingUrl || "";

  return `
    <article class="item-card">
      <div class="item-image">
        ${imageUrl
          ? `<img src="${escapeHTML(imageUrl)}" alt="${escapeHTML(item.brand || "Closet item")} ${escapeHTML(item.name || "")}" loading="lazy" />`
          : `<div class="image-placeholder">No image</div>`
        }
      </div>
      <div class="item-body">
        <div class="card-topline">
          <p class="brand">${escapeHTML(item.brand || "Unknown Brand")}</p>
          <span class="badge">${escapeHTML(status)}</span>
        </div>

        <h2 class="item-title">${escapeHTML(item.name || "Untitled Item")}</h2>

        <div class="detail-grid">
          <div class="detail">
            <span>Category</span>
            <strong>${escapeHTML(item.category || "—")}</strong>
          </div>
          <div class="detail">
            <span>Liquidity</span>
            <strong>${escapeHTML(item.liquidity || "—")}</strong>
          </div>
          <div class="detail">
            <span>Value</span>
            <strong>${escapeHTML(item.value || "—")}</strong>
          </div>
          <div class="detail">
            <span>Price</span>
            <strong>${escapeHTML(item.price || "—")}</strong>
          </div>
        </div>

        ${item.thesis ? `<p class="thesis">${escapeHTML(item.thesis)}</p>` : ""}

        ${listingUrl ? `<a class="card-link" href="${escapeHTML(listingUrl)}" target="_blank" rel="noopener">View listing</a>` : ""}
      </div>
    </article>
  `;
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function render() {
  const filtered = getFilteredItems();

  calculateMetrics(state.items);

  if (!state.items.length) {
    els.status.textContent = "No closet data loaded. Check that your Google Sheet is published to the web as a CSV.";
    els.status.classList.remove("hidden");
    els.grid.innerHTML = "";
    return;
  }

  if (!filtered.length) {
    els.status.textContent = "No items match this filter/search.";
    els.status.classList.remove("hidden");
    els.grid.innerHTML = "";
    return;
  }

  els.status.classList.add("hidden");
  els.grid.innerHTML = filtered.map(itemCard).join("");
}

async function loadClosetData() {
  try {
    const response = await fetch(CSV_URL, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`CSV request failed: ${response.status}`);
    }

    const csvText = await response.text();
    const rows = parseCSV(csvText);
    state.items = rowsToObjects(rows);
    render();
  } catch (error) {
    console.error(error);
    state.items = [];
    els.status.textContent = "No closet data loaded. Confirm your sheet is published publicly and your CSV URL is correct.";
    els.status.classList.remove("hidden");
    els.grid.innerHTML = "";
  }
}

els.toggles.forEach(button => {
  button.addEventListener("click", () => {
    els.toggles.forEach(btn => btn.classList.remove("active"));
    button.classList.add("active");
    state.activeFilter = button.dataset.filter;
    render();
  });
});

els.search.addEventListener("input", event => {
  state.searchTerm = event.target.value;
  render();
});

loadClosetData();
