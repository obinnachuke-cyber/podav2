const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSEYtCDQrbxiln-82ECtRwK_8hq6_3bo0uVGu1IRKtKEuVqsk8xWQ2x_sL7CatdyQ/pub?output=csv&gid=2076140585";

const productPage = document.getElementById("product-page");
const dashboardGrid = document.getElementById("itemsGrid");
const statusMessage = document.getElementById("statusMessage");
const searchInput = document.getElementById("searchInput");
const metricItems = document.getElementById("metricItems");
const metricClosetValue = document.getElementById("metricClosetValue");
const metricListedValue = document.getElementById("metricListedValue");
const metricSoldRevenue = document.getElementById("metricSoldRevenue");
const toggleButtons = dashboardGrid ? document.querySelectorAll(".toggle") : [];

const state = {
  items: [],
  activeFilter: "All",
  searchTerm: ""
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

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function itemDetailHref(item) {
  const id = String(item.id || "").trim();
  if (!id) return "";
  return `item.html?id=${encodeURIComponent(id)}`;
}

function getListedUrl(item) {
  return String(
    item.listedUrl ||
    item.listingUrl ||
    item["listed url"] ||
    item["listing url"] ||
    ""
  ).trim();
}

function getImageUrl(item) {
  return String(item.imageUrl || item.image || "").trim();
}

function itemImageAlt(item) {
  return `${item.brand || "Closet item"} ${item.name || ""}`.trim();
}

function renderCardImageContent(item) {
  const imageUrl = getImageUrl(item);

  if (!imageUrl) {
    return `<div class="image-placeholder">No image</div>`;
  }

  return `<img src="${escapeHTML(imageUrl)}" alt="${escapeHTML(itemImageAlt(item))}" loading="lazy" decoding="async" />`;
}

function renderProductImageContent(item) {
  const imageUrl = getImageUrl(item);

  if (!imageUrl) {
    return `<div class="product-placeholder">No image</div>`;
  }

  return `<img src="${escapeHTML(imageUrl)}" alt="${escapeHTML(itemImageAlt(item))}" decoding="async" />`;
}

function handleImageError(event) {
  const img = event.currentTarget;
  const container = img.closest(".item-image, .product-media");

  if (container) {
    container.classList.add("is-missing-image");
    img.remove();
  }
}

function bindImageErrorHandlers(root) {
  if (!root) return;

  root.querySelectorAll(".item-image img, .product-media img").forEach(img => {
    img.addEventListener("error", handleImageError, { once: true });
  });
}

function calculateMetrics(items) {
  const hasMetrics = metricItems || metricClosetValue || metricListedValue || metricSoldRevenue;
  if (!hasMetrics) return;

  const closetValue = items
    .filter(item => cleanStatus(item.status) !== "Sold")
    .reduce((sum, item) => sum + parseMoney(item.value), 0);

  const listedValue = items
    .filter(item => cleanStatus(item.status) === "Listed")
    .reduce((sum, item) => sum + (parseMoney(item.price) || parseMoney(item.value)), 0);

  const soldRevenue = items
    .filter(item => cleanStatus(item.status) === "Sold")
    .reduce((sum, item) => sum + parseMoney(item.price), 0);

  if (metricItems) metricItems.textContent = items.length;
  if (metricClosetValue) metricClosetValue.textContent = formatMoney(closetValue);
  if (metricListedValue) metricListedValue.textContent = formatMoney(listedValue);
  if (metricSoldRevenue) metricSoldRevenue.textContent = formatMoney(soldRevenue);
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
  const listedUrl = getListedUrl(item);
  const soldClass = status === "Sold" ? " archive-card--sold" : "";
  const detailHref = itemDetailHref(item);
  const assetLinkOpen = detailHref
    ? `<a class="item-card__asset-link" href="${escapeHTML(detailHref)}">`
    : "";
  const assetLinkClose = detailHref ? "</a>" : "";
  const titleInner = detailHref
    ? `<a class="item-card__asset-link item-card__asset-link--title" href="${escapeHTML(detailHref)}">${escapeHTML(item.name || "Untitled Item")}</a>`
    : escapeHTML(item.name || "Untitled Item");

  return `
    <article class="item-card archive-card${soldClass}">
      ${assetLinkOpen}
      <div class="item-image${getImageUrl(item) ? "" : " item-image--empty"}">
        ${renderCardImageContent(item)}
      </div>
      ${assetLinkClose}
      <div class="item-body">
        <div class="item-body__hero">
          <p class="brand">${escapeHTML(item.brand || "Unknown Brand")}</p>
          <div class="item-body__title-row">
            <h2 class="item-title">${titleInner}</h2>
            <span class="badge">${escapeHTML(status)}</span>
          </div>
        </div>

        <dl class="item-ledger${status === "Closet" ? " item-ledger--closet" : ""}">
          <div class="item-ledger__row">
            <dt>Value</dt>
            <dd>${escapeHTML(item.value || "—")}</dd>
          </div>
          ${status !== "Closet"
            ? `<div class="item-ledger__row">
            <dt>Price</dt>
            <dd>${escapeHTML(item.price || "—")}</dd>
          </div>`
            : ""}
        </dl>

        <div class="detail-grid">
          <div class="detail">
            <span>Category</span>
            <strong>${escapeHTML(item.category || "—")}</strong>
          </div>
          <div class="detail">
            <span>Liquidity</span>
            <strong>${escapeHTML(item.liquidity || "—")}</strong>
          </div>
        </div>

        ${item.thesis ? `<p class="thesis">${escapeHTML(item.thesis)}</p>` : ""}

        <div class="item-card__actions">
          ${detailHref ? `<a class="card-link card-link--asset" href="${escapeHTML(detailHref)}">View asset</a>` : ""}
          ${status === "Listed" && listedUrl
            ? `<a class="card-link card-link--listed" href="${escapeHTML(listedUrl)}" target="_blank" rel="noopener">View listing</a>`
            : ""}
        </div>
      </div>
    </article>
  `;
}

function renderDashboard() {
  if (!dashboardGrid) return;

  const filtered = getFilteredItems();

  calculateMetrics(state.items);

  if (!state.items.length) {
    if (statusMessage) {
      statusMessage.textContent = "No closet data loaded. Check that your Google Sheet is published to the web as a CSV.";
      statusMessage.classList.remove("hidden");
    }
    dashboardGrid.innerHTML = "";
    return;
  }

  if (!filtered.length) {
    if (statusMessage) {
      statusMessage.textContent = "No items match this filter/search.";
      statusMessage.classList.remove("hidden");
    }
    dashboardGrid.innerHTML = "";
    return;
  }

  if (statusMessage) statusMessage.classList.add("hidden");
  dashboardGrid.innerHTML = filtered.map(itemCard).join("");
  bindImageErrorHandlers(dashboardGrid);
}

function productDetailRow(label, value) {
  return `
    <div class="product-detail-row">
      <span>${escapeHTML(label)}</span>
      <strong>${escapeHTML(value || "—")}</strong>
    </div>
  `;
}

function renderProductPage(items) {
  if (!productPage) return;

  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");

  if (!items.length) {
    productPage.innerHTML = `
      <div class="product-error">
        <p>Closet data could not be loaded.</p>
        <a class="product-link" href="index.html#closet-capital">← Back to portfolio</a>
      </div>
    `;
    return;
  }

  if (!id) {
    productPage.innerHTML = `
      <div class="product-error">
        <p>Asset not found.</p>
        <a class="product-link" href="index.html#closet-capital">← Back to portfolio</a>
      </div>
    `;
    return;
  }

  const item = items.find(piece => String(piece.id).trim() === String(id).trim());

  if (!item) {
    productPage.innerHTML = `
      <div class="product-error">
        <p>Asset not found.</p>
        <a class="product-link" href="index.html#closet-capital">← Back to portfolio</a>
      </div>
    `;
    return;
  }

  const status = cleanStatus(item.status);
  const listedUrl = getListedUrl(item);
  const soldClass = status === "Sold" ? " product-layout--sold" : "";

  document.title = `${item.name || item.id} — Poda Closet`;

  productPage.innerHTML = `
    <article class="product-layout${soldClass}">
      <div class="product-media${getImageUrl(item) ? "" : " product-media--empty"}">
        ${renderProductImageContent(item)}
      </div>

      <div class="product-info">
        <p class="product-kicker">${escapeHTML(item.brand || "Unknown Brand")}</p>
        <h1 class="product-title">${escapeHTML(item.name || "Untitled Item")}</h1>
        <p class="product-status"><span class="badge">${escapeHTML(status)}</span></p>

        <dl class="product-details">
          ${productDetailRow("Category", item.category)}
          ${productDetailRow("Status", status)}
          ${productDetailRow("Value", item.value)}
          ${status !== "Closet" ? productDetailRow("Price", item.price) : ""}
          ${productDetailRow("Liquidity", item.liquidity)}
        </dl>

        ${item.thesis ? `<div class="product-note"><p>${escapeHTML(item.thesis)}</p></div>` : ""}

        <div class="product-actions">
          ${status === "Listed" && listedUrl
            ? `<a class="product-link product-link--listed" href="${escapeHTML(listedUrl)}" target="_blank" rel="noopener">View listing</a>`
            : ""}
          <a class="product-link" href="index.html#closet-capital">← Back to portfolio</a>
        </div>
      </div>
    </article>
  `;

  bindImageErrorHandlers(productPage);
}

function initDashboard() {
  if (!dashboardGrid) return;

  toggleButtons.forEach(button => {
    button.addEventListener("click", () => {
      toggleButtons.forEach(btn => btn.classList.remove("active"));
      button.classList.add("active");
      state.activeFilter = button.dataset.filter;
      renderDashboard();
    });
  });

  if (searchInput) {
    searchInput.addEventListener("input", event => {
      state.searchTerm = event.target.value;
      renderDashboard();
    });
  }
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

    if (dashboardGrid) renderDashboard();
    if (productPage) renderProductPage(state.items);
  } catch (error) {
    console.error(error);
    state.items = [];

    if (dashboardGrid) {
      if (statusMessage) {
        statusMessage.textContent = "No closet data loaded. Confirm your sheet is published publicly and your CSV URL is correct.";
        statusMessage.classList.remove("hidden");
      }
      dashboardGrid.innerHTML = "";
    }

    if (productPage) {
      renderProductPage([]);
    }
  }
}

initDashboard();
loadClosetData();
