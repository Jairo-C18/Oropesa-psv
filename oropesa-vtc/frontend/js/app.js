"use strict";

const COMPANY_ID = 48241;
const API_BASE = `https://e.truckyapp.com/api/v1/company/${COMPANY_ID}`;
const TRUCKY_COMPANY_URL = `https://hub.truckyapp.com/company/${COMPANY_ID}`;
const LIVE_JOBS_URL =
  "https://api.mdcdev.me/v2/peruserver/trucky/live-jobs/geo?days=3&perPage=100&compactJobs=false&useDbCache=true&includePoints=true&includeRoutes=true&includeRouteCoordinates=false&includeUnresolved=true&includeBlocked=true";
const SERVER_MAP_BASE_URL = "https://cdn-launcher.peruserver.de/map";
const SERVER_MAP_INFO = {
  x1: -96352.7656,
  x2: -21294.5313,
  y1: -22946.2773,
  y2: 52111.957,
  minZoom: 0,
  maxZoom: 8,
};
const SERVER_MAP_CITIES = [
  { Name: "Nasca", X: -36872.83, Y: 47915.47 },
  { Name: "Jauja", X: -44454.5156, Y: 8710.519 },
  { Name: "Ica", X: -48715.4336, Y: 38333.4063 },
  { Name: "Nmorococha", X: -50590.1875, Y: 5190.255 },
  { Name: "Laoroya", X: -50422.7227, Y: 6535.138 },
  { Name: "Chicla", X: -53489.95, Y: 5987.62451 },
  { Name: "Casapalca", X: -52735.9141, Y: 5256.137 },
  { Name: "Matucana", X: -54250.36, Y: 9440.39551 },
  { Name: "Sanmateo", X: -55106.9727, Y: 8039.096 },
  { Name: "Canete", X: -54856.0742, Y: 27192.707 },
  { Name: "Chincha", X: -52854.9922, Y: 30420.1719 },
  { Name: "Pisco", X: -54295.418, Y: 34264.4922 },
  { Name: "Paracas", X: -54546.08, Y: 35881.72 },
  { Name: "Mala", X: -58563.9141, Y: 25267.6875 },
  { Name: "Lima", X: -62684.15, Y: 13977.7773 },
  { Name: "Chancay", X: -68408.52, Y: 6115.356 },
  { Name: "Callao", X: -66513.04, Y: 12319.6523 },
  { Name: "Huacho", X: -71757.56, Y: -153.980469 },
  { Name: "Barranca", X: -73777.3, Y: -3681.76563 },
  { Name: "Supe", X: -72710.2656, Y: -3381.125 },
  { Name: "Pativilca", X: -73805.91, Y: -4556.85156 },
  { Name: "Huarmey", X: -78848.18, Y: -12638.6807 },
  { Name: "Casma", X: -81272.43, Y: -20293.5938 },
];
const REFRESH_INTERVAL = 5 * 60 * 1000;
const LIVE_REFRESH_INTERVAL = 20 * 1000;
const RECENT_JOBS_LIMIT = 5;
const ALL_JOBS_PAGE_SIZE = 1000;
const numberFormatter = new Intl.NumberFormat("es-ES", {
  maximumFractionDigits: 0,
  useGrouping: true,
});

function getElement(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const element = getElement(id);
  if (element && value !== undefined && value !== null) {
    element.textContent = String(value);
  }
}

function formatNumber(value) {
  return numberFormatter.format(value);
}

function parseDistance(value) {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  const distance = Number(value);
  return Number.isFinite(distance) && distance >= 0 ? distance : undefined;
}

function getJobDistance(job) {
  const status = String(job.status || "").toLowerCase();
  const values =
    status === "in_progress" || status === "started" || status === "active"
      ? [job.planned_distance_km, job.planned_distance, job.driven_distance_km, job.driven_distance]
      : [job.driven_distance_km, job.driven_distance, job.planned_distance_km, job.planned_distance];
  for (const value of values) {
    const distance = parseDistance(value);
    if (distance !== undefined) {
      return distance;
    }
  }
  return undefined;
}

function isCompletedJob(job) {
  return String(job.status || "").toLowerCase().replaceAll("-", "_") === "completed";
}

function getJobDate(job) {
  const status = String(job.status || "").toLowerCase().replaceAll("-", "_");
  if (status === "in_progress" || status === "started" || status === "active") {
    return job.started_at || job.created_at || job.completed_at;
  }
  return job.completed_at || job.canceled_at || job.started_at || job.created_at;
}

function getJobUrl(job) {
  if (typeof job.public_url === "string") {
    try {
      const url = new URL(job.public_url);
      if (url.protocol === "https:" && url.hostname === "hub.truckyapp.com") {
        return url.href;
      }
    } catch {
      return undefined;
    }
  }

  return job.id !== null && Number.isInteger(Number(job.id))
    ? `https://hub.truckyapp.com/job/${encodeURIComponent(job.id)}`
    : undefined;
}

async function fetchJson(path, signal) {
  const response = await fetch(`${API_BASE}${path}`, {
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    throw new Error(`Trucky respondió con el estado ${response.status}.`);
  }
  return response.json();
}

async function fetchAllCompanyJobs(signal) {
  const firstPage = await fetchJson(
    `/jobs?page=1&perPage=${ALL_JOBS_PAGE_SIZE}`,
    signal,
  );
  if (!Array.isArray(firstPage.data)) {
    throw new Error("El historial de trabajos tiene un formato no válido.");
  }

  const lastPage = Number(firstPage.last_page);
  if (!Number.isInteger(lastPage) || lastPage < 1) {
    throw new Error("La paginación del historial de trabajos no es válida.");
  }

  if (lastPage === 1) {
    return firstPage.data;
  }

  const remainingPages = await Promise.all(
    Array.from({ length: lastPage - 1 }, (_, index) =>
      fetchJson(`/jobs?page=${index + 2}&perPage=${ALL_JOBS_PAGE_SIZE}`, signal),
    ),
  );
  if (remainingPages.some((page) => !Array.isArray(page.data))) {
    throw new Error("Una página del historial de trabajos tiene un formato no válido.");
  }

  return firstPage.data.concat(...remainingPages.map((page) => page.data));
}

function getMonthParameters(date) {
  return `month=${date.getMonth() + 1}&year=${date.getFullYear()}`;
}

function updateCompany(company) {
  if (company && Number.isFinite(Number(company.members_count))) {
    setText("stat-drivers", formatNumber(Math.max(0, Number(company.members_count) - 1)));
  }
}

function updateStatistics(stats) {
  const ets2 = stats?.ets2;
  if (!ets2) {
    return false;
  }

  if (Number.isFinite(Number(ets2.total_km))) {
    const kilometers = Number(ets2.total_km);
    setText("stat-monthly-kilometers", formatNumber(kilometers));
    setText("hero-kilometers", formatNumber(kilometers));
    setText("hero-kilometers-mobile", formatNumber(kilometers));
  }
  if (Number.isFinite(Number(ets2.jobs_completed))) {
    setText("stat-completed", formatNumber(Number(ets2.jobs_completed)));
  }
  if (Number.isFinite(Number(ets2.race_km))) {
    setText("stat-race-km", formatNumber(Number(ets2.race_km)));
  }

  return true;
}

function updateLifetimeKilometers(jobs) {
  const kilometers = jobs.reduce((total, job) => {
    const distance = parseDistance(job.driven_distance_km ?? job.driven_distance);
    return distance === undefined ? total : total + distance;
  }, 0);
  setText("stat-kilometers", formatNumber(kilometers));
}

function getDriverAvatarUrl(driver) {
  if (typeof driver?.avatar_url !== "string") {
    return undefined;
  }

  try {
    const url = new URL(driver.avatar_url);
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function getDriverMembership(driver) {
  if (!driver || !Object.prototype.hasOwnProperty.call(driver, "company_id")) {
    return undefined;
  }
  if (driver.company_id === null) {
    return false;
  }
  const companyId = Number(driver.company_id);
  return Number.isFinite(companyId) ? companyId === COMPANY_ID : undefined;
}

function createDriverAvatar(driver, sizeClass) {
  const avatarUrl = getDriverAvatarUrl(driver);
  if (!avatarUrl) {
    return undefined;
  }

  const avatar = document.createElement("img");
  avatar.className = `${sizeClass} shrink-0 rounded-full border border-white/15 bg-white/10 object-cover`;
  avatar.src = avatarUrl;
  avatar.alt = "";
  avatar.loading = "lazy";
  avatar.referrerPolicy = "no-referrer";
  avatar.addEventListener("error", () => avatar.remove(), { once: true });
  return avatar;
}

function createCell(className, text) {
  const element = document.createElement("p");
  element.className = className;
  element.textContent = text;
  return element;
}

function getServerMapPoint(info, x, y) {
  const worldX = Number(x);
  const worldY = Number(y);
  if (
    !info ||
    !Number.isFinite(worldX) ||
    !Number.isFinite(worldY) ||
    !Number.isFinite(info.x1) ||
    !Number.isFinite(info.x2) ||
    !Number.isFinite(info.y1) ||
    !Number.isFinite(info.y2) ||
    info.x1 === info.x2 ||
    info.y1 === info.y2
  ) {
    return undefined;
  }

  const latitude = -Math.min(
    Math.max((512 * (worldY - info.y1)) / (info.y2 - info.y1), 0),
    511.999,
  );
  const longitude = Math.min(
    Math.max((512 * (worldX - info.x1)) / (info.x2 - info.x1), 0),
    511.999,
  );
  return window.L.latLng(latitude, longitude);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isLiveJobForCompany(job) {
  const status = String(job.status || "").toLowerCase().replaceAll("-", "_");
  return (
    Number(job.companyId) === COMPANY_ID &&
    ["in_progress", "started", "active"].includes(status)
  );
}

function findServerCity(cityId) {
  const normalizedId = String(cityId || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return SERVER_MAP_CITIES.find(
    (city) => city.Name.toLowerCase().replace(/[^a-z0-9]/g, "") === normalizedId,
  );
}

function renderLiveJobDetails(job) {
  const card = getElement("live-player-card");
  if (!card || !job) {
    return;
  }

  const avatar = getElement("live-player-avatar");
  const avatarUrl = job.driverAvatarUrl;
  if (avatar) {
    if (typeof avatarUrl === "string" && avatarUrl.startsWith("https://")) {
      avatar.src = avatarUrl;
      avatar.hidden = false;
    } else {
      avatar.removeAttribute("src");
      avatar.hidden = true;
    }
  }

  const origin = job.source?.cityName || "Origen no disponible";
  const destination = job.destination?.cityName || "Destino no disponible";
  const cargo = job.cargoName || "Carga no disponible";
  setText("live-player-name", job.driverName || "Conductor de Oropesa");
  setText("live-player-vehicle", `${origin} → ${destination}`);
  setText("live-player-speed", cargo);
  setText(
    "live-player-vehicle-type",
    /bus|pasaj|coach/i.test(cargo) ? "Bus" : "Camión",
  );
  setText("live-player-state", "Ruta aproximada");
  const distanceKm = Number(job.plannedDistanceKm);
  setText(
    "live-player-distance",
    Number.isFinite(distanceKm) && distanceKm > 0 ? `${formatNumber(distanceKm)} km` : "—",
  );

  const profile = getElement("live-player-profile");
  const profileUrl = job.driverProfileUrl;
  if (
    typeof profileUrl === "string" &&
    profileUrl.startsWith("https://hub.truckyapp.com/user/") &&
    profile
  ) {
    profile.href = profileUrl;
    profile.hidden = false;
  } else if (profile) {
    profile.hidden = true;
  }
  card.hidden = false;
}

function renderLiveJobList(entries, selectedKey, onSelect) {
  const list = getElement("live-routes-list");
  if (!list) {
    return;
  }
  list.replaceChildren();

  if (entries.length === 0) {
    const empty = document.createElement("li");
    empty.className = "px-5 py-8 text-sm text-zinc-400";
    empty.textContent = "No hay trabajos activos de Oropesa ahora.";
    list.append(empty);
    return;
  }

  for (const job of entries) {
    const driverName = job.driverName || "Conductor de Oropesa";
    const jobKey = String(job.id);
    const item = document.createElement("li");
    item.className = `flex cursor-pointer items-center gap-3 px-5 py-4 transition-colors hover:bg-white/[0.04] ${jobKey === selectedKey ? "bg-white/[0.06]" : ""}`;
    item.tabIndex = 0;
    item.setAttribute("role", "button");
    item.setAttribute("aria-pressed", String(jobKey === selectedKey));
    item.addEventListener("click", () => onSelect(job));
    item.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onSelect(job);
      }
    });

    const avatar = createDriverAvatar({ avatar_url: job.driverAvatarUrl }, "h-10 w-10");
    if (avatar) {
      item.append(avatar);
    } else {
      const initial = document.createElement("span");
      initial.className =
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-sm font-black text-red-400";
      initial.textContent = driverName.slice(0, 1).toUpperCase();
      item.append(initial);
    }

    const details = document.createElement("div");
    details.className = "min-w-0 flex-1";
    const driver = document.createElement("p");
    driver.className = "block truncate text-sm font-bold text-white hover:text-red-300";
    driver.textContent = driverName;
    const route = createCell(
      "mt-1 truncate text-xs text-zinc-400",
      `${job.source?.cityName || "Origen"} → ${job.destination?.cityName || "Destino"}`,
    );
    const vehicle = createCell(
      "mt-1 truncate text-[11px] text-zinc-500",
      job.cargoName || "Carga no disponible",
    );
    details.append(driver, route, vehicle);
    item.append(details);

    const liveTag = createCell(
      "shrink-0 rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-400",
      "Ruta activa",
    );
    item.append(liveTag);
    list.append(item);
  }
}

let liveMap;
let liveJobsLayer;
let selectedLiveJobId = null;
let livePlayerCardDismissed = false;

function createLiveMap(mapElement) {
  if (liveMap) {
    return;
  }
  const mapBounds = window.L.latLngBounds([-512, 0], [0, 512]);
  const minZoom = SERVER_MAP_INFO.minZoom;
  const maxZoom = SERVER_MAP_INFO.maxZoom;
  liveMap = window.L.map(mapElement, {
    crs: window.L.CRS.Simple,
    center: mapBounds.getCenter(),
    zoom: Math.min(minZoom + 2, maxZoom),
    minZoom,
    maxZoom,
    zoomControl: false,
    attributionControl: false,
    maxBounds: mapBounds.pad(0.05),
    maxBoundsViscosity: 1,
  });
  liveMap.getContainer().style.background = "#0a0d14";
  window.L.control.zoom({ position: "bottomright" }).addTo(liveMap);
  window.L.control
    .attribution({ position: "bottomright", prefix: false })
    .addAttribution(
      '<a href="https://www.peruserver.pe/rutas" target="_blank" rel="noopener noreferrer">Mapa oficial de Peru Server</a>',
    )
    .addTo(liveMap);
  window.L.tileLayer(`${SERVER_MAP_BASE_URL}/Tiles/{z}/{x}/{y}.png`, {
    tileSize: 512,
    minZoom: SERVER_MAP_INFO.minZoom,
    maxZoom: SERVER_MAP_INFO.maxZoom,
    maxNativeZoom: SERVER_MAP_INFO.maxZoom,
    noWrap: true,
    bounds: mapBounds,
    keepBuffer: 2,
    updateWhenZooming: false,
    className: "ps-map-tiles",
    attribution: "",
  }).addTo(liveMap);

  liveJobsLayer = window.L.layerGroup().addTo(liveMap);
}

function renderLiveMap(entries, selectedKey, onSelect) {
  const mapElement = getElement("live-map");
  if (!mapElement) {
    return 0;
  }
  if (!window.L) {
    mapElement.textContent = "No se pudo cargar el mapa.";
    return 0;
  }

  createLiveMap(mapElement);
  liveJobsLayer.clearLayers();
  const bounds = [];
  let plottedJobs = 0;
  for (const job of entries) {
    const sourceCity = findServerCity(job.source?.cityId);
    const destinationCity = findServerCity(job.destination?.cityId);
    if (!sourceCity || !destinationCity) {
      continue;
    }

    const sourcePoint = getServerMapPoint(SERVER_MAP_INFO, sourceCity.X, sourceCity.Y);
    const destinationPoint = getServerMapPoint(
      SERVER_MAP_INFO,
      destinationCity.X,
      destinationCity.Y,
    );
    if (!sourcePoint || !destinationPoint) {
      continue;
    }

    const point = window.L.latLng(
      (sourcePoint.lat + destinationPoint.lat) / 2,
      (sourcePoint.lng + destinationPoint.lng) / 2,
    );
    const driverName = job.driverName || "Conductor Oropesa";
    const vehicleIcon = /bus|pasaj|coach/i.test(job.cargoName || "")
      ? "🚌"
      : "🚚";
    const icon = window.L.divIcon({
      className: `ps-player-marker${String(job.id) === selectedKey ? " is-selected" : ""}`,
      html: `<span class="ps-player-vehicle">${vehicleIcon}</span><span class="ps-player-name">${escapeHtml(driverName)}</span>`,
      iconSize: [132, 48],
      iconAnchor: [66, 18],
      tooltipAnchor: [0, -18],
    });
    const marker = window.L.marker(point, {
      icon,
      playerKey: String(job.id),
    }).addTo(liveJobsLayer);
    marker.on("click", () => onSelect(job));
    const tooltip = document.createElement("span");
    tooltip.textContent = [
      driverName,
      `${job.source.cityName} → ${job.destination.cityName}`,
      "Ubicación aproximada",
    ]
      .filter(Boolean)
      .join(" · ");
    marker.bindTooltip(tooltip);
    bounds.push(point);
    plottedJobs += 1;
  }

  if (bounds.length > 0) {
    liveMap.fitBounds(bounds, { padding: [48, 48], maxZoom: 3 });
  }
  window.setTimeout(() => liveMap.invalidateSize(), 0);
  return plottedJobs;
}

function selectLiveJob(job, entries) {
  selectedLiveJobId = String(job.id);
  livePlayerCardDismissed = false;
  renderLiveJobDetails(job);
  renderLiveJobList(entries, selectedLiveJobId, (selectedJob) =>
    selectLiveJob(selectedJob, entries),
  );
  liveJobsLayer?.eachLayer((marker) => {
    marker.getElement()?.classList.toggle(
      "is-selected",
      marker.options.playerKey === selectedLiveJobId,
    );
  });
}

getElement("live-player-close")?.addEventListener("click", () => {
  livePlayerCardDismissed = true;
  const card = getElement("live-player-card");
  if (card) {
    card.hidden = true;
  }
});

let isLoadingLiveJobs = false;

async function loadLiveJobs() {
  if (isLoadingLiveJobs) {
    return;
  }
  isLoadingLiveJobs = true;
  const status = getElement("live-routes-status");
  if (status && !getElement("live-routes-list")?.children.length) {
    status.textContent = "Conectando con el mapa en vivo...";
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 30000);
  try {
    const jobsResponse = await fetch(LIVE_JOBS_URL, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!jobsResponse.ok) {
      throw new Error(`El servicio de rutas respondió con estado ${jobsResponse.status}.`);
    }
    const jobsData = await jobsResponse.json();
    if (!Array.isArray(jobsData.jobs)) {
      throw new Error("Los datos de trabajos en vivo tienen un formato no válido.");
    }

    const entries = jobsData.jobs
      .filter(isLiveJobForCompany)
      .filter((job) => findServerCity(job.source?.cityId) && findServerCity(job.destination?.cityId))
      .slice(0, 6);
    //Selección del primer jugador
    //if (!entries.some((job) => String(job.id) === selectedLiveJobId)) {
     // selectedLiveJobId = entries.length ? String(entries[0].id) : null;
    //}
    const selectedEntry = entries.find((job) => String(job.id) === selectedLiveJobId);
    if (selectedEntry && !livePlayerCardDismissed) {
      renderLiveJobDetails(selectedEntry);
    } else if (!selectedEntry) {
      getElement("live-player-card")?.setAttribute("hidden", "");
    }

    renderLiveJobList(entries, selectedLiveJobId, (job) =>
      selectLiveJob(job, entries),
    );
    setText("live-routes-count", String(entries.length));
    const plottedJobs = renderLiveMap(entries, selectedLiveJobId, (job) =>
      selectLiveJob(job, entries),
    );
    const updatedAt = new Intl.DateTimeFormat("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date());
    if (status) {
      status.classList.remove("text-red-400");
      status.textContent = `${plottedJobs} ${plottedJobs === 1 ? "ruta activa de Oropesa" : "rutas activas de Oropesa"} · Marcadores aproximados · Actualizado: ${updatedAt}`;
    }
  } catch (error) {
    const message =
      error instanceof DOMException && error.name === "AbortError"
        ? "El servicio de rutas en vivo superó el tiempo de espera."
        : error instanceof Error
          ? error.message
          : "Error desconocido al consultar las rutas en vivo.";
    if (status) {
      status.textContent = `No se pudieron actualizar las rutas en vivo: ${message}`;
      status.classList.add("text-red-400");
    }
    if (getElement("live-routes-list")?.firstElementChild?.id === "live-routes-placeholder") {
      renderLiveJobList([], null, () => {});
    }
  } finally {
    window.clearTimeout(timeoutId);
    isLoadingLiveJobs = false;
  }
}

function renderJobs(jobs) {
  const list = getElement("routes-list");
  if (!list) {
    return;
  }

  list.replaceChildren();
  if (jobs.length === 0) {
    const empty = document.createElement("li");
    empty.className = "px-5 py-8 text-sm leading-6 text-zinc-400 sm:px-6";
    empty.textContent = "Todavía no hay rutas completadas disponibles.";
    list.append(empty);
    return;
  }

  for (const job of jobs.slice(0, RECENT_JOBS_LIMIT)) {
    const origin = job.source_city_name || "Origen no disponible";
    const destination = job.destination_city_name || "Destino no disponible";
    const driverInfo = job.driver || {};
    const driver = driverInfo.name || "Conductor no disponible";
    const distance = getJobDistance(job);
    const distanceLabel = distance === undefined ? "—" : `${formatNumber(distance)} km`;

    const item = document.createElement("li");
    item.className =
      "route-row group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-5 transition-all duration-300 sm:grid-cols-[1.4fr_1fr_auto] sm:px-6 sm:py-6";

    const routeCell = document.createElement("div");
    routeCell.className = "min-w-0";
    const jobUrl = getJobUrl(job);
    const routeTitle = jobUrl ? document.createElement("a") : document.createElement("p");
    routeTitle.className =
      "route-title block truncate text-sm font-bold transition-colors duration-300 sm:text-base";
    routeTitle.textContent = `${origin} → ${destination}`;
    if (jobUrl) {
      routeTitle.href = jobUrl;
      routeTitle.target = "_blank";
      routeTitle.rel = "noopener noreferrer";
      routeTitle.title = "Ver trabajo en Trucky";
    }
    const statusLabel = document.createElement("div");
    statusLabel.className = "mt-2 flex min-w-0 items-center gap-2 sm:hidden";
    const mobileAvatar = createDriverAvatar(driverInfo, "h-6 w-6");
    if (mobileAvatar) {
      statusLabel.append(mobileAvatar);
    }
    statusLabel.append(createCell("truncate text-xs text-zinc-400", driver));
    routeCell.append(routeTitle, statusLabel);

    const details = document.createElement("div");
    details.className = "hidden min-w-0 items-center gap-2 sm:flex";
    const desktopAvatar = createDriverAvatar(driverInfo, "h-8 w-8");
    if (desktopAvatar) {
      details.append(desktopAvatar);
    }
    details.append(createCell("truncate text-sm font-medium text-zinc-300", driver));
    const distanceLabelElement = createCell(
      "route-distance whitespace-nowrap rounded-lg px-3 py-2 text-right text-xs font-black sm:text-sm",
      distanceLabel,
    );

    item.append(routeCell, details, distanceLabelElement);
    list.append(item);
  }
}

let rankingJobs = [];
let rankingPeriod = "month";
let rankingDate = new Date();
const expandedRankings = { month: false, total: false };

function renderDriverRanking(jobs, date = new Date()) {
  const list = getElement("ranking-list");
  const moreButton = getElement("ranking-more");
  if (!list) {
    return;
  }
  list.replaceChildren();

  rankingJobs = jobs;
  rankingDate = date;
  const monthLabel = new Intl.DateTimeFormat("es-ES", {
    month: "long",
    year: "numeric",
  }).format(date);
  const periodJobs =
    rankingPeriod === "month"
      ? jobs.filter((job) => {
          const jobDate = new Date(getJobDate(job));
          return (
            Number.isFinite(jobDate.getTime()) &&
            jobDate.getMonth() === date.getMonth() &&
            jobDate.getFullYear() === date.getFullYear()
          );
        })
      : jobs;
  const periodLabel = rankingPeriod === "month" ? `este mes (${monthLabel})` : "en total";
  list.setAttribute(
    "aria-label",
    `Conductores con mayor distancia recorrida ${rankingPeriod === "month" ? "este mes" : "en total"}`,
  );

  const totals = new Map();
  for (const job of periodJobs) {
    if (!isCompletedJob(job)) {
      continue;
    }
    const driverInfo = job.driver || {};
    const driver = driverInfo.name;
    const distance = parseDistance(job.driven_distance_km ?? job.driven_distance);
    if (!driver || distance === undefined) {
      continue;
    }

    const current = totals.get(driver) || {
      distance: 0,
      jobs: 0,
      avatarUrl: getDriverAvatarUrl(driverInfo),
      isCurrentMember: getDriverMembership(driverInfo),
    };
    if (!current.avatarUrl) {
      current.avatarUrl = getDriverAvatarUrl(driverInfo);
    }
    const isCurrentMember = getDriverMembership(driverInfo);
    if (isCurrentMember !== undefined) {
      current.isCurrentMember = isCurrentMember;
    }
    current.distance += distance;
    current.jobs += 1;
    totals.set(driver, current);
  }

  const leaders = [...totals.entries()]
    .map(([name, values]) => ({ name, ...values }))
    .sort((first, second) => second.distance - first.distance);

  if (leaders.length === 0) {
    if (moreButton) {
      moreButton.hidden = true;
    }
    setText(
      "ranking-status",
      `Aún no hay rutas completadas con distancia para crear el top ${periodLabel}.`,
    );
    const empty = document.createElement("li");
    empty.className =
      "rounded-xl border border-white/10 bg-white/[0.03] px-5 py-6 text-sm text-zinc-400";
    empty.textContent =
      rankingPeriod === "month"
        ? `El top de ${monthLabel} aparecerá cuando Trucky publique rutas completadas este mes.`
        : "El top aparecerá cuando Trucky publique rutas completadas.";
    list.append(empty);
    return;
  }

  setText(
    "ranking-status",
    `${formatNumber(periodJobs.length)} trabajos completados ${periodLabel}.`,
  );
  if (moreButton) {
    moreButton.hidden = leaders.length <= 5;
    moreButton.textContent = expandedRankings[rankingPeriod] ? "Ver menos" : "Ver más";
    moreButton.setAttribute("aria-expanded", String(expandedRankings[rankingPeriod]));
  }
  const visibleLeaders = expandedRankings[rankingPeriod] ? leaders : leaders.slice(0, 5);
  visibleLeaders.forEach((leader, index) => {
    let rankStyle = "";
    let numberStyle = "";
    let badge = "";

    if (index === 0) {
      rankStyle =
        "border-yellow-400 bg-yellow-400/10 shadow-[0_0_15px_rgba(250,204,21,0.15)]";
      numberStyle = "text-yellow-500";
      badge = "👑 TOP 1";
    } else if (index === 1) {
      rankStyle = "border-slate-400 bg-slate-400/10";
      numberStyle = "text-slate-400";
      badge = "🥈 TOP 2";
    } else if (index === 2) {
      rankStyle = "border-[#b45309] bg-[#b45309]/10";
      numberStyle = "text-[#b45309]";
      badge = "🥉 TOP 3";
    } else {
      rankStyle = "border-white/10 bg-white/[0.02]";
      numberStyle = "text-zinc-500";
      badge = `# ${index + 1}`;
    }

    const item = document.createElement("li");
    item.className = `flex items-center justify-between gap-3 rounded-xl border p-4 transition-all hover:scale-[1.02] sm:gap-4 sm:p-5 ${rankStyle}`;

    const identity = document.createElement("div");
    identity.className = "flex min-w-0 items-center gap-3 sm:gap-4";

    const details = document.createElement("div");
    details.className = "min-w-0";
    const badgeLabel = createCell(
      `mb-0.5 text-[10px] font-black uppercase tracking-widest ${numberStyle}`,
      badge,
    );
    const name = createCell(
      "max-w-[140px] truncate text-lg font-bold text-white sm:max-w-[200px]",
      leader.name,
    );
    name.title = leader.name;
    const avatar = createDriverAvatar({ avatar_url: leader.avatarUrl }, "h-9 w-9");
    if (avatar) {
      identity.append(avatar);
    } else {
      const placeholderAvatar = document.createElement("div");
      placeholderAvatar.className =
        "hidden h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-[#111216] sm:flex";
      placeholderAvatar.setAttribute("aria-hidden", "true");
      const placeholderInitial = document.createElement("span");
      placeholderInitial.className = "text-xs font-bold text-zinc-500";
      placeholderInitial.textContent = "?";
      placeholderAvatar.append(placeholderInitial);
      identity.append(placeholderAvatar);
    }
    const driverStats = createCell(
      "mt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500",
      leader.jobs === 1
        ? `1 trabajo ${rankingPeriod === "month" ? "este mes" : "acumulado"}`
        : `${formatNumber(leader.jobs)} trabajos ${rankingPeriod === "month" ? "este mes" : "acumulados"}`,
    );
    details.append(badgeLabel, name, driverStats);
    if (rankingPeriod === "total" && leader.isCurrentMember !== undefined) {
      const membership = createCell(
        `mt-1 text-[10px] font-bold uppercase tracking-[0.12em] ${
          leader.isCurrentMember ? "text-emerald-400" : "text-zinc-500"
        }`,
        leader.isCurrentMember ? "Miembro actual" : "Exmiembro",
      );
      details.append(membership);
    }
    identity.append(details);

    const distanceDetails = document.createElement("div");
    distanceDetails.className = "shrink-0 text-right";
    distanceDetails.append(
      createCell("text-2xl font-black text-white", formatNumber(leader.distance)),
      createCell("mt-1 text-[10px] font-bold uppercase tracking-widest text-red-500", "Km"),
    );
    item.append(identity, distanceDetails);
    list.append(item);
  });
}

function setApiState(state, message) {
  const indicator = getElement("api-indicator");
  const status = getElement("api-status");
  const classByState = {
    connected: "h-2 w-2 rounded-full bg-emerald-400",
    loading: "h-2 w-2 animate-pulse rounded-full bg-amber-400",
    partial: "h-2 w-2 rounded-full bg-amber-400",
    error: "h-2 w-2 rounded-full bg-red-400",
  };
  const textClassByState = {
    connected: "text-emerald-400",
    loading: "text-amber-300",
    partial: "text-amber-300",
    error: "text-red-400",
  };

  if (indicator) {
    indicator.className = classByState[state] || classByState.error;
  }
  if (status) {
    status.textContent = message;
    status.className = `text-xs ${textClassByState[state] || textClassByState.error}`;
  }
}

function getRequestError(result) {
  return result.reason instanceof Error ? result.reason.message : "error de conexión desconocido";
}

function updateLastRefresh() {
  setText(
    "api-updated",
    `Actualizado: ${new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date())}`,
  );
}

let isLoading = false;

async function loadVtcData() {
  if (isLoading) {
    return;
  }
  isLoading = true;

  const refreshButton = getElement("refresh-data");
  if (refreshButton) {
    refreshButton.disabled = true;
    refreshButton.textContent = "Actualizando...";
  }
  setApiState("loading", "Conectando con Trucky...");

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 20000);
  const date = new Date();
  const statsPath = `/stats/monthly?${getMonthParameters(date)}`;

  try {
    const results = await Promise.allSettled([
      fetchJson("", controller.signal),
      fetchJson(statsPath, controller.signal),
      fetchAllCompanyJobs(controller.signal),
    ]);
    const [companyResult, statsResult, jobsResult] = results;
    const failures = [];

    if (companyResult.status === "fulfilled") {
      updateCompany(companyResult.value);
    } else {
      failures.push(`perfil de empresa: ${getRequestError(companyResult)}`);
    }

    if (statsResult.status === "fulfilled") {
      updateStatistics(statsResult.value);
    } else {
      failures.push(`estadísticas mensuales: ${getRequestError(statsResult)}`);
    }

    let jobs = [];
    if (jobsResult.status === "fulfilled") {
      jobs = jobsResult.value;
      jobs.sort((first, second) => {
        const firstDate = new Date(getJobDate(first) || 0).getTime();
        const secondDate = new Date(getJobDate(second) || 0).getTime();
        return secondDate - firstDate;
      });
      jobs = jobs.filter(isCompletedJob);
      updateLifetimeKilometers(jobs);
      renderJobs(jobs);
      renderDriverRanking(jobs, date);
    } else {
      failures.push(`historial de trabajos: ${getRequestError(jobsResult)}`);
      setText("stat-kilometers", "—");
      renderJobs([]);
      renderDriverRanking([], date);
    }

    updateLastRefresh();
    const monthLabel = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(
      date,
    );
    if (failures.length === 0) {
      setApiState(
        "connected",
        `Datos de Trucky actualizados · ${monthLabel}`,
      );
    } else if (failures.length < results.length) {
      setApiState("partial", `Datos parciales de Trucky; no se cargaron: ${failures.join(", ")}.`);
    } else {
      setApiState("error", `No se pudo consultar la VTC en Trucky (${failures.join(", ")}).`);
    }
  } catch (error) {
    const message =
      error instanceof DOMException && error.name === "AbortError"
        ? "La conexión con Trucky superó el tiempo de espera."
        : error instanceof Error
          ? error.message
          : "Error desconocido al consultar Trucky.";
    setApiState("error", `No se pudieron actualizar los datos: ${message}`);
  } finally {
    window.clearTimeout(timeoutId);
    isLoading = false;
    if (refreshButton) {
      refreshButton.disabled = false;
      refreshButton.textContent = "Actualizar datos";
    }
  }
}

setText("current-year", String(new Date().getFullYear()));
getElement("application-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!(form instanceof HTMLFormElement) || !form.reportValidity()) {
    return;
  }

  const submitButton = getElement("application-submit");
  const status = getElement("application-status");
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Enviando...";
  }
  if (status) {
    status.className = "mt-4 text-sm text-zinc-500";
    status.textContent = "Enviando tu postulación de forma segura...";
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch("https://formsubmit.co/ajax/toropesapsv@gmail.com", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(Object.fromEntries(new FormData(form))),
    });
    const responseText = await response.text();
    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      throw new Error("El servicio de correo devolvió una respuesta no válida.");
    }
    if (!response.ok) {
      throw new Error(`El servicio de correo respondió con el estado ${response.status}.`);
    }
    if (
      !result ||
      typeof result !== "object" ||
      (result.success !== true && result.success !== "true")
    ) {
      throw new Error(
        result && typeof result.message === "string"
          ? result.message
          : "El servicio de correo no pudo aceptar la postulación.",
      );
    }

    form.reset();
    if (status) {
      status.className = "mt-4 text-sm font-semibold text-emerald-500";
      status.textContent =
        "¡Postulación enviada! En breve, el lider te escribirá por whatsapp al número que enviaste.";
    }
  } catch (error) {
    if (status) {
      status.className = "mt-4 text-sm font-semibold text-red-400";
      status.textContent =
        error instanceof DOMException && error.name === "AbortError"
          ? "No se pudo enviar la postulación: el servicio de correo superó el tiempo de espera."
          : error instanceof Error
          ? `No se pudo enviar la postulación: ${error.message}`
          : "No se pudo enviar la postulación. Inténtalo de nuevo más tarde.";
    }
  } finally {
    window.clearTimeout(timeoutId);
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = "Enviar postulación";
    }
  }
});
getElement("ranking-more")?.addEventListener("click", () => {
  expandedRankings[rankingPeriod] = !expandedRankings[rankingPeriod];
  renderDriverRanking(rankingJobs, rankingDate);
});
document.querySelectorAll("[data-ranking-period]").forEach((button) => {
  button.addEventListener("click", () => {
    rankingPeriod = button.dataset.rankingPeriod === "total" ? "total" : "month";
    document.querySelectorAll("[data-ranking-period]").forEach((periodButton) => {
      const isSelected = periodButton === button;
      periodButton.setAttribute("aria-pressed", String(isSelected));
      periodButton.className = isSelected
        ? "rounded-lg border border-red-500 bg-red-500/15 px-4 py-2 text-xs font-black uppercase tracking-wider text-red-300 transition"
        : "rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-black uppercase tracking-wider text-zinc-400 transition hover:text-white";
    });
    renderDriverRanking(rankingJobs, rankingDate);
  });
});
const themeToggle = getElement("theme-toggle");
themeToggle?.addEventListener("click", () => {
  const isDark = document.body.dataset.theme !== "dark";
  document.body.dataset.theme = isDark ? "dark" : "light";
  themeToggle.textContent = isDark ? "Modo claro" : "Modo oscuro";
  themeToggle.setAttribute("aria-label", `Cambiar a modo ${isDark ? "claro" : "oscuro"}`);
  themeToggle.setAttribute("aria-pressed", String(isDark));
  const themeColor = document.querySelector('meta[name="theme-color"]');
  themeColor?.setAttribute("content", isDark ? "#090a0d" : "#f5f5f5");
});
getElement("refresh-data")?.addEventListener("click", loadVtcData);
loadVtcData();
window.setInterval(loadVtcData, REFRESH_INTERVAL);
loadLiveJobs();
window.setInterval(loadLiveJobs, LIVE_REFRESH_INTERVAL);

function initFleetGalleries() {
  const cards = [...document.querySelectorAll("[data-fleet-card]")];
  const lightbox = document.querySelector("[data-fleet-lightbox]");
  const lightboxImage = document.querySelector("[data-fleet-lightbox-image]");
  const lightboxTitle = document.getElementById("fleet-lightbox-title");
  const lightboxCounter = document.querySelector("[data-fleet-lightbox-counter]");
  if (!cards.length || !lightbox || !lightboxImage) return;

  let activeGallery;
  let activeIndex = 0;
  let lastFocusedElement;

  const getImages = (card) => (card.dataset.images || "").split("|").filter(Boolean);
  const updateCard = (gallery, index) => {
    gallery.index = (index + gallery.images.length) % gallery.images.length;
    const nextSrc = gallery.images[gallery.index];
    if (gallery.image.src.endsWith(nextSrc)) return;
    gallery.media.querySelectorAll(".fleet-image-leave").forEach((oldImage) => oldImage.remove());
    const outgoing = gallery.image;
    const incoming = new Image();
    incoming.className = "fleet-image-enter";
    incoming.alt = `${gallery.title}, foto ${gallery.index + 1}`;
    let transitionFinished = false;
    const finishTransition = () => {
      if (transitionFinished) return;
      transitionFinished = true;
      window.setTimeout(() => {
        incoming.classList.add("is-ready");
        outgoing.classList.add("fleet-image-leave", "is-leaving");
        window.setTimeout(() => outgoing.remove(), 650);
      }, 16);
    };
    incoming.addEventListener("load", finishTransition, { once: true });
    incoming.src = nextSrc;
    if (incoming.complete) finishTransition();
    else window.setTimeout(finishTransition, 80);
    gallery.media.append(incoming);
    gallery.image = incoming;
    gallery.counter.textContent = `${gallery.index + 1} / ${gallery.images.length}`;
    gallery.dots.forEach((dot, dotIndex) => dot.classList.toggle("is-active", dotIndex === gallery.index));
  };
  const showLightbox = (gallery, index) => {
    activeGallery = gallery;
    activeIndex = (index + gallery.images.length) % gallery.images.length;
    lightboxImage.src = gallery.images[activeIndex];
    lightboxImage.alt = `${gallery.title}, foto ${activeIndex + 1}`;
    lightboxTitle.textContent = gallery.title;
    lightboxCounter.textContent = `${activeIndex + 1} / ${gallery.images.length}`;
    lightbox.hidden = false;
    document.body.classList.add("overflow-hidden");
    lastFocusedElement = document.activeElement;
    lightbox.querySelector(".fleet-lightbox-close")?.focus();
  };
  const closeLightbox = () => {
    lightbox.hidden = true;
    document.body.classList.remove("overflow-hidden");
    lastFocusedElement?.focus?.();
  };
  const moveLightbox = (step) => {
    if (!activeGallery) return;
    activeIndex = (activeIndex + step + activeGallery.images.length) % activeGallery.images.length;
    lightboxImage.src = activeGallery.images[activeIndex];
    lightboxImage.alt = `${activeGallery.title}, foto ${activeIndex + 1}`;
    lightboxCounter.textContent = `${activeIndex + 1} / ${activeGallery.images.length}`;
  };

  cards.forEach((card) => {
    const images = getImages(card);
    const image = card.querySelector(".fleet-media img");
    const media = card.querySelector(".fleet-media");
    const counter = card.querySelector(".fleet-counter");
    const dotsContainer = card.querySelector(".fleet-dots");
    const gallery = { card, media, images, image, counter, title: card.dataset.title || "Galería", index: 0, dots: [] };
    if (!image || !counter || !images.length) return;

    gallery.dots = images.map((_, index) => {
      const dot = document.createElement("span");
      dot.className = index === 0 ? "is-active" : "";
      dotsContainer?.append(dot);
      return dot;
    });
    const move = (step) => {
      updateCard(gallery, gallery.index + step);
      restartTimer();
    };
    card.querySelector(".fleet-prev")?.addEventListener("click", () => move(-1));
    card.querySelector(".fleet-next")?.addEventListener("click", () => move(1));
    card.querySelector(".fleet-zoom")?.addEventListener("click", () => showLightbox(gallery, gallery.index));
    card.addEventListener("mouseenter", () => window.clearInterval(gallery.timer));
    card.addEventListener("mouseleave", restartTimer);
    card.addEventListener("focusin", () => window.clearInterval(gallery.timer));
    card.addEventListener("focusout", (event) => { if (!card.contains(event.relatedTarget)) restartTimer(); });
    function restartTimer() {
      window.clearInterval(gallery.timer);
      if (images.length > 1) gallery.timer = window.setInterval(() => updateCard(gallery, gallery.index + 1), 4500);
    }
    restartTimer();
  });

  lightbox.querySelector(".fleet-lightbox-close")?.addEventListener("click", closeLightbox);
  lightbox.querySelector(".fleet-lightbox-prev")?.addEventListener("click", () => moveLightbox(-1));
  lightbox.querySelector(".fleet-lightbox-next")?.addEventListener("click", () => moveLightbox(1));
  lightbox.addEventListener("click", (event) => { if (event.target === lightbox) closeLightbox(); });
  document.addEventListener("keydown", (event) => {
    if (lightbox.hidden) return;
    if (event.key === "Escape") closeLightbox();
    if (event.key === "ArrowLeft") moveLightbox(-1);
    if (event.key === "ArrowRight") moveLightbox(1);
  });
}

function initSiteNotice() {
  const notice = getElement("site-notice");
  const dismissButton = getElement("site-notice-dismiss");
  if (!notice || !dismissButton) return;

  dismissButton.focus({ preventScroll: true });
  const close = () => {
    notice.classList.add("is-closing");
    window.setTimeout(() => {
      notice.hidden = true;
      notice.classList.remove("is-closing");
    }, 220);
  };

  dismissButton.addEventListener("click", close);
  notice.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });
}

initFleetGalleries();
initSiteNotice();
