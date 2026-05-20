const PAGE_SIZE = 100;
let currentPage = 1;
let searchQuery = "";
let hiddenCols = new Set();

function escHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
let zoneSectorMap = {};
let selectedZoneForSectors = null;
let tableData = [];
let sortState = { key: null, asc: true };
let activeMaps = {};
let currentView = "data";
let showOnlyActiveZones = true;

const FILTER_STORAGE_KEY = "dashboard_filters";
const TAB_STORAGE_KEY = "dashboard_active_tab";
const RAIN_DAYS_STORAGE_KEY = "dashboard_rain_days";

const MANAGER_NAMES = {
  2: "შოთა ზაქარიაძე",
  3: "დავით ძნელაძე",
  4: "ჯანო ნოღაიდელი",
  10: "მამუკა მაზანაშვილი",
  9: "დიმიტრი ბოქოლიშვილი",
  8: "ალექსანდრე საზანდრიშვილი",
  7: "ბაჩუკი ხარაიშვილი",
  1: "მარიამ ბაინდურაშვილი",
  11: "ჯონი ელბაქიძე",
  12: "მიხეილ სომხიშვილი",
  6: "გიორგი ქევხიშვილი",
  13: "ავთანდილ მახათაძე",
  14: "ირაკლი კერესელიძე",
};

const MANAGER_PREFIXES = [
  "10",
  "11",
  "12",
  "13",
  "14",
  "9",
  "8",
  "7",
  "6",
  "4",
  "3",
  "2",
  "1",
];

function getManagerPrefixFromTag(tag) {
  const cleanTag = String(tag || "").trim();
  return MANAGER_PREFIXES.find((prefix) => cleanTag.startsWith(prefix)) || "";
}

function saveFiltersToStorage() {
  const filters = {
    zone: document.getElementById("f-zone").value,
    sector: document.getElementById("f-sector").value,
    dateFrom: document.getElementById("f-from").value,
    dateTo: document.getElementById("f-to").value,
    manager: document.getElementById("manager-selected")
      ? document.getElementById("manager-selected").dataset.value || ""
      : "",
    azomvis: getSelectedAzomvis(),
  };

  localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters));
  syncFiltersToURL();
}

function loadFiltersFromStorage() {
  const stored = localStorage.getItem(FILTER_STORAGE_KEY);

  if (stored) {
    try {
      const filters = JSON.parse(stored);

      if (filters.zone) document.getElementById("f-zone").value = filters.zone;
      if (filters.sector)
        document.getElementById("f-sector").value = filters.sector;
      if (filters.dateFrom)
        document.getElementById("f-from").value = filters.dateFrom;
      if (filters.dateTo)
        document.getElementById("f-to").value = filters.dateTo;

      const managerSelected = document.getElementById("manager-selected");

      if (managerSelected) {
        const managerValue = filters.manager || "";
        const managerText = managerValue
          ? MANAGER_NAMES[managerValue]
          : "ყველა";

        managerSelected.dataset.value = managerValue;
        managerSelected.textContent = managerText + " ▼";
      }

      if (filters.azomvis) {
        setSelectedAzomvis(filters.azomvis);
      }
    } catch (e) {
      console.error("Error loading filters:", e);
    }
  }
}
function syncFiltersToURL() {
  const params = new URLSearchParams();
  const zone    = document.getElementById("f-zone").value.trim();
  const sector  = document.getElementById("f-sector").value.trim();
  const from    = document.getElementById("f-from").value;
  const to      = document.getElementById("f-to").value;
  const manager = document.getElementById("manager-selected")?.dataset.value || "";
  const azomvis = getSelectedAzomvis();

  if (zone)    params.set("zone", zone);
  if (sector)  params.set("sector", sector);
  if (from)    params.set("from", from);
  if (to)      params.set("to", to);
  if (manager) params.set("manager", manager);
  if (azomvis.length > 0 && azomvis.length < 5) params.set("azomvis", azomvis.join(","));

  const newUrl = params.toString()
    ? `${location.pathname}?${params.toString()}`
    : location.pathname;
  history.replaceState(null, "", newUrl);
}

function loadFiltersFromURL() {
  const params = new URLSearchParams(location.search);
  if (!params.toString()) return false;

  if (params.get("zone"))    document.getElementById("f-zone").value    = params.get("zone");
  if (params.get("sector"))  document.getElementById("f-sector").value  = params.get("sector");
  if (params.get("from"))    document.getElementById("f-from").value    = params.get("from");
  if (params.get("to"))      document.getElementById("f-to").value      = params.get("to");

  const manager = params.get("manager");
  if (manager) {
    const el = document.getElementById("manager-selected");
    if (el) {
      el.dataset.value = manager;
      el.textContent = (MANAGER_NAMES[Number(manager)] || "ყველა") + " ▼";
    }
  }

  const azomvis = params.get("azomvis");
  if (azomvis) setSelectedAzomvis(azomvis.split(","));

  return true;
}

function initDatePresets() {
  document.querySelectorAll(".date-preset").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.preset === "mission1") {
        document.getElementById("f-from").value = "2026-05-07";
        document.getElementById("f-to").value   = "2026-05-17";
      } else if (btn.dataset.preset === "mission2") {
        document.getElementById("f-from").value = "2026-05-25";
        document.getElementById("f-to").value   = "2026-06-08";
      }
      saveFiltersToStorage();
      loadData(false);
    });
  });
}

function renderActiveFilters() {
  const bar = document.getElementById("active-filters-bar");
  if (!bar) return;

  const filters = [];

  const zoneInput = document.getElementById("f-zone");
  const sectorInput = document.getElementById("f-sector");
  const fromInput = document.getElementById("f-from");
  const toInput = document.getElementById("f-to");
  const managerEl = document.getElementById("manager-selected");

  const zone = zoneInput.value.trim();
  const sector = sectorInput.value.trim();
  const from = fromInput.value;
  const to = toInput.value;

  const managerValue = managerEl ? managerEl.dataset.value || "" : "";
  const managerText = managerEl
    ? managerEl.textContent.replace("▼", "").trim()
    : "";

  if (zone) {
    filters.push({
      label: `ZONE: ${zone}`,
      clear: () => {
        zoneInput.value = "";
      },
    });
  }

  if (sector) {
    filters.push({
      label: `SECTOR: ${sector}`,
      clear: () => {
        sectorInput.value = "";
      },
    });
  }

  if (from || to) {
    filters.push({
      label: `DATE: ${from || "—"} → ${to || "—"}`,
      clear: () => {
        fromInput.value = "";
        toInput.value = "";
      },
    });
  }

  if (managerValue) {
    filters.push({
      label: `მენეჯერი: ${managerText}`,
      clear: () => {
        managerEl.dataset.value = "";
        managerEl.textContent = "ყველა ▼";
      },
    });
  }

  if (filters.length === 0) {
    bar.innerHTML = "";
    return;
  }

  bar.innerHTML = filters
    .map(
      (filter, index) => `
        <div class="filter-chip">
          <span>${filter.label}</span>
          <button type="button" data-chip="${index}">✕</button>
        </div>
      `,
    )
    .join("");

  bar.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const index = Number(btn.dataset.chip);

      filters[index].clear();

      saveFiltersToStorage();
      renderActiveFilters();
      loadData(false);
    });
  });
}

function getSelectedAzomvis() {
  const checkboxes = document.querySelectorAll("#az-menu input.az-opt[value]");
  const selected = [];

  checkboxes.forEach((cb) => {
    if (cb.checked) selected.push(cb.value);
  });

  return selected;
}

function setSelectedAzomvis(values) {
  const checkboxes = document.querySelectorAll("#az-menu input.az-opt[value]");

  checkboxes.forEach((cb) => {
    cb.checked = values.includes(cb.value);
  });

  updateAzomvisDisplay();
}

function updateAzomvisDisplay() {
  const d = document.getElementById("az-selected");
  // const checkboxes = document.querySelectorAll(".az-menu .az-opt");
  const checkboxes = document.querySelectorAll(
    ".az-menu label:not(.select-all-label) .az-opt",
  );

  if (!d || !checkboxes.length) return;

  const checked = [...checkboxes].filter((x) => x.checked);

  const txt =
    checked.length === 0
      ? "არცერთი"
      : checked.length === checkboxes.length
        ? "ყველა"
        : // : checked.map((x) => x.closest("label").innerText).join(", ");
          checked
            .map((x) =>
              x.closest("label").querySelector(".az-text")?.innerText.trim(),
            )
            .filter(Boolean)
            .join(", ");

  d.innerText = txt + " ▼";
}

function saveActiveTab() {
  localStorage.setItem(TAB_STORAGE_KEY, currentView);
}

function loadActiveTab() {
  const stored = localStorage.getItem(TAB_STORAGE_KEY);

  if (stored && (stored === "data" || stored === "report")) {
    currentView = stored;
    return stored;
  }

  return "data";
}

window.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initProj4();
  initDropdowns();
  initDateInputs();
  loadZoneSectors();
  initMapToggle();
  const activeZonesToggle = document.getElementById("toggle-active-zones");

  if (activeZonesToggle) {
    activeZonesToggle.checked = showOnlyActiveZones;

    activeZonesToggle.addEventListener("change", () => {
      showOnlyActiveZones = activeZonesToggle.checked;
      renderZoneMap();
    });
  }

  if (!loadFiltersFromURL()) loadFiltersFromStorage();
  renderActiveFilters();

  const savedTab = loadActiveTab();
  if (savedTab) switchView(savedTab);

  function on(id, event, handler) {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener(event, handler);
    }
  }

  on("f-zone", "input", saveFiltersToStorage);
  on("f-sector", "input", saveFiltersToStorage);
  on("f-from", "change", saveFiltersToStorage);
  on("f-to", "change", saveFiltersToStorage);

  on("btn-load", "click", () => {
    saveFiltersToStorage();
    loadData(false);
  });

  on("btn-reset", "click", resetFilters);

  on("btn-clear-active-filter", "click", clearActiveZoneSectorFilter);

  if (document.getElementById("btn-add-rain")) {
    on("btn-add-rain", "click", addRainDay);
    renderRainDays();
  }

  on("btn-refresh", "click", () => loadData(true));

  on("btn-excel", "click", exportReportToExcel);

  on("tab-data", "click", () => {
    switchView("data");
    saveActiveTab();
  });

  on("tab-report", "click", () => {
    switchView("report");
    saveActiveTab();
  });

  document.querySelectorAll("th.sortable").forEach((th) => {
    th.addEventListener("click", () => handleSort(th.dataset.key));
  });

  on("themeToggle", "change", () => {
    if (currentView === "report") updateCharts();
    updateMapTileLayer();
  });

  initColumnToggle();
  initTableSearch();
  initDatePresets();
  initAdminTools();
  initWeatherModule();

  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.closest(".filters-panel") && !e.target.closest(".az-menu")) {
      saveFiltersToStorage();
      loadData(false);
    }
  });
});

function switchView(view) {
  currentView = view;

  const tabData = document.getElementById("tab-data");
  const tabReport = document.getElementById("tab-report");
  const viewTable = document.getElementById("view-table");
  const viewReport = document.getElementById("view-report");
  const sidebar = document.getElementById("sidebar-panel");

  if (view === "data") {
    tabData.classList.add("active");
    tabReport.classList.remove("active");
    viewTable.style.display = "block";
    viewReport.style.display = "none";
    sidebar.style.display = "block";
    renderTable();
  } else {
    tabData.classList.remove("active");
    tabReport.classList.add("active");
    viewTable.style.display = "none";
    viewReport.style.display = "block";
    renderReport();
  }
}

function cleanTagName(tag) {
  if (!tag) return "N/A";
  return tag.replace(/[0-9]/g, "").trim();
}

function getCategoryGroup(row) {
  if (row.CATEGORY === "1" || row.FUNCTION === "2") {
    return "საკარმიდამო";
  }

  return "სავარგული";
}

let chartInstances = {};
let _isLoading = false;

function showToast(message, type = "success") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add("show"));
  });

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 350);
  }, 3200);
}

function showTableSkeleton() {
  const tbody = document.querySelector("#tbl tbody");
  if (!tbody) return;
  tbody.innerHTML = Array(8).fill(
    `<tr class="skeleton-row">${Array(9).fill('<td><div class="skeleton-cell"></div></td>').join("")}</tr>`
  ).join("");
}

function renderReport() {
  if (!tableData || tableData.length === 0) {
    const reportBody = document.querySelector("#report-tbl tbody");

    if (reportBody) {
      reportBody.innerHTML = `
        <tr>
          <td colspan="5">
            <div class="empty-report">
              <div class="empty-icon">📭</div>
              <div class="empty-title">მონაცემები ვერ მოიძებნა</div>
              <div class="empty-subtitle">
                სცადე სხვა ზონა, სექტორი, თარიღი ან მენეჯერი
              </div>
            </div>
          </td>
        </tr>
      `;
    }

    renderActiveFilters();
    return;
  }

  updateKPIs();
  updateCharts();
  renderTopInsights();
  renderZoneMap();
  renderPivotTable();
  renderActiveFilters();
  refreshLiveMapStyles();
}

function updateKPIs() {
  const total = tableData.length;

  const tagCounts = {};

  tableData.forEach((d) => {
    const t = cleanTagName(d.TAG);
    tagCounts[t] = (tagCounts[t] || 0) + 1;
  });

  let topTag = "-";
  let maxCount = 0;

  for (const [t, c] of Object.entries(tagCounts)) {
    if (c > maxCount) {
      maxCount = c;
      topTag = t;
    }
  }

  let primaryCount = 0;
  let changeCount = 0;

  tableData.forEach((d) => {
    const azomvisType = String(d.AZOMVIS_TIPI_LABEL || d.AZOMVIS_TIPI || "")
      .trim()
      .toLowerCase();

    if (azomvisType.includes("პირველადი") || azomvisType === "0") {
      primaryCount++;
    } else if (azomvisType.includes("ცვლილება") || azomvisType === "1") {
      changeCount++;
    }
  });

  let cat1 = 0;
  let cat2 = 0;

  tableData.forEach((d) => {
    if (getCategoryGroup(d) === "საკარმიდამო") {
      cat1++;
    } else {
      cat2++;
    }
  });

  animateValue("kpi-total", total);

  const primaryPercent =
    total > 0 ? ((primaryCount / total) * 100).toFixed(1) : 0;

  const changePercent =
    total > 0 ? ((changeCount / total) * 100).toFixed(1) : 0;

  const azomvisElement = document.getElementById("kpi-azomvis-ratio");

  if (azomvisElement) {
    azomvisElement.innerHTML = `
  <span class="kpi-number">${primaryCount} / ${changeCount}</span>

  <span class="kpi-hover-tooltip">
    <span>პირველადი: ${primaryPercent}%</span>
    <span>ცვლილება: ${changePercent}%</span>
  </span>
`;

    azomvisElement.removeAttribute("data-tooltip");
  }

  document.getElementById("kpi-top-tag").innerText =
    `🏆 ${topTag} (${maxCount})`;

  const catEl = document.getElementById("kpi-cat-ratio");
  if (catEl) {
    const cat1Percent = total > 0 ? ((cat1 / total) * 100).toFixed(1) : 0;
    const cat2Percent = total > 0 ? ((cat2 / total) * 100).toFixed(1) : 0;
    catEl.innerHTML = `<span class="kpi-number">${cat1} / ${cat2}</span>
    <span class="kpi-hover-tooltip">
      <span>საკარმიდამო: ${cat1Percent}%</span>
      <span>სავარგული: ${cat2Percent}%</span>
    </span>`;
  }
}

function animateValue(id, end) {
  const obj = document.getElementById(id);
  if (!obj) return;

  const start = parseInt(obj.innerText) || 0;
  if (start === end) return;

  let current = start;
  const range = Math.abs(end - start);
  const increment = end > start ? 1 : -1;
  const step = Math.max(Math.floor(1500 / range), 10);

  const timer = setInterval(() => {
    current += increment;
    obj.innerText = current;
    if (current === end) clearInterval(timer);
  }, step);
}
let rainDaysCache = {};

function getRainDays() {
  return rainDaysCache || {};
}

async function fetchRainDays() {
  try {
    const res = await fetch("/api/rain-days");
    if (!res.ok) {
      rainDaysCache = {};
      return rainDaysCache;
    }
    const data = await res.json();
    rainDaysCache = data.ok === false ? {} : (data || {});
  } catch (e) {
    rainDaysCache = {};
  }

  return rainDaysCache;
}

async function addRainDay() {
  const date = document.getElementById("rain-date").value;
  const zone = document.getElementById("rain-zone").value.trim();

  if (!date || !zone) {
    showToast("აირჩიე თარიღიც და ზონაც", "warning");
    return;
  }

  try {
    const res = await fetch("/api/rain-days", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, zone }),
    });
    const data = await res.json();
    if (!res.ok || data.ok === false) {
      showToast("შეცდომა: " + (data.error || res.status), "error");
      return;
    }
  } catch (e) {
    showToast("კავშირის შეცდომა: " + e.message, "error");
    return;
  }

  showToast(`წვიმიანი დღე დამატებულია: ${date} / ზონა ${zone}`, "success");
  await renderRainDays();
  renderReport();
}

async function removeRainDay(date, zone) {
  try {
    const res = await fetch("/api/rain-days", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, zone }),
    });
    const data = await res.json();
    if (!res.ok || data.ok === false) {
      showToast("შეცდომა: " + (data.error || res.status), "error");
      return;
    }
  } catch (e) {
    showToast("კავშირის შეცდომა: " + e.message, "error");
    return;
  }

  showToast(`წაიშალა: ${date} / ზონა ${zone}`, "info");
  await renderRainDays();
  renderReport();
}

async function renderRainDays() {
  const container = document.getElementById("rain-list");
  if (!container) return;

  const rainDays = await fetchRainDays();

  container.innerHTML = "";

  Object.entries(rainDays).forEach(([date, zones]) => {
    zones.forEach((zone) => {
      const chip = document.createElement("span");
      chip.className = "rain-chip";

      const removeBtn = document.createElement("span");
      removeBtn.className = "rain-remove";
      removeBtn.textContent = "×";
      removeBtn.addEventListener("click", () => removeRainDay(date, zone));

      chip.textContent = `🌧 ${escHtml(date)} / ზონა ${escHtml(zone)} `;
      chip.appendChild(removeBtn);

      container.appendChild(chip);
    });
  });
}
function getSelectedDaysCount() {
  const dateFromValue = document.getElementById("f-from").value;
  const dateToValue = document.getElementById("f-to").value;

  let days = [];

  if (dateFromValue && dateToValue) {
    const start = new Date(dateFromValue);
    const end = new Date(dateToValue);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      days.push(d.toISOString().slice(0, 10));
    }
  } else if (dateFromValue) {
    days = [dateFromValue];
  } else {
    days = [new Date().toISOString().slice(0, 10)];
  }

  const rainDays = getRainDays();

  const resultZones = [
    ...new Set(tableData.map((row) => String(row.ZONE || "").trim())),
  ].filter(Boolean);

  const rainyDatesToExclude = new Set();

  days.forEach((day) => {
    if (!rainDays[day]) return;

    const rainyZones = rainDays[day].map((z) => String(z).trim());

    const hasRainInCurrentData = rainyZones.some((rainZone) =>
      resultZones.includes(rainZone),
    );

    if (hasRainInCurrentData) {
      rainyDatesToExclude.add(day);
    }
  });

  const validDaysCount = days.length - rainyDatesToExclude.size;

  return validDaysCount > 0 ? validDaysCount : 1;
}
function getZoneFromCadcode(row) {
  const cadcode = String(row.CADCODE || "").trim();

  if (cadcode.includes(".")) {
    const parts = cadcode.split(".");
    if (parts.length > 1) return parts[1];
  }

  return String(row.ZONE || "").trim() || "N/A";
}
function getSectorFromCadcode(row) {
  const cadcode = String(row.CADCODE || "").trim();

  if (cadcode.includes(".")) {
    const parts = cadcode.split(".");
    if (parts.length > 2) return parts[2];
  }

  return String(row.SECTOR || "").trim() || "N/A";
}
function loadZoneSectors() {
  fetch("/static/data/zone-sectors.txt")
    .then((res) => res.text())
    .then((text) => {
      zoneSectorMap = parseZoneSectors(text);
    })
    .catch((err) => {
      console.error("Zone sectors loading error:", err);
    });
}

function parseZoneSectors(text) {
  const map = {};

  text.split(/\r?\n/).forEach((line) => {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) return;

    const zone = String(Number(parts[0]));
    const sector = String(Number(parts[1]));
    const name = parts.slice(2).join(" ") || "";

    if (!map[zone]) map[zone] = {};
    map[zone][sector] = name;
  });

  return map;
}

function getSectorCountsForZone(zone) {
  const counts = {};

  tableData.forEach((row) => {
    const rowZone = String(Number(getZoneFromCadcode(row)));
    const sector = String(Number(getSectorFromCadcode(row)));

    if (rowZone === String(zone)) {
      counts[sector] = (counts[sector] || 0) + 1;
    }
  });

  return counts;
}

function renderSectorPanel(zone, zoneName) {
  let panel = document.getElementById("sector-panel");

  if (!panel) {
    panel = document.createElement("div");
    panel.id = "sector-panel";
    panel.className = "sector-panel";

    const mapContainer = document.getElementById("zone-map");
    mapContainer.insertAdjacentElement("afterend", panel);
  }

  const sectors = zoneSectorMap[String(zone)] || {};
  const sectorCounts = getSectorCountsForZone(zone);

  const sectorItems = Object.entries(sectors)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([sector, name]) => {
      const count = sectorCounts[sector] || 0;

      return `
        <div class="sector-card" data-zone="${zone}" data-sector="${sector}">
          <div class="sector-number">${sector}</div>
          <div class="sector-name">${name || "სექტორი"}</div>
          <div class="sector-count">ნაკვეთები: <strong>${count}</strong></div>
        </div>
      `;
    })
    .join("");

  panel.innerHTML = `
    <div class="sector-panel-header">
      <div>
        <h3>${zone} — ${zoneName}</h3>
        <p>სექტორების მიხედვით აზომილი ნაკვეთები</p>
      </div>
      <button type="button" class="sector-close" id="sector-close">×</button>
    </div>

    <div class="sector-grid">
      ${sectorItems || "<p>ამ ზონის სექტორები ვერ მოიძებნა</p>"}
    </div>
  `;

  document.getElementById("sector-close").addEventListener("click", () => {
    selectedZoneForSectors = null;
    panel.remove();
    document.querySelectorAll(".zone-tile.active-zone").forEach((el) => {
      el.classList.remove("active-zone");
    });
  });

  document.querySelectorAll(".sector-card").forEach((card) => {
    card.addEventListener("click", () => {
      document.getElementById("f-zone").value = card.dataset.zone;
      document.getElementById("f-sector").value = card.dataset.sector;
      saveFiltersToStorage();
      loadData(false);
    });
  });
}
const ZONE_NAMES_MAP = {
  1: "თბილისი", 2: "რუსთავი", 3: "ქუთაისი", 4: "ფოთი", 5: "ბათუმი",
  10: "გაგრა", 11: "გალი", 12: "გუდაუთა", 13: "გულრიფში", 14: "ოჩამჩირე",
  15: "ქალაქი სოხუმი", 16: "სოხუმი", 17: "ზემო აფხაზეთი",
  20: "ქობულეთი", 21: "ქედა", 22: "ხელვაჩაური", 23: "ხულო", 24: "შუახევი",
  26: "ოზურგეთი", 27: "ლანჩხუთი", 28: "ჩოხატაური", 29: "წყალტუბო",
  30: "ბაღდათი", 31: "ვანი", 32: "ზესტაფონი", 33: "თერჯოლა",
  34: "სამტრედია", 35: "საჩხერე", 36: "ხარაგაული", 37: "ხონი",
  38: "ჭიათურა", 39: "ტყიბული",
  40: "აბაშა", 41: "მარტვილი", 42: "მესტია", 43: "ზუგდიდი",
  44: "სენაკი", 45: "ხობი", 46: "ჩხოროწყუ", 47: "წალენჯიხა",
  50: "ახმეტა", 51: "გურჯაანი", 52: "დედოფლისწყარო", 53: "თელავი",
  54: "ლაგოდეხი", 55: "საგარეჯო", 56: "სიღნაღი", 57: "ყვარელი",
  60: "ასპინძა", 61: "ადიგენი", 62: "ახალციხე", 63: "ახალქალაქი",
  64: "ბორჯომი", 65: "ნინოწმინდა",
  66: "გორი", 67: "კასპი", 68: "ქარელი", 69: "ხაშური",
  70: "ახალგორი", 71: "დუშეთი", 72: "მცხეთა", 73: "თიანეთი", 74: "ყაზბეგი",
  80: "ბოლნისი", 81: "გარდაბანი", 82: "დმანისი", 83: "მარნეული",
  84: "თეთრიწყარო", 85: "წალკა",
  86: "ამბროლაური", 87: "ლენტეხი", 88: "ონი", 89: "ცაგერი",
  90: "ქურთა-ერედვი", 91: "ჯავა",
};

function renderZoneMap() {
  const mapContainer = document.getElementById("zone-map");
  if (!mapContainer) return;

  const zoneNames = {
    1: "თბილისი",
    2: "რუსთავი",
    3: "ქუთაისი",
    4: "ფოთი",
    5: "ბათუმი",

    10: "გაგრა",
    11: "გალი",
    12: "გუდაუთა",
    13: "გულრიფში",
    14: "ოჩამჩირე",
    15: "ქალაქი სოხუმი",
    16: "სოხუმი",
    17: "ზემო აფხაზეთი",

    20: "ქობულეთი",
    21: "ქედა",
    22: "ხელვაჩაური",
    23: "ხულო",
    24: "შუახევი",
    26: "ოზურგეთი",
    27: "ლანჩხუთი",
    28: "ჩოხატაური",
    29: "წყალტუბო",

    30: "ბაღდათი",
    31: "ვანი",
    32: "ზესტაფონი",
    33: "თერჯოლა",
    34: "სამტრედია",
    35: "საჩხერე",
    36: "ხარაგაული",
    37: "ხონი",
    38: "ჭიათურა",
    39: "ტყიბული",

    40: "აბაშა",
    41: "მარტვილი",
    42: "მესტია",
    43: "ზუგდიდი",
    44: "სენაკი",
    45: "ხობი",
    46: "ჩხოროწყუ",
    47: "წალენჯიხა",

    50: "ახმეტა",
    51: "გურჯაანი",
    52: "დედოფლისწყარო",
    53: "თელავი",
    54: "ლაგოდეხი",
    55: "საგარეჯო",
    56: "სიღნაღი",
    57: "ყვარელი",

    60: "ასპინძა",
    61: "ადიგენი",
    62: "ახალციხე",
    63: "ახალქალაქი",
    64: "ბორჯომი",
    65: "ნინოწმინდა",

    66: "გორი",
    67: "კასპი",
    68: "ქარელი",
    69: "ხაშური",

    70: "ახალგორი",
    71: "დუშეთი",
    72: "მცხეთა",
    73: "თიანეთი",
    74: "ყაზბეგი",

    80: "ბოლნისი",
    81: "გარდაბანი",
    82: "დმანისი",
    83: "მარნეული",
    84: "თეთრიწყარო",
    85: "წალკა",

    86: "ამბროლაური",
    87: "ლენტეხი",
    88: "ონი",
    89: "ცაგერი",

    90: "ქურთა-ერედვი",
    91: "ჯავა",
  };

  const zoneOrder = [
    "1",
    "2",
    "3",
    "4",
    "5",

    "10",
    "11",
    "12",
    "13",
    "14",
    "15",
    "16",
    "17",

    "20",
    "21",
    "22",
    "23",
    "24",
    "26",
    "27",
    "28",
    "29",

    "30",
    "31",
    "32",
    "33",
    "34",
    "35",
    "36",
    "37",
    "38",
    "39",

    "40",
    "41",
    "42",
    "43",
    "44",
    "45",
    "46",
    "47",

    "50",
    "51",
    "52",
    "53",
    "54",
    "55",
    "56",
    "57",

    "60",
    "61",
    "62",
    "63",
    "64",
    "65",

    "66",
    "67",
    "68",
    "69",

    "70",
    "71",
    "72",
    "73",
    "74",

    "80",
    "81",
    "82",
    "83",
    "84",
    "85",

    "86",
    "87",
    "88",
    "89",

    "90",
    "91",
  ];

  const counts = {};

  tableData.forEach((row) => {
    let zone = String(row.ZONE || "").trim();

    if (!zone || zone === "0") {
      zone = getZoneFromCadcode(row);
    }

    zone = String(Number(zone));

    if (!zone || zone === "NaN") return;

    counts[zone] = (counts[zone] || 0) + 1;
  });

  const maxCount = Math.max(...Object.values(counts), 1);

  const zonesToRender = showOnlyActiveZones
    ? zoneOrder.filter((zone) => Number(counts[String(Number(zone))] || 0) > 0)
    : zoneOrder;

  mapContainer.innerHTML = "";

  if (zonesToRender.length === 0) {
    mapContainer.innerHTML = `
    <div class="empty-state" style="grid-column: 1 / -1; padding: 30px;">
      აქტიური ზონები ვერ მოიძებნა.
    </div>
  `;
    return;
  }

  zonesToRender.forEach((zone) => {
    const normalizedZone = String(Number(zone));
    const count = counts[normalizedZone] || 0;
    const name = zoneNames[zone] || "ზონა";

    let intensityClass = "zone-empty";

    if (count > 0) {
      const ratio = count / maxCount;

      if (ratio >= 0.65) intensityClass = "zone-hot";
      else if (ratio >= 0.3) intensityClass = "zone-medium";
      else intensityClass = "zone-low";
    }

    const tile = document.createElement("div");
    tile.className = `zone-tile ${intensityClass}`;

    tile.title = `${name}\nზონა: ${zone}\nნაკვეთები: ${count}`;

    tile.innerHTML = `
      <div class="zone-number">${zone}</div>
      <div class="zone-name">${name}</div>
      <div class="zone-count">ნაკვეთები: <strong>${count}</strong></div>
    `;

    mapContainer.appendChild(tile);

    tile.addEventListener("click", () => {
      selectedZoneForSectors = zone;

      document.querySelectorAll(".zone-tile.active-zone").forEach((el) => {
        el.classList.remove("active-zone");
      });

      tile.classList.add("active-zone");

      renderSectorPanel(zone, name);

      setTimeout(() => {
        const sectorPanel = document.getElementById("sector-panel");

        if (sectorPanel) {
          sectorPanel.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }
      }, 100);
    });
  });
}

let liveZoneMapInstance = null;
let liveZoneGeoJsonLayer = null;
let liveMapTileLayer  = null;
let isSatelliteMode   = false;

const TILE_URLS = {
  light:     "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
  dark:      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
};
let cachedGeoJson = null;
let cachedPreparedGeoJson = null;

function getMapCountsFromTableData() {
  const zoneCounts = {};
  const sectorCounts = {};

  tableData.forEach((row) => {
    const zone = getZoneFromCadcode(row);
    const sector = getSectorFromCadcode(row);

    zoneCounts[zone] = (zoneCounts[zone] || 0) + 1;

    const sectorKey = `${zone}.${sector}`;
    sectorCounts[sectorKey] = (sectorCounts[sectorKey] || 0) + 1;
  });

  return { zoneCounts, sectorCounts };
}

function getZoneColorGradient(count, maxCount) {
  if (!count) return "#cbd5e1";
  const ratio = count / maxCount;
  if (ratio >= 0.85) return "#7f0000";
  if (ratio >= 0.65) return "#ef4444";
  if (ratio >= 0.45) return "#f97316";
  if (ratio >= 0.30) return "#f59e0b";
  if (ratio >= 0.15) return "#3b82f6";
  return "#93c5fd";
}
function reprojectGeoJsonCoords(coords) {
  if (
    Array.isArray(coords) &&
    coords.length >= 2 &&
    typeof coords[0] === "number" &&
    typeof coords[1] === "number"
  ) {
    if (Math.abs(coords[0]) > 180 || Math.abs(coords[1]) > 90) {
      return proj4("EPSG:32638", "WGS84", coords);
    }

    return coords;
  }

  return coords.map(reprojectGeoJsonCoords);
}

function reprojectGeoJson(geojson) {
  return {
    ...geojson,
    features: geojson.features.map((feature) => ({
      ...feature,
      geometry: {
        ...feature.geometry,
        coordinates: reprojectGeoJsonCoords(feature.geometry.coordinates),
      },
    })),
  };
}
function showMapLoading(show) {
  const overlay = document.getElementById("map-loading-overlay");
  if (!overlay) return;
  overlay.style.display = show ? "flex" : "none";
}

function updateMapTileLayer() {
  if (!liveZoneMapInstance || !liveMapTileLayer) return;
  if (isSatelliteMode) {
    liveMapTileLayer.setUrl(TILE_URLS.satellite);
  } else {
    const isDark = document.body.classList.contains("theme-dark");
    liveMapTileLayer.setUrl(isDark ? TILE_URLS.dark : TILE_URLS.light);
  }
}

function toggleSatellite() {
  isSatelliteMode = !isSatelliteMode;
  updateMapTileLayer();
  const btn = document.getElementById("sat-toggle-btn");
  if (btn) {
    btn.textContent  = isSatelliteMode ? "🗺 რუკა" : "🛰 სატელიტი";
    btn.classList.toggle("active", isSatelliteMode);
  }
}

function applyZoneFilterFromMap(zone) {
  document.getElementById("f-zone").value = zone;
  saveFiltersToStorage();
  switchView("data");
  saveActiveTab();
  loadData(false);
}

function showMapInfoPanel(zone, secCountsForZone) {
  const panel = document.getElementById("map-info-panel");
  if (!panel) return;

  const zoneName = ZONE_NAMES_MAP[Number(zone)] || "";
  const totalCount = Object.values(secCountsForZone).reduce((a, b) => a + b, 0);
  const sorted = Object.entries(secCountsForZone).sort((a, b) => b[1] - a[1]);
  const maxSec = sorted.length ? sorted[0][1] : 1;

  const sectorRows = sorted.slice(0, 8).map(([sec, cnt]) => {
    const pct = Math.round((cnt / maxSec) * 100);
    return `<div class="map-panel-sector-row">
      <span>სექტ. ${escHtml(sec)}</span>
      <div style="flex:1;margin:0 8px;height:4px;border-radius:2px;background:var(--border);">
        <div class="map-panel-bar" style="width:${pct}%;height:4px;"></div>
      </div>
      <strong>${cnt}</strong>
    </div>`;
  }).join("");

  panel.innerHTML = `
    <div class="map-panel-header">
      <div>
        <div class="map-panel-zone-num">ზონა ${escHtml(zone)}</div>
        <div class="map-panel-zone-name">${escHtml(zoneName)}</div>
      </div>
      <button class="map-panel-close" id="map-panel-close-btn">✕</button>
    </div>
    <div class="map-panel-stat-label">სულ ნაკვეთი</div>
    <div class="map-panel-stat-value">${totalCount}</div>
    <div class="map-panel-divider"></div>
    <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--muted);margin-bottom:6px;">სექტორები (TOP 8)</div>
    ${sectorRows || '<div style="padding:4px 0;opacity:0.6;font-size:0.8rem;">სექტორები ვერ მოიძებნა</div>'}
    <div class="map-panel-divider"></div>
    <button class="map-panel-btn" id="map-panel-filter-btn">ამ ზონის ფილტრი</button>
  `;

  panel.classList.remove("hidden");

  document.getElementById("map-panel-close-btn").addEventListener("click", () => {
    panel.classList.add("hidden");
  });

  document.getElementById("map-panel-filter-btn").addEventListener("click", () => {
    applyZoneFilterFromMap(zone);
  });
}

function renderLiveZoneMap() {
  const mapEl = document.getElementById("live-zone-map");
  if (!mapEl) return;

  const { zoneCounts, sectorCounts } = getMapCountsFromTableData();
  const maxCount = Math.max(...Object.values(zoneCounts), 1);
  const isDark = document.body.classList.contains("theme-dark");

  showMapLoading(true);


  if (!liveZoneMapInstance) {
    liveZoneMapInstance = L.map("live-zone-map", {
      zoomControl: false,
      attributionControl: false,
    }).setView([42.1, 43.7], 8);

    L.control.zoom({ position: "bottomright" }).addTo(liveZoneMapInstance);

    const ResetControl = L.Control.extend({
      options: { position: "bottomright" },
      onAdd() {
        const btn = L.DomUtil.create("button", "map-reset-control");
        btn.innerHTML = "⊞ სრული ხედი";
        btn.title = "ფარგლების გადაყენება";
        L.DomEvent.on(btn, "click", (e) => {
          L.DomEvent.stopPropagation(e);
          if (liveZoneGeoJsonLayer) {
            const b = liveZoneGeoJsonLayer.getBounds();
            if (b.isValid()) {
              const offset = document.fullscreenElement ? 0 : 1;
              const z = liveZoneMapInstance.getBoundsZoom(b, false, L.point(5, 5)) + offset;
              liveZoneMapInstance.setView(b.getCenter(), z);
            }
          }
        });
        return btn;
      },
    });
    new ResetControl().addTo(liveZoneMapInstance);

    const SatControl = L.Control.extend({
      options: { position: "bottomright" },
      onAdd() {
        const btn = L.DomUtil.create("button", "map-sat-control");
        btn.id        = "sat-toggle-btn";
        btn.innerHTML = "🛰 სატელიტი";
        btn.title     = "ორთოგრაფიული / ჩვეულებრივი რუკა";
        L.DomEvent.on(btn, "click", (e) => { L.DomEvent.stopPropagation(e); toggleSatellite(); });
        return btn;
      },
    });
    new SatControl().addTo(liveZoneMapInstance);

    // Fullscreen control
    const FullscreenControl = L.Control.extend({
      options: { position: "topright" },
      onAdd() {
        const btn = L.DomUtil.create("button", "map-fs-control");
        btn.id    = "fs-toggle-btn";
        btn.title = "სრული ეკრანი";
        btn.innerHTML = "⛶";
        L.DomEvent.on(btn, "click", (e) => {
          L.DomEvent.stopPropagation(e);
          const container = liveZoneMapInstance.getContainer();
          if (!document.fullscreenElement) {
            container.requestFullscreen().catch(() => {});
            btn.innerHTML = "✕";
            btn.title = "სრული ეკრანიდან გასვლა";
          } else {
            document.exitFullscreen();
            btn.innerHTML = "⛶";
            btn.title = "სრული ეკრანი";
          }
        });
        document.addEventListener("fullscreenchange", () => {
          if (!document.fullscreenElement) {
            btn.innerHTML = "⛶";
            btn.title = "სრული ეკრანი";
            setTimeout(() => liveZoneMapInstance.invalidateSize(), 100);
          }
        });
        return btn;
      },
    });
    new FullscreenControl().addTo(liveZoneMapInstance);

    liveMapTileLayer = L.tileLayer(TILE_URLS.light, { maxZoom: 20 }).addTo(liveZoneMapInstance);

  } else {
    updateMapTileLayer();
  }

  if (liveZoneGeoJsonLayer) {
    liveZoneMapInstance.removeLayer(liveZoneGeoJsonLayer);
    liveZoneGeoJsonLayer = null;
  }

  const geoJsonPromise = cachedPreparedGeoJson
    ? Promise.resolve(cachedPreparedGeoJson)
    : fetch("/static/data/fgsector.geojson")
        .then((res) => res.json())
        .then((geojson) => {
          cachedGeoJson = geojson;
          cachedPreparedGeoJson = reprojectGeoJson(geojson);
          return cachedPreparedGeoJson;
        });

  geoJsonPromise
    .then((preparedGeojson) => {
      liveZoneGeoJsonLayer = L.geoJSON(preparedGeojson, {
        style(feature) {
          const zone = String(feature.properties.ZONE_ID || "").trim();
          const count = zoneCounts[zone] || 0;
          return {
            color: isDark ? "#475569" : "#1e40af",
            weight: count > 0 ? 1.5 : 0.5,
            fillColor: getZoneColorGradient(count, maxCount),
            fillOpacity: count > 0 ? 0.72 : 0.12,
          };
        },

        onEachFeature(feature, layer) {
          const zone = String(feature.properties.ZONE_ID || "").trim();
          const sector = String(feature.properties.SECTOR_ID || "").trim();
          const sectorName = feature.properties.SECTOR_NAM || "";
          const sectorKey = `${zone}.${sector}`;
          const zoneName = ZONE_NAMES_MAP[Number(zone)] || "";

          function buildTip(zc, sc) {
            return `<div class="zt-title">ზონა ${zone}${zoneName ? ` — ${zoneName}` : ""}</div>
             <div class="zt-sub">სექტ. ${sector}${sectorName ? ` · ${sectorName}` : ""}</div>
             <div class="zt-row"><span>სექტ. ნაკვეთი:</span><strong>${sc}</strong></div>
             <div class="zt-row"><span>ზონა სულ:</span><strong>${zc}</strong></div>`;
          }

          layer._zone = zone;
          layer._sectorKey = sectorKey;
          layer._tipHtml = buildTip(zoneCounts[zone] || 0, sectorCounts[sectorKey] || 0);
          layer._buildTip = buildTip;

          layer.on("mouseover", function (e) {
            if (!_zoneTooltip) {
              _zoneTooltip = L.tooltip({ direction: "top", className: "zone-tooltip", opacity: 1 });
            }
            _zoneTooltip.setContent(layer._tipHtml).setLatLng(e.latlng);
            if (!liveZoneMapInstance.hasLayer(_zoneTooltip)) _zoneTooltip.addTo(liveZoneMapInstance);
            layer.setStyle({ weight: 2.5, color: "#f59e0b", fillOpacity: 0.82 });
            layer.bringToFront();
          });

          layer.on("mousemove", function (e) {
            if (_zoneTooltip) _zoneTooltip.setLatLng(e.latlng);
          });

          layer.on("mouseout", function () {
            if (_zoneTooltip && liveZoneMapInstance.hasLayer(_zoneTooltip)) {
              liveZoneMapInstance.removeLayer(_zoneTooltip);
            }
            liveZoneGeoJsonLayer.resetStyle(layer);
          });

          layer.on("click", function (e) {
            L.DomEvent.stopPropagation(e);
            const secCountsForZone = {};
            Object.entries(sectorCounts).forEach(([key, cnt]) => {
              const [z, s] = key.split(".");
              if (z === zone) secCountsForZone[s] = cnt;
            });
            showMapInfoPanel(zone, secCountsForZone);
          });
        },
      }).addTo(liveZoneMapInstance);

      // Hide zone tooltip when mouse leaves the map
      liveZoneMapInstance.on("mouseout", () => {
        if (_zoneTooltip && liveZoneMapInstance.hasLayer(_zoneTooltip)) {
          liveZoneMapInstance.removeLayer(_zoneTooltip);
        }
      });

      const bounds = liveZoneGeoJsonLayer.getBounds();
      if (bounds.isValid()) {
        const z = liveZoneMapInstance.getBoundsZoom(bounds, false, L.point(5, 5)) + 1;
        liveZoneMapInstance.setView(bounds.getCenter(), z);
      }

      if (weatherActive) loadWeatherData(false);

      setTimeout(() => {
        liveZoneMapInstance.invalidateSize();
        showMapLoading(false);
      }, 250);
    })
    .catch((err) => {
      console.error("GeoJSON loading error:", err);
      showMapLoading(false);
    });
}

function refreshLiveMapStyles() {
  if (!liveZoneGeoJsonLayer) return;
  if (weatherActive) { applyWeatherStyles(); return; }
  const { zoneCounts, sectorCounts } = getMapCountsFromTableData();
  const maxCount = Math.max(...Object.values(zoneCounts), 1);
  const isDark = document.body.classList.contains("theme-dark");

  liveZoneGeoJsonLayer.eachLayer((layer) => {
    const zone = layer._zone;
    const sectorKey = layer._sectorKey;
    if (!zone) return;
    const count = zoneCounts[zone] || 0;
    layer.setStyle({
      color: isDark ? "#475569" : "#1e40af",
      weight: count > 0 ? 1.5 : 0.5,
      fillColor: getZoneColorGradient(count, maxCount),
      fillOpacity: count > 0 ? 0.72 : 0.12,
    });
    if (layer._buildTip) {
      layer._tipHtml = layer._buildTip(zoneCounts[zone] || 0, sectorCounts[sectorKey] || 0);
    }
  });
}

function updateCharts() {
  const groupBy = (keyFn) => {
    const counts = {};

    tableData.forEach((d) => {
      const k = keyFn(d);
      counts[k] = (counts[k] || 0) + 1;
    });

    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  };

  const daysCount = getSelectedDaysCount();

  const managerSelected = document.getElementById("manager-selected");
  const selectedManagerPrefix = managerSelected
    ? managerSelected.dataset.value || ""
    : "";

  let tagData;

  if (!selectedManagerPrefix) {
    const managerCounts = {};

    MANAGER_PREFIXES.forEach((prefix) => {
      managerCounts[prefix] = 0;
    });

    tableData.forEach((d) => {
      const matchedPrefix = getManagerPrefixFromTag(d.TAG);

      if (matchedPrefix) {
        managerCounts[matchedPrefix]++;
      }
    });

    tagData = Object.entries(managerCounts).sort((a, b) => b[1] - a[1]);
  } else {
    tagData = groupBy((d) => cleanTagName(d.TAG)).slice(0, 15);
  }

  const averageValues = tagData.map((x) =>
    Number((x[1] / daysCount).toFixed(1)),
  );

  const remainingValues = tagData.map((x, index) =>
    Number((x[1] - averageValues[index]).toFixed(1)),
  );

  createChart(
    "chartTag",
    "bar",
    {
      labels: tagData.map((x) => x[0]),
      datasets: [
        {
          label: "დღიური საშუალო",
          data: averageValues,
          backgroundColor: averageValues.map((avg) =>
            avg < 10 ? "#ef4444" : "#22c55e",
          ),
          borderRadius: 4,
        },
        {
          label: "სულ რაოდენობა",
          data: remainingValues,
          backgroundColor: "#1e40af",
          borderRadius: 4,
        },
      ],
    },
    {
      managerNames: !selectedManagerPrefix ? MANAGER_NAMES : null,
      onClick: !selectedManagerPrefix
        ? (_event, elements) => {
            if (!elements.length) return;
            const prefix = tagData[elements[0].index][0];
            const el = document.getElementById("manager-selected");
            if (!el) return;
            el.dataset.value = prefix;
            el.textContent = (MANAGER_NAMES[Number(prefix)] || prefix) + " ▼";
            saveFiltersToStorage();
            switchView("data");
            saveActiveTab();
            loadData(false);
          }
        : undefined,
    },
  );

  const zoneData = groupBy((d) => d.ZONE || "N/A");

  const totalCount = tableData.length;
  const totalDailyAverage =
    daysCount > 0 ? Number((totalCount / daysCount).toFixed(1)) : 0;

  const ZONE_COLORS = [
    "#3b82f6","#ef4444","#10b981","#f59e0b","#8b5cf6","#6366f1",
    "#ec4899","#14b8a6","#f97316","#84cc16","#06b6d4","#a855f7",
    "#e11d48","#0ea5e9","#d97706","#16a34a","#7c3aed","#db2777",
  ];

  createChart(
    "chartZone",
    "doughnut",
    {
      labels: zoneData.map((x) => x[0]),
      datasets: [
        {
          data: zoneData.map((x) => x[1]),
          backgroundColor: zoneData.map((_, i) => ZONE_COLORS[i % ZONE_COLORS.length]),
        },
      ],
    },
    {
      centerText: totalDailyAverage,
      centerTooltip: "საერთო დღიური საშუალო",
      hideLegend: true,
      onClick: (_event, elements) => {
        if (!elements.length) return;
        const zone = zoneData[elements[0].index][0];
        document.getElementById("f-zone").value = zone;
        saveFiltersToStorage();
        switchView("data");
        saveActiveTab();
        loadData(false);
      },
    },
  );

  const zoneLegendEl = document.getElementById("chartZone-legend");
  if (zoneLegendEl) {
    zoneLegendEl.innerHTML = zoneData.map((x, i) => `
      <div class="zl-item">
        <span class="zl-dot" style="background:${ZONE_COLORS[i % ZONE_COLORS.length]}"></span>
        <span class="zl-label">${escHtml(x[0])}</span>
        <span class="zl-count">${x[1]}</span>
      </div>`).join("");
  }

  const dateCounts = {};

  tableData.forEach((d) => {
    const date = d.DATE_ ? d.DATE_.split("T")[0].split(" ")[0] : "N/A";
    dateCounts[date] = (dateCounts[date] || 0) + 1;
  });

  const sortedDates = Object.keys(dateCounts).sort();

  createChart("chartDate", "line", {
    labels: sortedDates,
    datasets: [
      {
        label: "შესრულებული სამუშაო",
        data: sortedDates.map((d) => dateCounts[d]),
        borderColor: "#10b981",
        backgroundColor: "rgba(16, 185, 129, 0.1)",
        fill: true,
        tension: 0.3,
      },
    ],
  });

  const catData = groupBy((d) => getCategoryGroup(d));

  createChart("chartCat", "pie", {
    labels: catData.map((x) => x[0]),
    datasets: [
      {
        data: catData.map((x) => x[1]),
        backgroundColor: ["#8b5cf6", "#f59e0b"],
      },
    ],
  });
}

// Single shared zone tooltip (prevents duplicates on adjacent sectors)
let _zoneTooltip = null;


function createChart(canvasId, type, dataConfig, extraOptions = {}) {
  const ctx = document.getElementById(canvasId).getContext("2d");

  if (chartInstances[canvasId]) {
    chartInstances[canvasId].destroy();
  }

  const isDark = document.body.classList.contains("theme-dark");
  const textColor = isDark ? "#e5e5e5" : "#171717";
  const gridColor = isDark ? "#333333" : "#e2e8f0";

  Chart.defaults.color = textColor;
  Chart.defaults.borderColor = gridColor;

  const centerTextPlugin = {
    id: "centerTextPlugin",

    afterDraw(chart) {
      if (!extraOptions.centerText && extraOptions.centerText !== 0) return;

      const { ctx, chartArea } = chart;
      const centerX = (chartArea.left + chartArea.right) / 2;
      const centerY = (chartArea.top + chartArea.bottom) / 2;

      ctx.save();

      ctx.font = "bold 28px Arial";
      ctx.fillStyle = textColor;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(extraOptions.centerText, centerX, centerY - 8);

      ctx.font = "12px Arial";
      ctx.fillStyle = isDark ? "#cbd5e1" : "#64748b";
      ctx.fillText("დღიური საშუალო", centerX, centerY + 22);

      ctx.restore();
    },
  };

  chartInstances[canvasId] = new Chart(ctx, {
    type: type,
    data: dataConfig,
    plugins: [centerTextPlugin],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: extraOptions.onClick || undefined,
      onHover: extraOptions.onClick
        ? (evt, active) => { if (evt.native) evt.native.target.style.cursor = active.length ? "pointer" : "default"; }
        : undefined,

      plugins: {
        legend: {
          display: type !== "bar" && !extraOptions.hideLegend,
          labels: { color: textColor },
        },

        tooltip: {
          mode: "nearest",
          intersect: true,
          displayColors: true,

          callbacks: {
            label: function (context) {
              if (canvasId === "chartZone") {
                return `${context.raw}`;
              }

              if (canvasId === "chartTag") {
                const label = context.label;
                const managerName =
                  extraOptions.managerNames && extraOptions.managerNames[label]
                    ? extraOptions.managerNames[label]
                    : null;

                let value = context.raw;

                if (context.dataset.label === "სულ რაოდენობა") {
                  const avg =
                    context.chart.data.datasets[0].data[context.dataIndex] || 0;
                  value = Number((context.raw + avg).toFixed(1));
                }

                if (managerName) {
                  return `${managerName} — ${context.dataset.label}: ${value}`;
                }

                return `${context.dataset.label}: ${value}`;
              }

              return `${context.label}: ${context.raw}`;
            },
          },
        },
      },

      scales:
        type === "bar" || type === "line"
          ? {
              x: {
                stacked: type === "bar",
                grid: { display: false },
                ticks: { color: textColor },
              },

              y: {
                stacked: type === "bar",
                beginAtZero: true,
                grid: { color: gridColor },
                ticks: { color: textColor },
              },
            }
          : {},
    },
  });
}

function renderPivotTable() {
  const thead = document.querySelector("#report-tbl thead");
  const tbody = document.querySelector("#report-tbl tbody");

  tbody.innerHTML = "";
  thead.innerHTML = "";

  const pivotData = {};
  const allDates = new Set();

  tableData.forEach((row) => {
    const tag = cleanTagName(row.TAG);
    const dateRaw = row.DATE_
      ? row.DATE_.split("T")[0].split(" ")[0]
      : "უცნობი";
    const category = getCategoryGroup(row);

    allDates.add(dateRaw);

    if (!pivotData[tag]) {
      pivotData[tag] = {
        grandTotal: 0,
        sakarmidamo: {},
        savarguli: {},
      };
    }

    pivotData[tag].grandTotal++;

    if (category === "საკარმიდამო") {
      if (!pivotData[tag].sakarmidamo[dateRaw]) {
        pivotData[tag].sakarmidamo[dateRaw] = 0;
      }

      pivotData[tag].sakarmidamo[dateRaw]++;
    } else {
      if (!pivotData[tag].savarguli[dateRaw]) {
        pivotData[tag].savarguli[dateRaw] = 0;
      }

      pivotData[tag].savarguli[dateRaw]++;
    }
  });

  const sortedDates = Array.from(allDates).sort();
  const isDark = document.body.classList.contains("theme-dark");

  let headerHTML = `<tr>
    <th style="width: 110px; text-align: center;">ჯამურად</th>
    <th style="width: 100px; text-align: center;">TAG</th>
    <th style="width: 120px;">კატეგორია</th>`;

  sortedDates.forEach((d) => {
    const parts = d.split("-");
    let shortDate = d;

    if (parts.length === 3) {
      shortDate = `${parts[2]}.${parts[1]}`;
    }

    headerHTML += `<th>${shortDate}</th>`;
  });

  headerHTML += "</tr>";
  thead.innerHTML = headerHTML;

  Object.keys(pivotData)
    .sort()
    .forEach((tag) => {
      const data = pivotData[tag];

      let sakBg = isDark ? "#4c1d95" : "#e9d5ff";
      let normBg = isDark ? "#1e1e1e" : "#ffffff";
      let mainBg = isDark ? "#1e1e1e" : "#ffffff";
      let textCol = isDark ? "#e5e5e5" : "#000";

      const trSak = document.createElement("tr");

      trSak.innerHTML += `<td rowspan="2" style="font-weight: 800; font-size: 1.1rem; text-align: center; background: ${mainBg}; color: ${textCol}; vertical-align: middle;">${data.grandTotal}</td>`;

      trSak.innerHTML += `<td rowspan="2" style="font-weight: bold; text-align: center; background: ${mainBg}; color: ${textCol}; vertical-align: middle;">${tag}</td>`;

      trSak.innerHTML += `<td style="background: ${sakBg}; color: ${textCol}; font-weight: 500;">საკარმიდამო</td>`;

      sortedDates.forEach((date) => {
        const val = data.sakarmidamo[date] || 0;

        const cellStyle = `text-align: center; background: ${sakBg}; color: ${textCol}; ${
          val ? "font-weight: bold;" : "opacity: 0.5;"
        }`;

        trSak.innerHTML += `<td style="${cellStyle}">${val || "-"}</td>`;
      });

      const trSav = document.createElement("tr");

      trSav.innerHTML += `<td style="background: ${normBg}; color: ${textCol}; font-weight: 500;">სავარგული</td>`;

      sortedDates.forEach((date) => {
        const val = data.savarguli[date] || 0;

        const cellStyle = `text-align: center; background: ${normBg}; color: ${textCol}; ${
          val ? "font-weight: bold;" : "opacity: 0.5;"
        }`;

        trSav.innerHTML += `<td style="${cellStyle}">${val || "-"}</td>`;
      });

      tbody.appendChild(trSak);
      tbody.appendChild(trSav);
    });
}

function loadData(forceRefresh = false) {
  if (_isLoading) return;

  const z = document.getElementById("f-zone").value.trim();
  const s = document.getElementById("f-sector").value.trim();
  const df = document.getElementById("f-from").value;
  let dt = document.getElementById("f-to").value;

  const azVals = [
    ...document.querySelectorAll(
      ".az-menu label:not(.select-all-label) .az-opt:checked",
    ),
  ].map((c) => c.value);

  const qs = new URLSearchParams();

  const managerPrefix = document.getElementById("manager-selected")?.dataset.value || "";

  if (z) qs.set("zone", splitMulti(z).join(" "));
  if (s) qs.set("sector", splitMulti(s).join(" "));
  if (df && !dt) dt = df;
  if (df) qs.set("date_from", df);
  if (dt) qs.set("date_to", dt);
  if (azVals.length) qs.set("azomvis", azVals.join(" "));
  if (managerPrefix) qs.set("manager", managerPrefix);
  if (forceRefresh) qs.set("refresh", "1");

  setStatus("");
  _isLoading = true;
  setLoading(true);
  if (currentView === "data") showTableSkeleton();
  currentPage = 1;
  searchQuery = "";
  const searchEl = document.getElementById("table-search");
  if (searchEl) searchEl.value = "";

  (async () => {
    try {
      const res = await fetch("/api/data?" + qs.toString());

      if (!res.ok) {
        throw new Error(`სერვერის შეცდომა: ${res.status}`);
      }

      const data = await res.json();

      if (data.ok === false) {
        throw new Error(data.error || "მონაცემები ვერ მოიძებნა");
      }

      tableData = data.items || [];

      const exportCountEl = document.getElementById("report-export-count");
      if (exportCountEl) exportCountEl.textContent = `სულ ${tableData.length} ჩანაწერი`;

      if (currentView === "data") {
        if (sortState.key) doSort(sortState.key, sortState.asc);
        setTimeout(() => { renderTable(); renderActiveFilters(); }, 0);
      } else {
        setTimeout(() => { renderReport(); renderActiveFilters(); }, 0);
      }

      setStatus(`მიღებულია: ${tableData.length} ჩანაწერი`);
      showToast(`${tableData.length} ჩანაწერი ჩაიტვირთა`, "success");
      updateActiveFilterButton();
    } catch (error) {
      setStatus(`შეცდომა: ${error.message}`);
      showToast(error.message, "error");
    } finally {
      _isLoading = false;
      setLoading(false);
    }
  })();
}

function getFilteredTableData() {
  if (!searchQuery) return tableData;
  const q = searchQuery.toLowerCase();
  return tableData.filter(
    (row) =>
      String(row.TAG || "").toLowerCase().includes(q) ||
      String(row.CADCODE || "").toLowerCase().includes(q)
  );
}

function renderTable() {
  const tbody = document.querySelector("#tbl tbody");
  if (!tbody) return;

  activeMaps = {};
  tbody.innerHTML = "";

  const filtered = getFilteredTableData();
  const totalFiltered = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));

  if (currentPage > totalPages) currentPage = totalPages;

  const countEl = document.getElementById("table-count");
  if (countEl) {
    if (searchQuery) {
      countEl.textContent = `${totalFiltered} / ${tableData.length} ჩანაწერი`;
    } else {
      countEl.textContent = `სულ: ${tableData.length} ჩანაწერი`;
    }
  }

  if (totalFiltered === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="empty-state">ჩანაწერი ვერ მოიძებნა.</td></tr>`;
    renderPagination(0, 0);
    return;
  }

  const start = (currentPage - 1) * PAGE_SIZE;
  const pageData = filtered.slice(start, start + PAGE_SIZE);

  const colCount = 9;
  pageData.forEach((row, relIdx) => {
    const i = start + relIdx;
    const mapId = `map-${i}`;
    const expId = `exp-${i}`;

    const geomText = row.wkt_geom
      ? JSON.stringify(row.wkt_geom)
      : '{"type": "Point", "coordinates": [44.78, 41.72]}';

    const tr = document.createElement("tr");
    const cells = [
      escHtml(row.TAG),
      escHtml(row.CADCODE),
      escHtml(row.DATE_),
      escHtml(row.ZONE),
      escHtml(row.SECTOR),
      escHtml(row.FUNCTION_LABEL || row.FUNCTION),
      escHtml(row.CATEGORY_LABEL || row.CATEGORY),
      escHtml(row.AZOMVIS_TIPI_LABEL || row.AZOMVIS_TIPI),
    ];

    cells.forEach((val, colIdx) => {
      const td = document.createElement("td");
      td.textContent = val;
      if (hiddenCols.has(colIdx)) td.style.display = "none";
      tr.appendChild(td);
    });

    const tdBtn = document.createElement("td");
    tdBtn.className = "td-actions";
    const drawBtn = document.createElement("button");
    drawBtn.className = "btn blue btn-draw";
    drawBtn.dataset.i = i;
    drawBtn.textContent = "ნახაზი";
    tdBtn.appendChild(drawBtn);

    if (row.CADCODE) {
      const oqmiUrl = `https://api.napr.gov.ge/lr/redi?pid=101&FRAME_NAME=REDI.APP.PAGE&FRAME=MAIN.FORM.REDI&FLD_PAPER_ID=&REGNUMBER=&CADCODE=${encodeURIComponent(String(row.CADCODE).trim())}&WEB_NUMBER=&OWNER_IDN=&PRSN_IDN=&TAG=&PERPAGE=10&DATE1=&DATE2=&REGION=&ZONE=&SECTOR=&GL_FLD_SURVEY_ID=&CREATOR=&CALL_STATUS=&SURVEY_TYPE=&STATUS=&FLAG=&finishPAPER=find#`;
      const oqmiBtn = document.createElement("a");
      oqmiBtn.className = "btn oqmi-btn";
      oqmiBtn.href = oqmiUrl;
      oqmiBtn.target = "_blank";
      oqmiBtn.rel = "noopener noreferrer";
      oqmiBtn.textContent = "ოქმი";
      tdBtn.appendChild(oqmiBtn);
    }

    tr.appendChild(tdBtn);

    const trExp = document.createElement("tr");
    trExp.className = "expander-row";
    trExp.id = expId;
    trExp.innerHTML = `<td colspan="${colCount}"><div class="mini-detail"><div id="${mapId}" class="mini-map"></div><textarea class="geom-text" readonly>${geomText}</textarea></div></td>`;

    drawBtn.addEventListener("click", () => {
      const exp = document.getElementById(expId);
      const isOpen = exp.style.display === "table-row";
      drawBtn.classList.toggle("active", !isOpen);

      if (isOpen) {
        exp.style.display = "none";
        if (activeMaps[mapId]) { activeMaps[mapId].remove(); delete activeMaps[mapId]; }
      } else {
        exp.style.display = "table-row";
        initMiniMap(i, geomText);
        setTimeout(() => { if (activeMaps[mapId]) activeMaps[mapId].invalidateSize(); }, 150);
      }
    });

    tbody.appendChild(tr);
    tbody.appendChild(trExp);
  });

  renderPagination(totalFiltered, totalPages);
  applyColumnVisibility();
}

function renderPagination(total, totalPages) {
  const pg = document.getElementById("pagination");
  if (!pg) return;

  if (totalPages <= 1) { pg.style.display = "none"; return; }

  pg.style.display = "flex";
  pg.innerHTML = "";

  const addBtn = (label, page, disabled = false, active = false) => {
    const btn = document.createElement("button");
    btn.className = "page-btn" + (active ? " active" : "");
    btn.textContent = label;
    btn.disabled = disabled;
    btn.addEventListener("click", () => {
      currentPage = page;
      Object.values(activeMaps).forEach((m) => m.remove());
      activeMaps = {};
      renderTable();
    });
    pg.appendChild(btn);
  };

  addBtn("«", 1, currentPage === 1);
  addBtn("‹", currentPage - 1, currentPage === 1);

  const range = 2;
  for (let p = Math.max(1, currentPage - range); p <= Math.min(totalPages, currentPage + range); p++) {
    addBtn(p, p, false, p === currentPage);
  }

  addBtn("›", currentPage + 1, currentPage === totalPages);
  addBtn("»", totalPages, currentPage === totalPages);

  const info = document.createElement("span");
  info.className = "page-info";
  const start = (currentPage - 1) * PAGE_SIZE + 1;
  const end = Math.min(currentPage * PAGE_SIZE, total);
  info.textContent = `${start}–${end} / ${total}`;
  pg.appendChild(info);
}

function applyColumnVisibility() {
  document.querySelectorAll("#tbl thead th[data-col]").forEach((th) => {
    const col = Number(th.dataset.col);
    th.style.display = hiddenCols.has(col) ? "none" : "";
  });
  document.querySelectorAll("#tbl tbody tr:not(.expander-row) td:not(:last-child)").forEach((td, idx) => {
    const col = idx % 8;
    td.style.display = hiddenCols.has(col) ? "none" : "";
  });
}

function initColumnToggle() {
  const btn = document.getElementById("btn-col-toggle");
  const menu = document.getElementById("col-menu");
  if (!btn || !menu) return;

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.classList.toggle("show");
  });

  menu.querySelectorAll("input[data-col]").forEach((cb) => {
    cb.addEventListener("change", () => {
      const col = Number(cb.dataset.col);
      if (cb.checked) hiddenCols.delete(col);
      else hiddenCols.add(col);
      applyColumnVisibility();
    });
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".col-toggle-wrap")) menu.classList.remove("show");
  });
}

function initTableSearch() {
  const input = document.getElementById("table-search");
  if (!input) return;
  let _debounce = null;
  input.addEventListener("input", () => {
    clearTimeout(_debounce);
    _debounce = setTimeout(() => {
      searchQuery = input.value.trim();
      currentPage = 1;
      renderTable();
    }, 250);
  });
}

function handleSort(key) {
  if (sortState.key === key) {
    sortState.asc = !sortState.asc;
  } else {
    sortState.key = key;
    sortState.asc = true;
  }

  doSort(key, sortState.asc);
  updateSortIcons();
  renderTable();
}

function doSort(key, asc) {
  tableData.sort((a, b) => {
    let valA = a[key] ? a[key].toString().toLowerCase() : "";
    let valB = b[key] ? b[key].toString().toLowerCase() : "";

    const numA = parseFloat(valA);
    const numB = parseFloat(valB);

    let comp =
      !isNaN(numA) && !isNaN(numB) && isFinite(valA) && isFinite(valB)
        ? numA - numB
        : valA.localeCompare(valB);

    return asc ? comp : -comp;
  });
}

function updateSortIcons() {
  document.querySelectorAll(".sort-icon").forEach((i) => {
    i.innerText = "";
  });

  if (sortState.key) {
    const th = document.querySelector(`th[data-key="${sortState.key}"]`);

    if (th) {
      th.querySelector(".sort-icon").innerText = sortState.asc ? "▲" : "▼";
    }
  }
}

function initProj4() {
  if (typeof proj4 !== "undefined") {
    proj4.defs(
      "EPSG:32638",
      "+proj=utm +zone=38 +ellps=WGS84 +units=m +no_defs",
    );

    proj4.defs("WGS84", "+proj=longlat +ellps=WGS84 +no_defs");
  }
}

function initDateInputs() {
  const today = new Date().toISOString().slice(0, 10);
  const f = document.getElementById("f-from");
  const t = document.getElementById("f-to");
  const r = document.getElementById("rain-date");

  if (f) { f.value = today; f.max = today; }
  if (t) { t.value = ""; t.max = today; }
  if (r) { r.max = today; }
}

function initDropdowns() {
  const d = document.getElementById("az-selected");
  const m = document.getElementById("az-menu");
  const ok = document.getElementById("az-ok");
  const all = document.getElementById("az-select-all");
  const chks = document.querySelectorAll(".az-menu .az-opt");

  if (d && m) {
    d.addEventListener("click", (e) => {
      e.stopPropagation();
      document.getElementById("manager-menu")?.classList.remove("show");
      m.classList.toggle("show");
    });

    if (ok) {
      ok.addEventListener("click", () => {
        m.classList.remove("show");
        updateAzomvisDisplay();
      });
    }

    if (all) {
      all.addEventListener("change", (e) => {
        chks.forEach((c) => {
          c.checked = e.target.checked;
        });

        updateAzomvisDisplay();
      });
    }

    chks.forEach((c) => {
      c.addEventListener("change", () => {
        if (all) {
          all.checked = [...chks].every((x) => x.checked);
        }

        updateAzomvisDisplay();
      });
    });

    updateAzomvisDisplay();
  }

  const managerSelected = document.getElementById("manager-selected");
  const managerMenu = document.getElementById("manager-menu");

  if (managerSelected && managerMenu) {
    managerSelected.addEventListener("click", (e) => {
      e.stopPropagation();
      document.getElementById("az-menu")?.classList.remove("show");
      managerMenu.classList.toggle("show");
    });

    document.querySelectorAll(".manager-option").forEach((option) => {
      option.addEventListener("click", () => {
        const value = option.dataset.value;
        const text = option.textContent;

        managerSelected.textContent = text + " ▼";
        managerSelected.dataset.value = value;

        managerMenu.classList.remove("show");

        saveFiltersToStorage();
        loadData(false);
      });
    });
  }

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".manager-dropdown")) {
      const managerMenu = document.getElementById("manager-menu");
      if (managerMenu) managerMenu.classList.remove("show");
    }

    if (!e.target.closest(".az-dropdown")) {
      const azMenu = document.getElementById("az-menu");
      if (azMenu) azMenu.classList.remove("show");
    }
  });
}

function splitMulti(s) {
  return s
    ? [...new Set(s.replace(/,/g, " ").split(/\s+/).filter(Boolean))]
    : [];
}

function setStatus(t) {
  document.getElementById("status").innerText = t;
}

function initTheme() {
  const t = localStorage.getItem("theme");

  if (t) document.body.className = t;

  const c = document.getElementById("themeToggle");

  if (c) {
    c.checked = t === "theme-dark";

    c.addEventListener("change", () => {
      document.body.className = c.checked ? "theme-dark" : "theme-light";
      localStorage.setItem("theme", document.body.className);
    });
  }
}

function initMiniMap(idx, txt) {
  if (typeof L === "undefined") return;

  const mid = `map-${idx}`;
  const el = document.getElementById(mid);

  if (!el) return;

  if (activeMaps[mid]) {
    activeMaps[mid].remove();
    delete activeMaps[mid];
  }

  const m = L.map(el, {
    zoomControl: true,
    attributionControl: false,
  }).setView([41.72, 44.78], 9);

  activeMaps[mid] = m;

  L.tileLayer("https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}", {
    maxZoom: 20,
  }).addTo(m);

  try {
    const g = JSON.parse(txt.replace(/^"|"$/g, "").replace(/\\"/g, '"'));

    if (g) {
      const l = L.geoJSON(
        { ...g, coordinates: reprojectCoordinates(g.coordinates) },
        {
          style: () => ({
            color: "#ff7800",
            weight: 3,
          }),

          pointToLayer: (f, ll) =>
            L.circleMarker(ll, {
              radius: 6,
              fillColor: "#ff7800",
              color: "#000",
            }),
        },
      ).addTo(m);

      if (l.getBounds().isValid()) {
        m.fitBounds(l.getBounds());
      }
    }
  } catch (e) {}
}

function reprojectCoordinates(c) {
  if (Array.isArray(c) && c.length === 2 && typeof c[0] === "number") {
    return proj4("EPSG:32638", "WGS84", c);
  }

  return c.map(reprojectCoordinates);
}

function exportReportToExcel() {
  if (!tableData || tableData.length === 0) {
    showToast("ექსპორტისთვის მონაცემები არ არის", "warning");
    return;
  }

  const wb = XLSX.utils.book_new();

  // 1) Detailed Report — არსებული დეტალური რეპორტი
  const reportTable = document.getElementById("report-tbl");
  if (reportTable && reportTable.rows.length > 1) {
    const wsReport = XLSX.utils.table_to_sheet(reportTable);
    XLSX.utils.book_append_sheet(wb, wsReport, "Detailed Report");
  }

  // 2) Zones
  const zoneCounts = {};
  tableData.forEach((row) => {
    const zone = getZoneFromCadcode(row);
    zoneCounts[zone] = (zoneCounts[zone] || 0) + 1;
  });

  const zoneSheetData = Object.entries(zoneCounts)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([zone, count]) => ({
      Zone: zone,
      Count: count,
    }));

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(zoneSheetData),
    "Zones",
  );

  // 3) Managers
  const managerCounts = {};

  MANAGER_PREFIXES.forEach((prefix) => {
    managerCounts[prefix] = 0;
  });

  tableData.forEach((row) => {
    const prefix = getManagerPrefixFromTag(row.TAG);
    if (prefix) managerCounts[prefix]++;
  });

  const managerSheetData = Object.entries(managerCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([prefix, count]) => ({
      Manager_ID: prefix,
      Manager: MANAGER_NAMES[prefix] || prefix,
      Count: count,
    }));

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(managerSheetData),
    "Managers",
  );

  // 4) Daily
  const dailyCounts = {};

  tableData.forEach((row) => {
    const date = row.DATE_ ? row.DATE_.split("T")[0].split(" ")[0] : "N/A";
    dailyCounts[date] = (dailyCounts[date] || 0) + 1;
  });

  const dailySheetData = Object.entries(dailyCounts)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({
      Date: date,
      Count: count,
    }));

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(dailySheetData),
    "Daily",
  );

  // 5) Raw Data
  const rawSheetData = tableData.map((row) => ({
    TAG: row.TAG || "",
    CADCODE: row.CADCODE || "",
    DATE: row.DATE_ || "",
    ZONE: getZoneFromCadcode(row),
    SECTOR: getSectorFromCadcode(row),
    FUNCTION: row.FUNCTION_LABEL || row.FUNCTION || "",
    CATEGORY: row.CATEGORY_LABEL || row.CATEGORY || "",
    AZOMVIS_TIPI: row.AZOMVIS_TIPI_LABEL || row.AZOMVIS_TIPI || "",
  }));

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(rawSheetData),
    "Raw Data",
  );

  const dateStr = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `WFS_Report_${dateStr}.xlsx`);
  showToast(`Excel შეინახა: WFS_Report_${dateStr}.xlsx`, "success");
}

function initMapToggle() {
  const btnList = document.getElementById("btn-zone-list");
  const btnMap = document.getElementById("btn-live-map");
  const listView = document.getElementById("zone-list-view");
  const mapView = document.getElementById("live-map-view");

  if (!btnList || !btnMap || !listView || !mapView) return;

  btnList.addEventListener("click", () => {
    btnList.classList.add("active");
    btnMap.classList.remove("active");

    listView.style.display = "block";
    mapView.style.display = "none";
  });

  btnMap.addEventListener("click", () => {
    btnMap.classList.add("active");
    btnList.classList.remove("active");

    listView.style.display = "none";
    mapView.style.display = "block";

    renderLiveZoneMap();

    setTimeout(() => {
      if (liveZoneMapInstance) liveZoneMapInstance.invalidateSize();
    }, 200);
  });
}

function resetFilters() {
  document.getElementById("f-zone").value = "";
  document.getElementById("f-sector").value = "";
  document.getElementById("f-from").value = "";
  document.getElementById("f-to").value = "";

  const managerSelected = document.getElementById("manager-selected");
  if (managerSelected) {
    managerSelected.dataset.value = "";
    managerSelected.textContent = "ყველა ▼";
  }

  document.querySelectorAll("#az-menu input.az-opt").forEach((cb) => {
    cb.checked = true;
  });

  const selectAll = document.getElementById("az-select-all");
  if (selectAll) selectAll.checked = true;

  updateAzomvisDisplay();

  localStorage.removeItem(FILTER_STORAGE_KEY);

  loadData(false);
}

function setLoading(isLoading) {
  const btnLoad = document.getElementById("btn-load");
  const btnRefresh = document.getElementById("btn-refresh");

  if (btnLoad) {
    btnLoad.disabled = isLoading;
    btnLoad.innerText = isLoading ? "იტვირთება..." : "მონაცემების გამოტანა";
  }

  if (btnRefresh) {
    btnRefresh.disabled = isLoading;
  }
}

function updateActiveFilterButton() {
  const btn = document.getElementById("btn-clear-active-filter");
  if (!btn) return;

  const zone = document.getElementById("f-zone").value.trim();
  const sector = document.getElementById("f-sector").value.trim();
  const dateFrom = document.getElementById("f-from").value;
  const dateTo = document.getElementById("f-to").value;
  const manager = document.getElementById("manager-selected")?.dataset.value || "";

  btn.style.display = (zone || sector || dateFrom || dateTo || manager) ? "inline-flex" : "none";
}

function clearActiveZoneSectorFilter() {
  document.getElementById("f-zone").value = "";
  document.getElementById("f-sector").value = "";
  document.getElementById("f-from").value = "";
  document.getElementById("f-to").value = "";

  const managerSelected = document.getElementById("manager-selected");
  if (managerSelected) {
    managerSelected.dataset.value = "";
    managerSelected.textContent = "ყველა ▼";
  }

  saveFiltersToStorage();
  updateActiveFilterButton();
  loadData(false);
}

function renderTopInsights() {
  renderTopManagers();
  renderTopZones();
}

function renderTopManagers() {
  const container = document.getElementById("top-managers");
  if (!container) return;

  const counts = {};

  tableData.forEach((row) => {
    const prefix = getManagerPrefixFromTag(row.TAG);

    if (prefix) {
      counts[prefix] = (counts[prefix] || 0) + 1;
    }
  });

  const top = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  container.innerHTML = top
    .map(
      ([prefix, count], index) => `
        <div class="insight-row">
          <div class="insight-rank">#${index + 1}</div>

          <div class="insight-main">
            <div class="insight-title">
              ${MANAGER_NAMES[prefix] || prefix}
            </div>

            <div class="insight-sub">
              TAG: ${prefix}
            </div>
          </div>

          <div class="insight-value">
            ${count}
          </div>
        </div>
      `,
    )
    .join("");
}

function renderTopZones() {
  const container = document.getElementById("top-zones");
  if (!container) return;

  const counts = {};

  tableData.forEach((row) => {
    const zone = getZoneFromCadcode(row);
    counts[zone] = (counts[zone] || 0) + 1;
  });

  const top = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  container.innerHTML = top
    .map(
      ([zone, count], index) => `
        <div class="insight-row">
          <div class="insight-rank">#${index + 1}</div>

          <div class="insight-main">
            <div class="insight-title">
              ზონა ${zone}
            </div>

            <div class="insight-sub">
              აქტიური რეგიონი
            </div>
          </div>

          <div class="insight-value">
            ${count}
          </div>
        </div>
      `,
    )
    .join("");
}

// =========================
// MODALS CORE
// =========================

function openModal(id) {
  document.getElementById("modal-overlay").classList.add("open");
  document.getElementById(id).style.display = "flex";
}

function closeAllModals() {
  document.getElementById("modal-overlay").classList.remove("open");
  ["modal-progress", "modal-audit", "modal-rain-impact"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });
}

// =========================
// AUDIT LOG
// =========================

async function openAuditModal() {
  openModal("modal-audit");
  const body = document.getElementById("audit-body");
  body.innerHTML = '<div class="modal-spinner"><div class="map-spinner"></div></div>';
  try {
    const res  = await fetch("/api/audit-log");
    const json = await res.json();
    if (!json.ok) { body.innerHTML = `<div class="ri-empty">შეცდომა: ${json.error}</div>`; return; }
    if (!json.items.length) { body.innerHTML = '<div class="ri-empty">ჩანაწერები არ არის</div>'; return; }
    const rows = json.items.map((r) => {
      const chip = `<span class="audit-action-chip ${r.action}">${r.action}</span>`;
      return `<tr>
        <td style="color:var(--muted);white-space:nowrap;">${r.ts}</td>
        <td style="font-weight:600;">${escHtml(r.username)}</td>
        <td>${chip}</td>
        <td>${escHtml(r.details || "")}</td>
      </tr>`;
    }).join("");
    body.innerHTML = `
      <table class="audit-table">
        <thead><tr><th>დრო (UTC)</th><th>მომხმარებელი</th><th>მოქმედება</th><th>დეტალი</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  } catch {
    body.innerHTML = `<div class="ri-empty">ჩატვირთვის შეცდომა</div>`;
  }
}

// =========================
// PROGRESS TRACKING
// =========================

async function openProgressModal() {
  openModal("modal-progress");
  const body = document.getElementById("progress-body");
  body.innerHTML = '<div class="modal-spinner"><div class="map-spinner"></div></div>';
  try {
    const targets = await fetch("/api/targets").then((r) => r.json());
    const zoneCounts = {};
    tableData.forEach((row) => {
      const z = String(row.ZONE || "").trim();
      if (z) zoneCounts[z] = (zoneCounts[z] || 0) + 1;
    });

    const zones = Object.keys(zoneCounts).sort((a, b) => Number(a) - Number(b));
    if (!zones.length) {
      body.innerHTML = '<div class="ri-empty">მონაცემები არ არის — ჯერ ჩატვირთეთ ფილტრი</div>';
      return;
    }

    const isAdm = window.currentUser?.username === "Lnukradze";

    const rows = zones.map((z) => {
      const actual = zoneCounts[z] || 0;
      const target = targets[z]    || 0;
      const pct    = target > 0 ? Math.min((actual / target) * 100, 100) : 0;
      const over   = target > 0 && actual >= target;
      const pctTxt = target > 0
        ? `${actual}/${target} (${Math.round(pct)}%)`
        : `${actual} / სამიზნე არ არის`;
      const tInput = isAdm
        ? `<input class="prog-target-input" id="ti-${z}" type="number" min="0" value="${target}" />
           <button class="prog-save-btn" onclick="saveTarget('${z}')">✓</button>`
        : `<span style="color:var(--muted);font-size:0.78rem;">${target || "—"}</span>`;
      return `
        <div class="prog-zone-row">
          <div class="prog-zone-label">ზონა ${z}</div>
          <div class="prog-bar-wrap">
            <div class="prog-bar-fill ${over ? "over" : ""}" style="width:${pct}%"></div>
          </div>
          <div class="prog-count">${pctTxt}</div>
          ${tInput}
        </div>`;
    }).join("");

    body.innerHTML = `
      <div class="prog-section-title">
        ${isAdm ? "სამიზნეების შეყვანა: ✓ ღილაკით შეინახეთ" : "ზონების პროგრესი"}
        &nbsp;·&nbsp; სულ: <strong>${tableData.length}</strong> ჩანაწერი
      </div>
      ${rows}`;
  } catch {
    body.innerHTML = `<div class="ri-empty">ჩატვირთვის შეცდომა</div>`;
  }
}

async function saveTarget(zone) {
  const inp = document.getElementById(`ti-${zone}`);
  if (!inp) return;
  const target = parseInt(inp.value, 10) || 0;
  try {
    const res  = await fetch("/api/targets", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ zone, target }),
    });
    const json = await res.json();
    if (json.ok) { showToast(`ზონა ${zone}: სამიზნე — ${target}`); openProgressModal(); }
    else         { showToast("შეცდომა: " + json.error); }
  } catch { showToast("შეცდომა შენახვისას"); }
}

// =========================
// RAIN IMPACT
// =========================

async function calcRainImpact() {
  const from = document.getElementById("ri-from").value;
  const to   = document.getElementById("ri-to").value;
  const res  = document.getElementById("rain-impact-result");
  if (!from || !to) { showToast("მიუთითეთ თარიღის დიაპაზონი"); return; }
  res.innerHTML = '<div class="modal-spinner"><div class="map-spinner"></div></div>';
  try {
    const r    = await fetch(`/api/rain-impact?date_from=${from}&date_to=${to}`);
    const json = await r.json();
    if (!json.ok) { res.innerHTML = `<div class="ri-empty">შეცდომა: ${json.error}</div>`; return; }

    const rainRows = Object.entries(json.rain_by_date)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([d, zones]) => `
        <div class="ri-rain-row">
          <span class="ri-rain-date">🌧 ${d}</span>
          <span class="ri-rain-zones">ზონები: ${zones.join(", ")}</span>
        </div>`).join("")
      || '<div class="ri-empty">წვიმიანი დღეები ამ პერიოდში არ მოიძებნა</div>';

    res.innerHTML = `
      <div class="ri-stats-grid">
        <div class="ri-stat">
          <div class="ri-stat-val">${json.total_days}</div>
          <div class="ri-stat-lbl">კალენდ. დღე</div>
        </div>
        <div class="ri-stat">
          <div class="ri-stat-val">${json.working_days}</div>
          <div class="ri-stat-lbl">სამუშაო დღე</div>
        </div>
        <div class="ri-stat danger">
          <div class="ri-stat-val">${json.rain_working}</div>
          <div class="ri-stat-lbl">წვიმ. სამ. დღე</div>
        </div>
        <div class="ri-stat success">
          <div class="ri-stat-val">${json.net_working}</div>
          <div class="ri-stat-lbl">ნეტო სამ. დღე</div>
        </div>
        <div class="ri-stat danger">
          <div class="ri-stat-val">${json.lost_hours}</div>
          <div class="ri-stat-lbl">დაკარგ. საათი</div>
        </div>
        <div class="ri-stat">
          <div class="ri-stat-val">${json.rain_days}</div>
          <div class="ri-stat-lbl">წვიმ. დღის ჩანაწ.</div>
        </div>
      </div>
      <div class="ri-rain-list-title">წვიმიანი დღეები:</div>
      <div class="ri-rain-list">${rainRows}</div>`;
  } catch {
    res.innerHTML = '<div class="ri-empty">ჩატვირთვის შეცდომა</div>';
  }
}

// =========================
// PDF / PRINT REPORT
// =========================

function printReport() {
  if (!tableData.length) { showToast("პირველ ჩატვირთეთ მონაცემები"); return; }

  const zone   = document.getElementById("f-zone").value   || "ყველა";
  const sector = document.getElementById("f-sector").value || "ყველა";
  const from   = document.getElementById("f-from").value   || "—";
  const to     = document.getElementById("f-to").value     || "—";
  const now    = new Date().toLocaleString("ka-GE", { hour12: false });

  const zoneSums = {};
  const typeSums = {};
  tableData.forEach((r) => {
    const z = r.ZONE || "?";              zoneSums[z] = (zoneSums[z] || 0) + 1;
    const t = r.AZOMVIS_TIPI_LABEL || "?"; typeSums[t] = (typeSums[t] || 0) + 1;
  });

  const zoneRows = Object.entries(zoneSums)
    .sort(([, a], [, b]) => b - a).slice(0, 15)
    .map(([z, n]) => `<tr><td>ზონა ${z}</td><td>${n}</td></tr>`).join("");
  const typeRows = Object.entries(typeSums)
    .map(([t, n]) => `<tr><td>${t}</td><td>${n}</td></tr>`).join("");
  const dataRows = tableData.slice(0, 500)
    .map((r) => `<tr>
      <td>${escHtml(r.TAG)}</td>
      <td>${escHtml(r.CADCODE)}</td>
      <td>${String(r.DATE_ || "").slice(0, 10)}</td>
      <td>${escHtml(r.ZONE)}</td>
      <td>${escHtml(r.SECTOR)}</td>
      <td>${escHtml(r.AZOMVIS_TIPI_LABEL)}</td>
    </tr>`).join("");

  const win = window.open("", "_blank");
  win.document.write(`<!DOCTYPE html><html lang="ka"><head>
    <meta charset="utf-8">
    <title>ანგარიში ${from}/${to}</title>
    <style>
      body{font-family:"Sylfaen","DejaVu Sans",sans-serif;font-size:11px;color:#111;margin:24px;}
      h1{font-size:16px;margin:0 0 4px;}
      .meta{color:#555;font-size:10px;margin-bottom:16px;}
      .summary{display:flex;gap:16px;margin-bottom:18px;flex-wrap:wrap;}
      .sum-box{border:1px solid #ccc;border-radius:6px;padding:10px 16px;min-width:110px;}
      .sum-val{font-size:22px;font-weight:700;color:#1e40af;}
      .sum-lbl{font-size:9px;color:#555;margin-top:2px;}
      h2{font-size:12px;margin:14px 0 5px;border-bottom:1px solid #ccc;padding-bottom:3px;}
      table{border-collapse:collapse;width:100%;margin-bottom:12px;}
      th{background:#e8e8e8;padding:4px 8px;text-align:left;font-size:10px;}
      td{padding:3px 8px;border-bottom:1px solid #e0e0e0;font-size:10px;}
      tr:nth-child(even) td{background:#f5f5f5;}
    </style>
  </head><body>
    <h1>კადასტრული აზომვების ანგარიში</h1>
    <div class="meta">
      გენ.: ${now} &nbsp;·&nbsp;
      ${escHtml(window.currentUser?.displayName || "")} &nbsp;·&nbsp;
      ზონა: ${escHtml(zone)} &nbsp;·&nbsp; სექტ.: ${escHtml(sector)} &nbsp;·&nbsp;
      პერიოდი: ${from} — ${to}
    </div>
    <div class="summary">
      <div class="sum-box"><div class="sum-val">${tableData.length}</div><div class="sum-lbl">სულ ჩანაწერი</div></div>
      <div class="sum-box"><div class="sum-val">${Object.keys(zoneSums).length}</div><div class="sum-lbl">ზონა</div></div>
      <div class="sum-box"><div class="sum-val">${Object.keys(typeSums).length}</div><div class="sum-lbl">ტიპი</div></div>
    </div>
    <h2>ზონების მიხედვით (Top 15)</h2>
    <table><thead><tr><th>ზონა</th><th>რაოდენობა</th></tr></thead><tbody>${zoneRows}</tbody></table>
    <h2>ტიპების მიხედვით</h2>
    <table><thead><tr><th>ტიპი</th><th>რაოდენობა</th></tr></thead><tbody>${typeRows}</tbody></table>
    <h2>დეტალური ჩამონათვალი (პირველი 500)</h2>
    <table><thead><tr><th>TAG</th><th>CADCODE</th><th>DATE_</th><th>ZONE</th><th>SECTOR</th><th>ტიპი</th></tr></thead>
    <tbody>${dataRows}</tbody></table>
    <script>window.print();<\/script>
  </body></html>`);
  win.document.close();
}

// =========================
// ADMIN TOOLS INIT
// =========================

function initAdminTools() {
  const AUDIT_USERS = ["Lnukradze", "user1"];
  if (AUDIT_USERS.includes(window.currentUser?.username)) {
    const btn = document.getElementById("btn-audit-log");
    if (btn) btn.style.display = "";
  }
  document.getElementById("btn-audit-log")  ?.addEventListener("click", openAuditModal);
  document.getElementById("btn-progress")   ?.addEventListener("click", openProgressModal);
  document.getElementById("btn-print-pdf")  ?.addEventListener("click", printReport);
  document.getElementById("ri-calc-btn")    ?.addEventListener("click", calcRainImpact);
  document.getElementById("btn-rain-impact")?.addEventListener("click", () => {
    const from = document.getElementById("f-from").value;
    const to   = document.getElementById("f-to").value;
    if (from) document.getElementById("ri-from").value = from;
    if (to)   document.getElementById("ri-to").value   = to;
    openModal("modal-rain-impact");
  });
}

// =========================
// WEATHER MODULE
// =========================

let weatherActive = false;
let weatherData = {};
let weatherCentroids = {};
let weatherVar = "temp";
let weatherPeriod = "now";
let weatherFetchedAt = 0;
const WEATHER_CLIENT_TTL = 60 * 60 * 1000;

const WEATHER_VARS = {
  temp:     { label: "ტემპ.",  unit: "°C",    icon: "🌡" },
  rain:     { label: "წვიმა",  unit: " mm",   icon: "🌧" },
  wind:     { label: "ქარი",   unit: " კმ/სთ", icon: "💨" },
  humidity: { label: "ტენ.",   unit: "%",      icon: "💧" },
  cloud:    { label: "ღრუბ.", unit: "%",       icon: "☁" },
  aqi:      { label: "ჰაერი", unit: " AQI",   icon: "🌿" },
};

const WEATHER_PERIODS = { now: "ახლა", d1: "24სთ", d3: "3 დღე", d7: "7 დღე" };

function computeZoneCentroids() {
  if (!cachedPreparedGeoJson) return {};
  const bounds = {};

  cachedPreparedGeoJson.features.forEach((feature) => {
    const zone = String(feature.properties?.ZONE_ID || "").trim();
    if (!zone) return;
    if (!bounds[zone]) {
      bounds[zone] = { minLat: Infinity, maxLat: -Infinity, minLon: Infinity, maxLon: -Infinity };
    }
    const b = bounds[zone];
    const geom = feature.geometry;
    if (!geom) return;

    let rings = [];
    if (geom.type === "Polygon") rings = geom.coordinates;
    else if (geom.type === "MultiPolygon") rings = geom.coordinates.flat(1);

    rings.forEach((ring) => {
      ring.forEach(([lon, lat]) => {
        if (lat < b.minLat) b.minLat = lat;
        if (lat > b.maxLat) b.maxLat = lat;
        if (lon < b.minLon) b.minLon = lon;
        if (lon > b.maxLon) b.maxLon = lon;
      });
    });
  });

  const centroids = {};
  Object.entries(bounds).forEach(([zone, b]) => {
    if (b.minLat !== Infinity) {
      centroids[zone] = { lat: (b.minLat + b.maxLat) / 2, lon: (b.minLon + b.maxLon) / 2 };
    }
  });
  return centroids;
}

function findNearestLoadedZone(zoneId) {
  const loadedIds = Object.keys(weatherData);
  if (!loadedIds.length || !weatherCentroids[zoneId]) return null;
  const { lat: lat0, lon: lon0 } = weatherCentroids[zoneId];
  let bestId = null, bestDist = Infinity;
  for (const lid of loadedIds) {
    const c = weatherCentroids[lid];
    if (!c) continue;
    const dist = (c.lat - lat0) ** 2 + (c.lon - lon0) ** 2;
    if (dist < bestDist) { bestDist = dist; bestId = lid; }
  }
  return bestId;
}

function computeGeorgiaAverage() {
  const vals = Object.values(weatherData);
  if (!vals.length) return null;
  const avg = (arr) => {
    const nums = arr.filter((v) => v !== null && v !== undefined);
    return nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10 : null;
  };
  const pv = (period, key) => vals.map((v) => v?.[period]?.[key] ?? null);
  const makeP = (p) => ({
    temp: avg(pv(p, "temp")), rain: avg(pv(p, "rain")),
    wind: avg(pv(p, "wind")), humidity: p === "now" ? avg(pv(p, "humidity")) : null,
    cloud: avg(pv(p, "cloud")), aqi: p === "now" ? avg(pv(p, "aqi")) : null,
  });
  return { now: makeP("now"), d1: makeP("d1"), d3: makeP("d3"), d7: makeP("d7") };
}

async function loadWeatherData(force = false) {
  if (!cachedPreparedGeoJson) {
    setWeatherStatus("მონაცემები ჯერ ჩატვირთული არ არის", "error");
    return;
  }

  if (!force && weatherFetchedAt && Date.now() - weatherFetchedAt < WEATHER_CLIENT_TTL && Object.keys(weatherData).length) {
    applyWeatherStyles();
    buildWeatherLegend();
    return;
  }

  setWeatherStatus("ამინდის მონაცემები იტვირთება...", "loading");

  weatherCentroids = computeZoneCentroids();
  const zones = Object.entries(weatherCentroids).map(([id, c]) => ({
    id,
    lat: +c.lat.toFixed(4),
    lon: +c.lon.toFixed(4),
  }));

  if (!zones.length) {
    setWeatherStatus("ზონების კოორდინატები ვერ მოიძებნა", "error");
    return;
  }

  try {
    const resp = await fetch("/api/weather-zones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zones, force }),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const result = await resp.json();
    if (!result.ok) throw new Error(result.error || "API შეცდომა");

    weatherData = result.data || {};
    weatherFetchedAt = Date.now();
    const s = result.stats || {};
    console.log(`[Weather] API — requested:${s.requested} cached:${s.cached} fetched:${s.fetched} loaded:${s.loaded} interpolated:${s.interpolated} returned:${s.returned}`);
    setWeatherStatus("", "");
    applyWeatherStyles();
    buildWeatherLegend();
  } catch (err) {
    setWeatherStatus(`შეცდომა: ${err.message}`, "error");
  }
}

function interpolateColor(value, stops) {
  if (value <= stops[0][0]) return `rgb(${stops[0][1].join(",")})`;
  if (value >= stops[stops.length - 1][0]) return `rgb(${stops[stops.length - 1][1].join(",")})`;
  for (let i = 0; i < stops.length - 1; i++) {
    const [v0, c0] = stops[i];
    const [v1, c1] = stops[i + 1];
    if (value >= v0 && value <= v1) {
      const t = (value - v0) / (v1 - v0);
      return `rgb(${Math.round(c0[0] + t * (c1[0] - c0[0]))},${Math.round(c0[1] + t * (c1[1] - c0[1]))},${Math.round(c0[2] + t * (c1[2] - c0[2]))})`;
    }
  }
  return null;
}

function getWeatherColor(variable, value) {
  if (value === null || value === undefined) return null;
  const scales = {
    temp: [
      [-15, [59, 130, 246]], [0, [147, 210, 240]], [10, [134, 239, 172]],
      [20, [253, 224, 71]], [30, [249, 115, 22]], [42, [185, 28, 28]],
    ],
    rain: [
      [0, [241, 245, 249]], [1, [147, 210, 255]], [5, [59, 130, 246]],
      [15, [29, 78, 216]], [40, [30, 27, 75]],
    ],
    wind: [
      [0, [134, 239, 172]], [10, [253, 224, 71]], [25, [249, 115, 22]],
      [45, [220, 38, 38]], [70, [127, 29, 29]],
    ],
    humidity: [
      [0, [253, 224, 71]], [40, [134, 239, 172]], [70, [59, 130, 246]], [100, [29, 78, 216]],
    ],
    cloud: [
      [0, [240, 248, 255]], [30, [209, 213, 219]], [70, [148, 163, 184]], [100, [71, 85, 105]],
    ],
    aqi: [
      [0, [52, 211, 153]], [25, [163, 230, 53]], [50, [253, 224, 71]],
      [100, [249, 115, 22]], [150, [220, 38, 38]], [250, [127, 29, 29]],
    ],
  };
  return interpolateColor(value, scales[variable] || scales.temp);
}

function getWeatherValue(zoneData, variable, period) {
  if (!zoneData) return null;
  return zoneData[period]?.[variable] ?? null;
}

function buildWeatherTooltip(zone, zoneData, source = "direct") {
  const zoneName = ZONE_NAMES_MAP[Number(zone)] || "";
  const varInfo = WEATHER_VARS[weatherVar];
  const val = getWeatherValue(zoneData, weatherVar, weatherPeriod);
  const valStr = val !== null ? `${val}${varInfo.unit}` : "—";
  const sourceNote = source === "nearest"
    ? `<div class="zt-source">~ მეზობელი ზონის მონაცემი</div>`
    : source === "average"
    ? `<div class="zt-source">~ საქართველოს საშუალო</div>`
    : "";

  let nowRows = "";
  const now = zoneData?.now;
  if (now) {
    nowRows = `
      <div class="zt-row"><span>🌡 ტემპ.:</span><strong>${now.temp ?? "—"}°C</strong></div>
      <div class="zt-row"><span>🌧 წვიმა:</span><strong>${now.rain ?? "—"} mm</strong></div>
      <div class="zt-row"><span>💨 ქარი:</span><strong>${now.wind ?? "—"} კმ/სთ</strong></div>
      <div class="zt-row"><span>💧 ტენ.:</span><strong>${now.humidity ?? "—"}%</strong></div>
      <div class="zt-row"><span>☁ ღრუბ.:</span><strong>${now.cloud ?? "—"}%</strong></div>
      ${now.aqi != null ? `<div class="zt-row"><span>🌿 AQI:</span><strong>${now.aqi}</strong></div>` : ""}
    `;
  }

  return `<div class="zt-title">ზონა ${zone}${zoneName ? ` — ${zoneName}` : ""}</div>
    ${sourceNote}
    <div class="zt-wx-highlight">${varInfo.icon} ${WEATHER_PERIODS[weatherPeriod]}: <strong>${valStr}</strong></div>
    <div class="zt-divider"></div>${nowRows}`;
}

function applyWeatherStyles() {
  if (!liveZoneGeoJsonLayer || !weatherActive) return;

  const georgiaAvg = computeGeorgiaAverage();
  const loadedZoneIds = Object.keys(weatherData);
  const allCentroidIds = Object.keys(weatherCentroids);
  let totalPolygons = 0, directCount = 0, nearestCount = 0, avgCount = 0, missing = 0;
  const fallbackZones = new Set();

  liveZoneGeoJsonLayer.eachLayer((layer) => {
    totalPolygons++;
    const zone = layer._zone;
    if (!zone) { missing++; return; }

    let zoneData = weatherData[zone];
    let source = "direct";

    if (!zoneData) {
      const nearestId = findNearestLoadedZone(zone);
      if (nearestId) {
        zoneData = weatherData[nearestId];
        source = "nearest";
        fallbackZones.add(zone);
        nearestCount++;
      } else if (georgiaAvg) {
        zoneData = georgiaAvg;
        source = "average";
        fallbackZones.add(zone);
        avgCount++;
      }
    } else {
      directCount++;
    }

    const value = getWeatherValue(zoneData, weatherVar, weatherPeriod);
    const color = getWeatherColor(weatherVar, value);

    if (value === null || value === undefined) {
      missing++;
    }

    layer.setStyle({
      fillColor: color || "#e2e8f0",
      fillOpacity: color ? 0.78 : 0.15,
      color: "#94a3b8",
      weight: 0.8,
    });
    layer._tipHtml = buildWeatherTooltip(zone, zoneData, source);
  });

  const painted = directCount + nearestCount + avgCount;
  console.log(
    `[Weather] Total polygons: ${totalPolygons} | Total zones: ${allCentroidIds.length} | ` +
    `Loaded weather zones: ${loadedZoneIds.length} | Fallback zones: ${fallbackZones.size} | ` +
    `Painted: ${painted} | Missing: ${missing}`
  );
}

function buildWeatherLegend() {
  const bar = document.getElementById("weather-legend-bar");
  if (!bar) return;

  const varInfo = WEATHER_VARS[weatherVar];
  const legendCfg = {
    temp:     { min: -15, max: 42,  grad: "linear-gradient(to right,#3b82f6,#93d2f0,#86efac,#fde047,#f97316,#b91c1c)" },
    rain:     { min: 0,   max: 40,  grad: "linear-gradient(to right,#f1f5f9,#93d2ff,#3b82f6,#1d4ed8,#1e1b4b)" },
    wind:     { min: 0,   max: 70,  grad: "linear-gradient(to right,#86efac,#fde047,#f97316,#dc2626,#7f1d1d)" },
    humidity: { min: 0,   max: 100, grad: "linear-gradient(to right,#fde047,#86efac,#3b82f6,#1d4ed8)" },
    cloud:    { min: 0,   max: 100, grad: "linear-gradient(to right,#f0f8ff,#d1d5db,#94a3b8,#475569)" },
    aqi:      { min: 0,   max: 150, grad: "linear-gradient(to right,#34d399,#a3e635,#fde047,#f97316,#dc2626)" },
  };

  const cfg = legendCfg[weatherVar];
  const mid = Math.round((cfg.min + cfg.max) / 2);

  bar.innerHTML = `
    <div class="wl-label-title">${varInfo.icon} ${varInfo.label}</div>
    <div class="wl-gradient" style="background:${cfg.grad}"></div>
    <div class="wl-labels">
      <span>${cfg.min}${varInfo.unit}</span>
      <span>${mid}${varInfo.unit}</span>
      <span>${cfg.max}${varInfo.unit}</span>
    </div>
  `;
}

function setWeatherStatus(msg, type) {
  const el = document.getElementById("weather-status");
  if (!el) return;
  el.textContent = msg;
  el.className = `weather-status${type ? ` ws-${type}` : ""}`;
  el.style.display = msg ? "" : "none";
}

function activateWeatherMode() {
  weatherActive = true;
  document.getElementById("weather-panel")?.style.setProperty("display", "");
  document.getElementById("btn-weather-layer")?.classList.add("active");

  if (liveZoneMapInstance) {
    loadWeatherData(false);
  }
}

function deactivateWeatherMode() {
  weatherActive = false;
  document.getElementById("weather-panel")?.style.setProperty("display", "none");
  document.getElementById("btn-weather-layer")?.classList.remove("active");
  if (liveZoneGeoJsonLayer) refreshLiveMapStyles();
}

function initWeatherModule() {
  document.getElementById("btn-weather-layer")?.addEventListener("click", () => {
    if (weatherActive) deactivateWeatherMode();
    else {
      // Switch to map view if not already on it
      const mapView = document.getElementById("live-map-view");
      if (mapView && mapView.style.display === "none") {
        document.getElementById("btn-live-map")?.click();
      }
      activateWeatherMode();
    }
  });

  document.getElementById("btn-weather-close")?.addEventListener("click", deactivateWeatherMode);

  document.getElementById("btn-weather-refresh")?.addEventListener("click", () => loadWeatherData(true));

  document.querySelectorAll(".wp-var").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      document.querySelectorAll(".wp-var").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      weatherVar = btn.dataset.var;
      if (weatherActive) { applyWeatherStyles(); buildWeatherLegend(); }
    });
  });

  document.querySelectorAll(".wp-period").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".wp-period").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      weatherPeriod = btn.dataset.period;

      const humBtn = document.querySelector('.wp-var[data-var="humidity"]');
      const aqiBtn = document.querySelector('.wp-var[data-var="aqi"]');
      const notNow = weatherPeriod !== "now";
      if (humBtn) humBtn.disabled = notNow;
      if (aqiBtn) aqiBtn.disabled = notNow;
      if (notNow && (weatherVar === "humidity" || weatherVar === "aqi")) {
        document.querySelector('.wp-var[data-var="temp"]')?.click();
      }

      if (weatherActive) applyWeatherStyles();
    });
  });
}
