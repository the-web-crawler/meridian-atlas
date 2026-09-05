import { METRICS, COUNTRIES } from "./data.js";

const WORLD_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json";
const NODATA = "#1c262e";
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const state = {
  metric: "gdp",
  selected: null,
  hover: null,
  world: null,
  features: [],
  color: null,
  projection: d3.geoEqualEarth(),
  path: null,
  zoom: null,
  width: 0,
  height: 0,
};

const el = {
  svg: d3.select("#map"),
  tooltip: document.getElementById("tooltip"),
  panel: document.getElementById("panel"),
  metrics: document.getElementById("metrics"),
  search: document.getElementById("search"),
  results: document.getElementById("search-results"),
  loader: document.getElementById("loader"),
  status: document.getElementById("status"),
  legendTitle: document.getElementById("legend-title"),
  legendBar: document.getElementById("legend-bar"),
  legendMin: document.getElementById("legend-min"),
  legendMax: document.getElementById("legend-max"),
};

const gRoot = el.svg.append("g").attr("class", "viewport");
const gMap = gRoot.append("g").attr("class", "map-layer");

function padId(id) {
  return String(id ?? "").padStart(3, "0");
}
function rec(id) {
  return COUNTRIES[padId(id)] || null;
}
function val(id, metric = state.metric) {
  const r = rec(id);
  if (!r) return null;
  const v = r[metric];
  return v == null ? null : v;
}
function metricDef(id = state.metric) {
  return METRICS.find((m) => m.id === id);
}
function formatVal(v, metric = state.metric) {
  if (v == null) return "No data";
  const m = metricDef(metric);
  if (metric === "pop") {
    if (v >= 1e9) return (v / 1e9).toFixed(2) + " billion";
    if (v >= 1e6) return (v / 1e6).toFixed(v >= 1e8 ? 0 : 1) + " million";
    if (v >= 1e3) return Math.round(v / 1e3) + " thousand";
    return d3.format(",")(v);
  }
  if (metric === "gdp") return "$" + d3.format(",.0f")(v);
  if (metric === "life") return v.toFixed(1) + " years";
  if (metric === "hdi") return v.toFixed(3);
  if (metric === "co2") return v.toFixed(v >= 10 ? 1 : 2) + " t";
  if (metric === "net") return v + "%";
  return String(v) + (m?.unit ? " " + m.unit : "");
}
function compact(v, metric) {
  if (v == null) return "\u2014";
  if (metric === "pop") {
    if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
    if (v >= 1e6) return (v / 1e6).toFixed(v >= 1e8 ? 0 : 1) + "M";
    return d3.format(",.3s")(v).replace("G", "B");
  }
  if (metric === "gdp") return "$" + d3.format(",.3s")(v).replace("G", "B");
  if (metric === "hdi") return v.toFixed(3);
  if (metric === "life") return v.toFixed(1);
  if (metric === "co2") return v.toFixed(1) + "t";
  if (metric === "net") return v + "%";
  return String(v);
}
function ranked(metric = state.metric) {
  return state.features
    .map((f) => ({ f, v: val(f.id, metric) }))
    .filter((d) => d.v != null)
    .sort((a, b) => b.v - a.v);
}
function rankOf(id, metric = state.metric) {
  const list = ranked(metric);
  const i = list.findIndex((d) => padId(d.f.id) === padId(id));
  return i === -1 ? null : { place: i + 1, total: list.length };
}

function buildColor() {
  const m = metricDef();
  const values = state.features.map((f) => val(f.id)).filter((v) => v != null && v > 0);
  const min = d3.min(values) ?? 0;
  const max = d3.max(values) ?? 1;
  const interp = d3.interpolateRgbBasis(m.colors);
  if (m.log) {
    state.color = d3.scaleSequentialLog(interp).domain([Math.max(min, 1e-6), max]);
  } else {
    state.color = d3.scaleSequential(interp).domain([min, max]);
  }
  state.extent = [min, max];
}

function paint() {
  buildColor();
  gMap
    .selectAll(".country")
    .attr("class", (d) => {
      const cls = ["country"];
      if (val(d.id) == null) cls.push("nodata");
      if (state.selected && padId(d.id) === padId(state.selected)) cls.push("is-selected");
      return cls.join(" ");
    })
    .transition()
    .duration(reduced ? 0 : 420)
    .attr("fill", (d) => {
      const v = val(d.id);
      return v == null ? NODATA : state.color(v);
    });
  drawLegend();
  if (state.selected) renderPanel(state.selected);
}

function drawLegend() {
  const m = metricDef();
  el.legendTitle.textContent = m.label;
  el.legendBar.style.background = `linear-gradient(90deg, ${m.colors.join(",")})`;
  el.legendMin.textContent = formatVal(state.extent[0]);
  el.legendMax.textContent = formatVal(state.extent[1]);
}

function size() {
  const node = document.getElementById("stage");
  const { width, height } = node.getBoundingClientRect();
  state.width = Math.max(320, width);
  state.height = Math.max(240, height);
  el.svg.attr("viewBox", `0 0 ${state.width} ${state.height}`).attr("width", state.width).attr("height", state.height);
  const pad = state.width < 720 ? 8 : 28;
  state.projection.fitExtent(
    [
      [pad, pad + 8],
      [state.width - pad, state.height - pad],
    ],
    { type: "Sphere" }
  );
  state.path = d3.geoPath(state.projection);
  gMap.selectAll("path").attr("d", state.path);
}

function showTip(event, feature) {
  const r = rec(feature.id);
  const v = val(feature.id);
  const rk = rankOf(feature.id);
  el.tooltip.innerHTML = `
    <div class="name">${feature.properties.name}</div>
    <div class="val">${formatVal(v)}</div>
    <div class="meta">${rk ? `Rank ${rk.place} of ${rk.total}` : "No sample data"}${r ? " \u00b7 " + r.region : ""}</div>`;
  el.tooltip.classList.add("show");
  moveTip(event);
}
function moveTip(event) {
  const stage = document.getElementById("stage").getBoundingClientRect();
  const x = event.clientX - stage.left;
  const y = event.clientY - stage.top;
  const tw = el.tooltip.offsetWidth || 180;
  const th = el.tooltip.offsetHeight || 70;
  const left = Math.min(stage.width - tw - 8, Math.max(8, x + 14));
  const top = Math.min(stage.height - th - 8, Math.max(8, y - th - 12));
  el.tooltip.style.left = left + "px";
  el.tooltip.style.top = top + "px";
}
function hideTip() {
  el.tooltip.classList.remove("show");
}

function selectCountry(id, fly = true) {
  state.selected = id ? padId(id) : null;
  gMap.selectAll(".country").classed("is-selected", (d) => state.selected && padId(d.id) === state.selected);
  if (!state.selected) {
    el.panel.classList.remove("open");
    el.panel.setAttribute("aria-hidden", "true");
    return;
  }
  renderPanel(state.selected);
  el.panel.classList.add("open");
  el.panel.setAttribute("aria-hidden", "false");
  if (fly) {
    const f = state.features.find((d) => padId(d.id) === state.selected);
    if (f) flyTo(f);
  }
}

function flyTo(feature) {
  const bounds = state.path.bounds(feature);
  const dx = Math.max(bounds[1][0] - bounds[0][0], 1);
  const dy = Math.max(bounds[1][1] - bounds[0][1], 1);
  const x = (bounds[0][0] + bounds[1][0]) / 2;
  const y = (bounds[0][1] + bounds[1][1]) / 2;
  const scale = Math.max(1, Math.min(7, 0.62 / Math.max(dx / state.width, dy / state.height)));
  const tx = state.width / 2 - scale * x;
  const ty = state.height / 2 - scale * y;
  el.svg.transition().duration(reduced ? 0 : 780).call(
    state.zoom.transform,
    d3.zoomIdentity.translate(tx, ty).scale(scale)
  );
}

function renderPanel(id) {
  const feature = state.features.find((d) => padId(d.id) === padId(id));
  const r = rec(id);
  const name = feature?.properties.name ?? "Unknown";
  const m = metricDef();
  const v = val(id);
  const rk = rankOf(id);
  const body = document.getElementById("panel-body");
  document.getElementById("panel-name").textContent = name;
  document.getElementById("panel-region").textContent = r?.region ?? "Territory";

  const bars = METRICS.map((metric) => {
    const mv = r ? r[metric.id] : null;
    const values = state.features.map((f) => val(f.id, metric.id)).filter((x) => x != null);
    const max = d3.max(values) || 1;
    const pct = mv == null ? 0 : Math.max(4, (mv / max) * 100);
    const rkM = rankOf(id, metric.id);
    return `
      <div class="bar-row">
        <span class="k">${metric.short}</span>
        <span class="v">${compact(mv, metric.id)}${rkM ? ` \u00b7 #${rkM.place}` : ""}</span>
        <div class="track"><span style="width:${pct}%"></span></div>
      </div>`;
  }).join("");

  body.innerHTML = `
    <div class="hero-stat">
      <div class="label">${m.label}</div>
      <div class="num">${formatVal(v)}</div>
      <div class="rank">${rk ? `Rank ${rk.place} of ${rk.total} with data` : "Not in the sample set"}</div>
    </div>
    <div class="bars">${bars}</div>
    <dl class="facts">
      <div class="fact"><dt>ISO numeric</dt><dd>${padId(id)}</dd></div>
      <div class="fact"><dt>Region</dt><dd>${r?.region ?? "\u2014"}</dd></div>
    </dl>
    <p class="panel-foot">Bars show each figure relative to the highest country in the sample. Figures are compiled sample values, circa 2023\u201324 \u2014 not an official release.</p>`;
}

function renderMetricSwitcher() {
  el.metrics.innerHTML = "";
  for (const m of METRICS) {
    const b = document.createElement("button");
    b.className = "metric";
    b.type = "button";
    b.textContent = m.short;
    b.setAttribute("aria-pressed", String(m.id === state.metric));
    b.addEventListener("click", () => {
      state.metric = m.id;
      for (const n of el.metrics.children) n.setAttribute("aria-pressed", String(n === b));
      paint();
      el.status.textContent = m.hint;
    });
    el.metrics.appendChild(b);
  }
}

function bindSearch() {
  const list = () =>
    state.features
      .map((f) => ({ id: padId(f.id), name: f.properties.name, region: rec(f.id)?.region }))
      .sort((a, b) => a.name.localeCompare(b.name));

  function render(q) {
    const items = list().filter((d) => d.name.toLowerCase().includes(q.toLowerCase())).slice(0, 12);
    el.results.innerHTML = items
      .map(
        (d, i) =>
          `<button class="search-item" role="option" data-id="${d.id}" aria-selected="${i === 0}">${d.name}${d.region ? `<small>${d.region}</small>` : ""}</button>`
      )
      .join("");
    el.results.classList.toggle("open", q.length > 0 && items.length > 0);
  }
  el.search.addEventListener("input", () => render(el.search.value.trim()));
  el.search.addEventListener("focus", () => {
    if (el.search.value.trim()) render(el.search.value.trim());
  });
  el.search.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const first = el.results.querySelector("[data-id]");
      if (first) {
        selectCountry(first.dataset.id);
        el.results.classList.remove("open");
        el.search.blur();
      }
    }
    if (e.key === "Escape") {
      el.results.classList.remove("open");
      el.search.blur();
    }
  });
  el.results.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-id]");
    if (!btn) return;
    selectCountry(btn.dataset.id);
    el.search.value = "";
    el.results.classList.remove("open");
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search")) el.results.classList.remove("open");
  });
}

function bindChrome() {
  document.getElementById("close-panel").addEventListener("click", () => selectCountry(null));
  document.getElementById("zoom-in").addEventListener("click", () => el.svg.transition().duration(280).call(state.zoom.scaleBy, 1.4));
  document.getElementById("zoom-out").addEventListener("click", () => el.svg.transition().duration(280).call(state.zoom.scaleBy, 1 / 1.4));
  document.getElementById("zoom-reset").addEventListener("click", () => {
    el.svg.transition().duration(500).call(state.zoom.transform, d3.zoomIdentity);
    selectCountry(null);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") selectCountry(null);
  });
}

async function boot() {
  renderMetricSwitcher();
  bindSearch();
  bindChrome();

  const world = await d3.json(WORLD_URL);
  state.world = world;
  state.features = topojson.feature(world, world.objects.countries).features;

  state.zoom = d3
    .zoom()
    .scaleExtent([1, 12])
    .on("zoom", (event) => {
      gRoot.attr("transform", event.transform);
      gMap.selectAll(".country").attr("stroke-width", 0.4 / event.transform.k);
      gMap.selectAll(".country.is-hover, .country.is-selected").attr("stroke-width", 1.2 / event.transform.k);
    });
  el.svg.call(state.zoom);

  size();

  gMap.append("path").datum({ type: "Sphere" }).attr("class", "ocean").attr("d", state.path);
  gMap.append("path").datum(d3.geoGraticule10()).attr("class", "graticule").attr("d", state.path);

  gMap
    .selectAll(".country")
    .data(state.features)
    .join("path")
    .attr("class", (d) => (val(d.id) == null ? "country nodata" : "country"))
    .attr("d", state.path)
    .on("pointerenter", function (event, d) {
      d3.select(this).classed("is-hover", true).raise();
      showTip(event, d);
    })
    .on("pointermove", (event) => moveTip(event))
    .on("pointerleave", function () {
      d3.select(this).classed("is-hover", false);
      hideTip();
    })
    .on("click", (event, d) => {
      event.stopPropagation();
      selectCountry(d.id, true);
    });

  el.svg.on("click", () => selectCountry(null));

  paint();
  el.loader.classList.add("hide");
  el.status.textContent = metricDef().hint + " \u00b7 drag to pan, scroll to zoom";

  new ResizeObserver(() => {
    const t = d3.zoomTransform(el.svg.node());
    size();
    el.svg.call(state.zoom.transform, t);
  }).observe(document.getElementById("stage"));
}

boot().catch((err) => {
  el.loader.querySelector("p").textContent = "Could not load the world map.";
  console.error(err);
});
