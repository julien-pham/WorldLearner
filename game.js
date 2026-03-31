// Game page (map click only)
const API_COUNTRIES =
  "https://restcountries.com/v3.1/all?fields=name,cca3,region,subregion,capital,flags,population";
const WORLD_GEOJSON =
  "https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson";

const $ = (id) => document.getElementById(id);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const now = () => performance.now();

function normalizeName(name) {
  return (name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s'-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const NAME_ALIASES = new Map([
  ["united states", "united states of america"],
  ["usa", "united states of america"],
  ["russia", "russian federation"],
  ["iran", "iran (islamic republic of)"],
  ["syria", "syrian arab republic"],
  ["venezuela", "venezuela (bolivarian republic of)"],
  ["tanzania", "tanzania, united republic of"],
  ["bolivia", "bolivia (plurinational state of)"],
  ["moldova", "moldova, republic of"],
  ["laos", "lao people's democratic republic"],
  ["vietnam", "viet nam"],
  ["brunei", "brunei darussalam"],
  ["czechia", "czech republic"],
  ["ivory coast", "cote d'ivoire"],
  ["congo", "congo"],
  ["republic of the congo", "congo"],
  ["democratic republic of the congo", "congo (democratic republic of the)"],
  ["south korea", "korea (republic of)"],
  ["north korea", "korea (democratic people's republic of)"],
  ["cape verde", "cabo verde"],
  ["swaziland", "eswatini"],
  ["myanmar", "myanmar"],
  ["palestine", "palestine, state of"],
  ["macedonia", "north macedonia"],
  ["the bahamas", "bahamas"],
  ["the gambia", "gambia"],
  ["united kingdom", "united kingdom of great britain and northern ireland"],
  ["uk", "united kingdom of great britain and northern ireland"],
]);

function canon(name) {
  const n = normalizeName(name);
  return NAME_ALIASES.get(n) || n;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function scoreForRound({ correct, ms, streak }) {
  if (!correct) return 0;
  const t = clamp(ms / 1000, 0, 20);
  const timeBonus = Math.round(200 * (1 - t / 20));
  const streakBonus = Math.round(clamp(streak, 0, 10) * 20);
  return Math.max(80, 300 + timeBonus + streakBonus);
}

function setTopStats({ score, streak, high }) {
  $("pillScore").textContent = String(score);
  $("pillStreak").textContent = String(streak);
  $("pillHigh").textContent = String(high);
}

function storageGetHigh() {
  const v = Number(localStorage.getItem("wl_high") || "0");
  return Number.isFinite(v) ? v : 0;
}
function storageSetHigh(v) {
  localStorage.setItem("wl_high", String(v));
}

async function fetchJSON(url) {
  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return await res.json();
}

function safeCountryLabel(c) {
  return c?.name?.common || c?.name?.official || c?.cca3 || "Unknown";
}

function projectLonLat(lon, lat) {
  const x = ((lon + 180) / 360) * 1000;
  const y = ((90 - lat) / 180) * 520;
  return [x, y];
}

const REGION_BOUNDS = {
  Europe: { lon: [-30, 50], lat: [30, 74] },
  Africa: { lon: [-25, 55], lat: [-40, 38] },
  Asia: { lon: [25, 180], lat: [-10, 80] },
  Americas: { lon: [-170, -30], lat: [-60, 80] },
  Oceania: { lon: [110, 180], lat: [-50, 20] },
};

function bboxFromRegion(region) {
  const b = REGION_BOUNDS[region];
  if (!b) return null;
  const [lon0, lon1] = b.lon;
  const [lat0, lat1] = b.lat;
  const corners = [
    projectLonLat(lon0, lat0),
    projectLonLat(lon0, lat1),
    projectLonLat(lon1, lat0),
    projectLonLat(lon1, lat1),
  ];
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const x2 = Math.max(...xs);
  const y2 = Math.max(...ys);
  return { x, y, width: x2 - x, height: y2 - y };
}

function svgPathFromGeo(coords) {
  const polyToPath = (ring) => {
    let d = "";
    for (let i = 0; i < ring.length; i++) {
      const [x, y] = projectLonLat(ring[i][0], ring[i][1]);
      d += (i === 0 ? "M" : "L") + x.toFixed(2) + "," + y.toFixed(2);
    }
    return d + "Z";
  };

  let d = "";
  if (!Array.isArray(coords)) return d;
  if (coords.length && typeof coords[0][0][0] === "number") {
    for (const ring of coords) d += polyToPath(ring);
    return d;
  }
  for (const poly of coords) for (const ring of poly) d += polyToPath(ring);
  return d;
}

function renderMap(svg, geojson) {
  svg.innerHTML = "";
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  g.setAttribute("transform", "translate(0,0)");
  svg.appendChild(g);

  for (const f of geojson.features) {
    const name = f?.properties?.name || "";
    const geom = f?.geometry;
    if (!name || !geom) continue;
    const d = svgPathFromGeo(geom.coordinates);
    if (!d) continue;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    path.setAttribute("class", "country");
    path.setAttribute("data-name", canon(name));
    g.appendChild(path);
  }
  return g;
}

function quantKey([lon, lat], digits = 1) {
  const f = Math.pow(10, digits);
  const a = Math.round(lon * f) / f;
  const b = Math.round(lat * f) / f;
  return `${a},${b}`;
}

function buildAdjacencyFromGeoJSON(geojson) {
  const pointToNames = new Map();
  const names = [];

  function addPoint(name, lonlat) {
    const k = quantKey(lonlat, 1);
    let set = pointToNames.get(k);
    if (!set) {
      set = new Set();
      pointToNames.set(k, set);
    }
    set.add(name);
  }

  function walkCoords(name, coords) {
    if (!Array.isArray(coords)) return;
    if (coords.length && typeof coords[0][0][0] === "number") {
      for (const ring of coords) for (const p of ring) addPoint(name, p);
      return;
    }
    for (const poly of coords) for (const ring of poly) for (const p of ring) addPoint(name, p);
  }

  for (const f of geojson.features) {
    const raw = f?.properties?.name;
    const name = canon(raw);
    const geom = f?.geometry;
    if (!name || !geom) continue;
    names.push(name);
    walkCoords(name, geom.coordinates);
  }

  const sharedCounts = new Map();
  for (const set of pointToNames.values()) {
    const arr = Array.from(set);
    if (arr.length < 2) continue;
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i];
        const b = arr[j];
        const k = a < b ? `${a}|${b}` : `${b}|${a}`;
        sharedCounts.set(k, (sharedCounts.get(k) || 0) + 1);
      }
    }
  }

  const neighbors = new Map();
  for (const n of names) neighbors.set(n, new Set());
  for (const [k, cnt] of sharedCounts.entries()) {
    if (cnt < 6) continue;
    const [a, b] = k.split("|");
    neighbors.get(a)?.add(b);
    neighbors.get(b)?.add(a);
  }
  return neighbors;
}

function transformToFitBBox({ bbox, viewW = 1000, viewH = 520, pad = 16 }) {
  if (!bbox || bbox.width <= 0 || bbox.height <= 0) return { s: 1, tx: 0, ty: 0 };
  const bw = bbox.width + pad * 2;
  const bh = bbox.height + pad * 2;
  const s = Math.min(viewW / bw, viewH / bh);
  const cx = bbox.x + bbox.width / 2;
  const cy = bbox.y + bbox.height / 2;
  const tx = viewW / 2 - cx * s;
  const ty = viewH / 2 - cy * s;
  return { s, tx, ty };
}

function animateTransform(g, from, to, ms = 420) {
  const start = now();
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  function frame() {
    const t = clamp((now() - start) / ms, 0, 1);
    const k = ease(t);
    const s = from.s + (to.s - from.s) * k;
    const tx = from.tx + (to.tx - from.tx) * k;
    const ty = from.ty + (to.ty - from.ty) * k;
    g.setAttribute("transform", `translate(${tx.toFixed(2)},${ty.toFixed(2)}) scale(${s.toFixed(4)})`);
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function buildCountryIndex(countries) {
  const byName = new Map();
  for (const c of countries) {
    const common = c?.name?.common;
    const official = c?.name?.official;
    const n1 = canon(common);
    const n2 = canon(official);
    if (n1) byName.set(n1, c);
    if (n2) byName.set(n2, c);
  }
  return byName;
}

function continentFilter(regionSel) {
  if (!regionSel || regionSel === "All") return () => true;
  return (c) => (c?.region || "") === regionSel;
}

function clearMapClasses(svg) {
  const nodes = svg.querySelectorAll(".country");
  for (const n of nodes) n.classList.remove("correct", "wrong", "focused", "near", "correct-answer");
}
function clearMapTransientClasses(svg) {
  const nodes = svg.querySelectorAll(".country");
  for (const n of nodes) n.classList.remove("correct", "wrong", "focused");
}

function setMapDimmed(svg, allowedNameSet) {
  const nodes = svg.querySelectorAll(".country");
  for (const n of nodes) {
    const nm = n.getAttribute("data-name") || "";
    n.classList.toggle("dim", allowedNameSet && !allowedNameSet.has(nm));
  }
}

function main() {
  const params = new URLSearchParams(location.search);
  const settings = {
    continent: params.get("continent") || "All",
    count: params.get("count") || "10",
    difficulty: params.get("difficulty") || "normal",
  };
  const subtitle = `${settings.continent} • ${settings.difficulty === "learning" ? "Learning" : "Normal"} • ${
    settings.count
  }`;
  $("subTitle").textContent = subtitle;
  $("kicker").textContent = subtitle;

  const state = {
    settings,
    pool: [],
    rounds: [],
    idx: 0,
    score: 0,
    streak: 0,
    bestStreak: 0,
    correct: 0,
    roundStartMs: 0,
    timerHandle: null,
    high: storageGetHigh(),
    totalGuessMs: 0,
    guessCount: 0,
    lastRoundPoints: 0,
    lastPicked: null,
    allowedMapNames: null,
    mapNameToCountry: new Map(),
    mapNameToNeighbors: new Map(),
    g: null,
    tf: { s: 1, tx: 0, ty: 0 },
    lastSettings: settings,
    phase: "loading",
  };

  setTopStats({ score: 0, streak: 0, high: state.high });

  function updateHUD() {
    setTopStats({ score: state.score, streak: state.streak, high: state.high });
    $("roundIdx").textContent = String(state.idx + 1);
    $("roundTotal").textContent = String(state.rounds.length);
    const avg = state.guessCount ? state.totalGuessMs / state.guessCount / 1000 : 0;
    $("avgTime").textContent = state.guessCount ? avg.toFixed(1) : "—";
  }

  function startTimer() {
    state.roundStartMs = now();
    $("time").textContent = "0.0";
    clearInterval(state.timerHandle);
    state.timerHandle = setInterval(() => {
      const t = (now() - state.roundStartMs) / 1000;
      $("time").textContent = t.toFixed(1);
    }, 90);
  }
  function stopTimer() {
    clearInterval(state.timerHandle);
    state.timerHandle = null;
  }

  function setPicked(country) {
    state.lastPicked = country || null;
    const wrap = $("picked");
    if (!country) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    const url = country?.flags?.png || country?.flags?.svg || "";
    $("pickedFlag").src = url;
    $("pickedFlag").alt = country?.flags?.alt || `Flag of ${safeCountryLabel(country)}`;
    $("pickedName").textContent = safeCountryLabel(country);
  }

  function applyLearningHighlight(activeNames, answerCountry) {
    if (state.settings.difficulty !== "learning") return;
    const active = activeNames || new Set();
    const targetName =
      state.mapNameToCountry.has(canon(answerCountry?.name?.common))
        ? canon(answerCountry?.name?.common)
        : state.mapNameToCountry.has(canon(answerCountry?.name?.official))
          ? canon(answerCountry?.name?.official)
          : null;
    if (!targetName) return;
    const direct = state.mapNameToNeighbors.get(targetName) || new Set();
    const near = new Set();
    for (const nm of direct) if (active.has(nm)) near.add(nm);
    if (active.has(targetName)) near.add(targetName);
    if (near.size < 4) {
      for (const n1 of direct) {
        const n2s = state.mapNameToNeighbors.get(n1);
        if (!n2s) continue;
        for (const n2 of n2s) if (active.has(n2) && n2 !== targetName) near.add(n2);
        if (near.size >= 7) break;
      }
    }
    for (const n of document.querySelectorAll(".country")) {
      const nm = n.getAttribute("data-name") || "";
      n.classList.toggle("near", near.has(nm));
    }
  }

  function beginRound() {
    state.phase = "playing";
    state.lastRoundPoints = 0;
    $("roundPoints").textContent = "0";
    clearMapClasses($("map"));

    const ans = state.rounds[state.idx];
    $("targetName").textContent = safeCountryLabel(ans);
    const flagUrl = ans?.flags?.png || ans?.flags?.svg || "";
    $("flagImg").src = flagUrl;
    $("flagImg").alt = ans?.flags?.alt || `Flag of ${safeCountryLabel(ans)}`;

    let activeNames = state.allowedMapNames;
    if (state.settings.continent === "All") {
      const region = ans?.region || "All";
      const regionNames = new Set();
      for (const [nm, c] of state.mapNameToCountry.entries()) if ((c?.region || "") === region) regionNames.add(nm);
      activeNames = regionNames;
      const bb = bboxFromRegion(region);
      if (bb) {
        const to = transformToFitBBox({ bbox: bb, pad: 18 });
        animateTransform(state.g, state.tf, to, 460);
        state.tf = to;
      }
    } else {
      const bb = bboxFromRegion(state.settings.continent);
      if (bb) {
        const to = transformToFitBBox({ bbox: bb, pad: 18 });
        animateTransform(state.g, state.tf, to, 460);
        state.tf = to;
      }
    }

    setMapDimmed($("map"), activeNames);
    applyLearningHighlight(activeNames, ans);
    updateHUD();
    startTimer();
  }

  function endRound({ correct, message, picked }) {
    stopTimer();
    const ms = now() - state.roundStartMs;
    state.totalGuessMs += ms;
    state.guessCount += 1;
    const pts = scoreForRound({ correct, ms, streak: state.streak });
    state.lastRoundPoints = pts;

    if (correct) {
      state.score += pts;
      state.streak += 1;
      state.bestStreak = Math.max(state.bestStreak, state.streak);
      state.correct += 1;
      $("feedback").classList.remove("bad");
      $("feedback").classList.add("good");
      $("feedback").textContent = message || `Correct! +${pts} pts`;
    } else {
      state.streak = 0;
      $("feedback").classList.remove("good");
      $("feedback").classList.add("bad");
      $("feedback").textContent = message || "Wrong.";
    }

    if (state.score > state.high) {
      state.high = state.score;
      storageSetHigh(state.high);
    }
    updateHUD();

    state.phase = "between";
    const ans = state.rounds[state.idx];

    const correctEl = document.querySelector(
      `.country[data-name="${canon(ans?.name?.common || ans?.name?.official)}"]`
    );

    if (correctEl && !correct) {
      correctEl.classList.add("correct-answer");
    }
    setTimeout(() => {
      state.idx += 1;
      if (state.idx >= state.rounds.length) endSession();
      else beginRound();
    }, correct ? 650 : 900);
  }

  function endSession() {
    state.phase = "done";
    stopTimer();
    $("btnSkip").hidden = true;
    $("btnEnd").hidden = true;
    $("btnPlayAgain").hidden = false;
    $("feedback").classList.remove("good", "bad");
    $("feedback").textContent = `Finished — score ${state.score}, best streak ${state.bestStreak}.`;
  }

  $("btnSkip").addEventListener("click", () => {
    if (state.phase !== "playing") return;
    const ans = state.rounds[state.idx];
    endRound({ correct: false, message: `Skipped — answer: ${safeCountryLabel(ans)}.` });
  });
  $("btnEnd").addEventListener("click", () => {
    if (state.phase !== "playing" && state.phase !== "between") return;
    endSession();
  });
  $("btnPlayAgain").addEventListener("click", () => {
    const params2 = new URLSearchParams(state.lastSettings);
    window.location.href = `./game.html?${params2.toString()}`;
  });

  Promise.all([fetchJSON(API_COUNTRIES), fetchJSON(WORLD_GEOJSON)])
    .then(([countries, geojson]) => {
      const allCountries = (countries || []).filter((c) => c?.name?.common && c?.cca3 && c?.region);
      state.pool = allCountries.filter(continentFilter(settings.continent));
      if (state.pool.length < 10) state.pool = allCountries.slice();

      // build map join
      const byName = buildCountryIndex(allCountries);
      for (const f of geojson.features) {
        const nm = canon(f?.properties?.name);
        if (!nm) continue;
        const c = byName.get(nm);
        if (c) state.mapNameToCountry.set(nm, c);
      }
      state.mapNameToNeighbors = buildAdjacencyFromGeoJSON(geojson);

      const svg = $("map");
      state.g = renderMap(svg, geojson);

      // restrict playable targets to joinable countries
      const allowed = new Set();
      for (const c of state.pool) {
        const n1 = canon(c?.name?.common);
        const n2 = canon(c?.name?.official);
        if (state.mapNameToCountry.has(n1)) allowed.add(n1);
        else if (state.mapNameToCountry.has(n2)) allowed.add(n2);
      }
      state.allowedMapNames = allowed;
      const joinable = [];
      for (const c of state.pool) {
        const n1 = canon(c?.name?.common);
        const n2 = canon(c?.name?.official);
        if (allowed.has(n1) || allowed.has(n2)) joinable.push(c);
      }
      state.pool = joinable;
      const roundCount = settings.count === "all" ? state.pool.length : Number(settings.count);
      state.rounds = shuffle(state.pool).slice(0, roundCount);
      state.idx = 0;
      state.score = 0;
      state.streak = 0;
      state.bestStreak = 0;
      state.correct = 0;
      state.totalGuessMs = 0;
      state.guessCount = 0;
      state.lastRoundPoints = 0;
      $("btnPlayAgain").hidden = true;
      $("btnSkip").hidden = false;
      $("btnEnd").hidden = false;
      updateHUD();

      // hover: keep learning highlights; no tooltip
      svg.addEventListener("mousemove", (e) => {
        const t = e.target;
        if (!(t instanceof SVGPathElement)) return;
        if (!t.classList.contains("country")) return;
        const nm = t.getAttribute("data-name");
        if (!nm || (state.allowedMapNames && !state.allowedMapNames.has(nm))) return;
        clearMapTransientClasses(svg);
        t.classList.add("focused");
      });
      svg.addEventListener("mouseleave", () => clearMapTransientClasses(svg));

      svg.addEventListener("click", (e) => {
        if (state.phase !== "playing") return;
        const t = e.target;
        if (!(t instanceof SVGPathElement)) return;
        if (!t.classList.contains("country")) return;
        const nm = t.getAttribute("data-name");
        if (!nm) return;
        if (state.allowedMapNames && !state.allowedMapNames.has(nm)) return;

        const picked = state.mapNameToCountry.get(nm);
        if (!picked) return;
        const ans = state.rounds[state.idx];
        const correct = picked.cca3 === ans.cca3;
        t.classList.add(correct ? "correct" : "wrong");

        if (!correct) {
          endRound({
            correct: false,
            picked,
            message: `Wrong! You clicked ${safeCountryLabel(picked)}`
          });
        } else {
          endRound({ correct: true, picked });
        }
      });

      beginRound();
    })
    .catch(() => {
      $("feedback").classList.add("bad");
      $("feedback").textContent = "Couldn’t load country/map data. Refresh and try again.";
    });
}

main();

