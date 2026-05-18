const TABLE_RENDER_LIMIT = 500;
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

  loadFiltersFromStorage();
  renderActiveFilters();

  const savedTab = loadActiveTab();
  if (savedTab) switchView(savedTab);

  document
    .getElementById("f-zone")
    .addEventListener("input", saveFiltersToStorage);
  document
    .getElementById("f-sector")
    .addEventListener("input", saveFiltersToStorage);
  document
    .getElementById("f-from")
    .addEventListener("change", saveFiltersToStorage);
  document
    .getElementById("f-to")
    .addEventListener("change", saveFiltersToStorage);

  document.getElementById("btn-load").addEventListener("click", () => {
    saveFiltersToStorage();
    loadData(false);
  });
  document.getElementById("btn-reset").addEventListener("click", resetFilters);
  document
    .getElementById("btn-clear-active-filter")
    .addEventListener("click", clearActiveZoneSectorFilter);
  if (document.getElementById("btn-add-rain")) {
    document
      .getElementById("btn-add-rain")
      .addEventListener("click", addRainDay);
    renderRainDays();
  }

  document
    .getElementById("btn-refresh")
    .addEventListener("click", () => loadData(true));
  document
    .getElementById("btn-excel")
    .addEventListener("click", exportReportToExcel);

  document.getElementById("tab-data").addEventListener("click", () => {
    switchView("data");
    saveActiveTab();
  });

  document.getElementById("tab-report").addEventListener("click", () => {
    switchView("report");
    saveActiveTab();
  });

  document.querySelectorAll("th.sortable").forEach((th) => {
    th.addEventListener("click", () => handleSort(th.dataset.key));
  });

  document.getElementById("themeToggle").addEventListener("change", () => {
    if (currentView === "report") updateCharts();
  });

  // const hasFilters =
  //   document.getElementById("f-zone").value ||
  //   document.getElementById("f-sector").value ||
  //   document.getElementById("f-from").value ||
  //   document.getElementById("f-to").value ||
  //   (document.getElementById("manager-selected") &&
  //     document.getElementById("manager-selected").dataset.value);

  // if (hasFilters) loadData(false);
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

  document.getElementById("kpi-cat-ratio").innerText = `${cat1} / ${cat2}`;
}

function animateValue(id, end) {
  const obj = document.getElementById(id);
  if (!obj) return;

  const start = parseInt(obj.innerText) || 0;
  if (start === end) return;

  let current = start;
  const range = end - start;
  const increment = end > start ? 1 : -1;
  const step = Math.abs(Math.floor(2000 / range));

  const timer = setInterval(
    () => {
      current += increment;
      obj.innerText = current;
      if (current == end) clearInterval(timer);
    },
    Math.max(step, 10),
  );

  obj.innerText = end;
}

function getRainDays() {
  try {
    return JSON.parse(localStorage.getItem(RAIN_DAYS_STORAGE_KEY) || "{}");
  } catch (e) {
    return {};
  }
}

function saveRainDays(rainDays) {
  localStorage.setItem(RAIN_DAYS_STORAGE_KEY, JSON.stringify(rainDays));
}

function addRainDay() {
  const date = document.getElementById("rain-date").value;
  const zone = document.getElementById("rain-zone").value.trim();

  if (!date || !zone) {
    alert("აირჩიე თარიღიც და ზონაც");
    return;
  }

  const rainDays = getRainDays();

  if (!rainDays[date]) {
    rainDays[date] = [];
  }

  if (!rainDays[date].includes(zone)) {
    rainDays[date].push(zone);
  }

  saveRainDays(rainDays);
  renderRainDays();
  renderReport();
}

function removeRainDay(date, zone) {
  const rainDays = getRainDays();

  if (!rainDays[date]) return;

  rainDays[date] = rainDays[date].filter((z) => z !== zone);

  if (rainDays[date].length === 0) {
    delete rainDays[date];
  }

  saveRainDays(rainDays);
  renderRainDays();
  renderReport();
}

function renderRainDays() {
  const container = document.getElementById("rain-list");
  if (!container) return;

  const rainDays = getRainDays();
  container.innerHTML = "";

  Object.entries(rainDays).forEach(([date, zones]) => {
    zones.forEach((zone) => {
      const chip = document.createElement("span");
      chip.className = "rain-chip";
      chip.innerHTML = `🌧 ${date} / ზონა ${zone} <span class="rain-remove">×</span>`;

      chip.querySelector(".rain-remove").addEventListener("click", () => {
        removeRainDay(date, zone);
      });

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

  console.log("ZONE COUNTS:", counts);
  console.log("TABLE DATA LENGTH:", tableData.length);

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

function getZoneColor(zone, count, maxCount) {
  if (!count) return "#cbd5e1";

  const ratio = count / maxCount;

  if (ratio >= 0.65) return "#ef4444";
  if (ratio >= 0.3) return "#f59e0b";

  return "#3b82f6";
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
function renderLiveZoneMap() {
  const mapEl = document.getElementById("live-zone-map");
  if (!mapEl) return;

  const { zoneCounts, sectorCounts } = getMapCountsFromTableData();
  const maxCount = Math.max(...Object.values(zoneCounts), 1);

  if (!liveZoneMapInstance) {
    liveZoneMapInstance = L.map("live-zone-map", {
      zoomControl: true,
      attributionControl: false,
    }).setView([42.1, 43.7], 8);

    L.tileLayer("https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}", {
      maxZoom: 20,
    }).addTo(liveZoneMapInstance);
  }

  if (liveZoneGeoJsonLayer) {
    liveZoneMapInstance.removeLayer(liveZoneGeoJsonLayer);
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
        style: function (feature) {
          const zone = String(feature.properties.ZONE_ID || "").trim();
          // const sector = String(feature.properties.SECTOR_ID || "").trim();
          // const sectorKey = `${zone}.${sector}`;
          // const count = sectorCounts[sectorKey] || 0;
          const count = zoneCounts[zone] || 0;
          return {
            color: "#1e40af",
            weight: 1,
            fillColor: getZoneColor(zone, count, maxCount),
            fillOpacity: count > 0 ? 0.55 : 0.15,
          };
        },

        onEachFeature: function (feature, layer) {
          const zone = String(feature.properties.ZONE_ID || "").trim();
          const sector = String(feature.properties.SECTOR_ID || "").trim();
          const sectorName = feature.properties.SECTOR_NAM || "";

          const sectorKey = `${zone}.${sector}`;
          const sectorCount = sectorCounts[sectorKey] || 0;
          const zoneCount = zoneCounts[zone] || 0;

          layer.bindTooltip(
            `
    <strong>ზონა:</strong> ${zone}<br>
    <strong>სექტორი:</strong> ${sector}<br>
    <strong>${sectorName}</strong><br><br>

    <strong>სექტორში ნაკვეთები:</strong> ${sectorCount}<br>
    <strong>ზონაში სულ:</strong> ${zoneCount}
  `,
            {
              sticky: true,
              direction: "top",
              className: "zone-tooltip",
            },
          );

          layer.on("mouseover", function () {
            layer.setStyle({
              weight: 3,
              color: "#111827",
              fillOpacity: 0.75,
            });
          });

          layer.on("mouseout", function () {
            liveZoneGeoJsonLayer.resetStyle(layer);
          });

          layer.on("click", function () {
            document.getElementById("f-zone").value = zone;
            saveFiltersToStorage();
            // loadData(false);
          });
        },
      }).addTo(liveZoneMapInstance);

      const bounds = liveZoneGeoJsonLayer.getBounds();

      if (bounds.isValid()) {
        liveZoneMapInstance.fitBounds(bounds, {
          padding: [20, 20],
        });
      }

      setTimeout(() => {
        liveZoneMapInstance.invalidateSize();
      }, 200);
    })
    .catch((err) => {
      console.error("GeoJSON loading error:", err);
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
    },
  );

  const zoneData = groupBy((d) => d.ZONE || "N/A");

  const totalCount = tableData.length;
  const totalDailyAverage =
    daysCount > 0 ? Number((totalCount / daysCount).toFixed(1)) : 0;

  createChart(
    "chartZone",
    "doughnut",
    {
      labels: zoneData.map((x) => x[0]),
      datasets: [
        {
          data: zoneData.map((x) => x[1]),
          backgroundColor: [
            "#3b82f6",
            "#ef4444",
            "#10b981",
            "#f59e0b",
            "#8b5cf6",
            "#6366f1",
          ],
        },
      ],
    },
    {
      centerText: totalDailyAverage,
      centerTooltip: "საერთო დღიური საშუალო",
    },
  );

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

      plugins: {
        legend: {
          display: type !== "bar",
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
  if (tableData.length > TABLE_RENDER_LIMIT) {
    const trLimit = document.createElement("tr");
    trLimit.innerHTML = `
    <td colspan="9" class="table-limit-note">
      ნაჩვენებია პირველი ${TABLE_RENDER_LIMIT} ჩანაწერი ${tableData.length}-დან.
      სრული მონაცემები გამოიყენება რეპორტსა და Excel export-ში.
    </td>
  `;
    tbody.appendChild(trLimit);
  }
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

  if (z) qs.set("zone", splitMulti(z).join(" "));
  if (s) qs.set("sector", splitMulti(s).join(" "));
  if (df && !dt) dt = df;
  if (df) qs.set("date_from", df);
  if (dt) qs.set("date_to", dt);
  if (azVals.length) qs.set("azomvis", azVals.join(" "));
  if (forceRefresh) qs.set("refresh", "1");

  setStatus("");
  setLoading(true);

  (async () => {
    try {
      console.log("API URL:", "/api/data?" + qs.toString());
      const res = await fetch("/api/data?" + qs.toString());

      if (!res.ok) {
        throw new Error(`HTTP error! ${res.status}`);
      }

      const data = await res.json();

      let items = data.items || [];

      const managerSelected = document.getElementById("manager-selected");

      const selectedManagerPrefix = managerSelected
        ? managerSelected.dataset.value || ""
        : "";

      if (selectedManagerPrefix) {
        items = items.filter((row) => {
          const rowPrefix = getManagerPrefixFromTag(row.TAG);
          return rowPrefix === selectedManagerPrefix;
        });
      }

      tableData = items;

      if (currentView === "data") {
        if (sortState.key) doSort(sortState.key, sortState.asc);

        setTimeout(() => {
          renderTable();
          renderActiveFilters();
        }, 0);
      } else {
        setTimeout(() => {
          renderReport();
          renderActiveFilters();
        }, 0);
      }

      // setStatus(`მიღებულია: ${tableData.length} ჩანაწერი`);
      setStatus(`მიღებულია: ${tableData.length} ჩანაწერი`);
      console.log("API response:", data);
      console.log("items length:", items.length);
      console.log("first item:", items[0]);
      updateActiveFilterButton();
    } catch (error) {
      setStatus(`შეცდომა: ${error.message}`);
    } finally {
      setLoading(false);
    }
  })();
}

function renderTable() {
  const tbody = document.querySelector("#tbl tbody");

  if (!tbody) return;

  activeMaps = {};
  tbody.innerHTML = "";
  if (!tableData || tableData.length === 0) {
    tbody.innerHTML = `
    <tr>
      <td colspan="9" class="empty-state">
        ამ ფილტრებით ჩანაწერი ვერ მოიძებნა. სცადე თარიღის, ზონის ან სექტორის შეცვლა.
      </td>
    </tr>
  `;
    return;
  }

  tableData.slice(0, TABLE_RENDER_LIMIT).forEach((row, i) => {
    const mapId = `map-${i}`;
    const expId = `exp-${i}`;

    const geomText = row.wkt_geom
      ? JSON.stringify(row.wkt_geom)
      : '{"type": "Point", "coordinates": [44.78, 41.72]}';

    const tr = document.createElement("tr");

    tr.innerHTML = `<td>${row.TAG || ""}</td><td>${row.CADCODE || ""}</td><td>${
      row.DATE_ || ""
    }</td><td>${row.ZONE || ""}</td><td>${row.SECTOR || ""}</td><td>${
      row.FUNCTION_LABEL || row.FUNCTION || ""
    }</td><td>${row.CATEGORY_LABEL || row.CATEGORY || ""}</td><td>${
      row.AZOMVIS_TIPI_LABEL || row.AZOMVIS_TIPI || ""
    }</td><td><button class="btn blue btn-draw" data-i="${i}">ნახაზი</button></td>`;

    const trExp = document.createElement("tr");
    trExp.className = "expander-row";
    trExp.id = expId;

    trExp.innerHTML = `<td colspan="9"><div class="mini-detail"><div id="${mapId}" class="mini-map"></div><textarea class="geom-text" readonly>${geomText}</textarea></div></td>`;

    tr.querySelector(".btn-draw").addEventListener("click", (e) => {
      const btn = e.currentTarget;
      const exp = document.getElementById(expId);
      const isOpen = exp.style.display === "table-row";

      btn.classList.toggle("active", !isOpen);

      if (isOpen) {
        exp.style.display = "none";

        if (activeMaps[mapId]) {
          activeMaps[mapId].remove();
          delete activeMaps[mapId];
        }
      } else {
        exp.style.display = "table-row";
        initMiniMap(i, geomText);

        setTimeout(() => {
          if (activeMaps[mapId]) activeMaps[mapId].invalidateSize();
        }, 150);
      }
    });

    tbody.appendChild(tr);
    tbody.appendChild(trExp);
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
  const f = document.getElementById("f-from");

  if (f) {
    f.value = new Date().toISOString().slice(0, 10);
    document.getElementById("f-to").value = "";
  }
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
    alert("მონაცემები არ არის");
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

  btn.style.display = zone || sector ? "inline-flex" : "none";
}

function clearActiveZoneSectorFilter() {
  document.getElementById("f-zone").value = "";
  document.getElementById("f-sector").value = "";

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
