// ======== ESTADO Y CONFIG =========
const html = document.documentElement;
const themeBtn = document.getElementById("themeBtn");
const sectionEls = document.querySelectorAll(".section");
const navBtns = document.querySelectorAll(".navbtn");

// Resumen tiles
const tTemp = document.getElementById("tile-temp");
const tHum = document.getElementById("tile-hum");
const tGas = document.getElementById("tile-gas");
const tWater = document.getElementById("tile-water");
const tMotion = document.getElementById("tile-motion");
const tLed = document.getElementById("tile-led");

// Sim sections readouts / leds
const simReadouts = {
  dht: document.getElementById("sim-dht-readout"),
  gas: document.getElementById("sim-gas-readout"),
  water: document.getElementById("sim-water-readout"),
  motion: document.getElementById("sim-motion-readout"),
};
const motionLed = document.getElementById("sim-motion-led");
const motionLabel = document.getElementById("sim-motion-label");

// Chart modal
const chartModal = document.getElementById("chartModal");
const chartTitle = document.getElementById("chartTitle");
const chartCanvas = document.getElementById("chartCanvas");

let currentSection = "resumen";
let currentSensor = null;
let simInterval = null;
let chart = null;
const MAX_POINTS = 50;

// Almacén de datos
const store = {
  dht: { label: "Temperatura / Humedad", icon: "🌡️", data: [] },
  gas: { label: "Gas (ppm)", icon: "🧪", data: [] },
  water: { label: "Agua (%)", icon: "💧", data: [] },
  motion: { label: "Movimiento (0/1)", icon: "👤", data: [] },
};

// ======== API ESP32 =========
// ⚠️ CAMBIA ESTA IP POR LA DE TU ESP32
const API_BASE = "http://192.168.0.15";

// Obtener datos reales del PIR
async function getRealSensorData() {
  try {
    const response = await fetch(API_BASE + "/data");
    return await response.json();
  } catch (err) {
    console.error("Error al obtener datos reales:", err);
    return { motion: false };
  }
}

// ======== NAVEGACIÓN DE SECCIONES =========
function showSection(id) {
  sectionEls.forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  currentSection = id;
  if (!id.startsWith("sim-")) {
    stopSim();
  }
}

navBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    const id = btn.dataset.section;
    showSection(id);
  });
});

showSection("resumen"); // inicial

// ======== EVENTOS GLOBALES =========
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const action = el.dataset.action;
  const sensor = el.dataset.sensor;
  if (action === "open-sim" && sensor) {
    openSimSection(sensor);
  } else if (action === "open-chart" && sensor) {
    openChart(sensor);
  } else if (action === "go-back") {
    stopSim();
    showSection("simulaciones");
  } else if (action === "close-chart") {
    closeChart();
  } else if (action === "download-chart") {
    downloadChartPNG();
  }
});

// ======== MOSTRAR SECCIÓN DE UN SENSOR =========
function openSimSection(sensor) {
  currentSensor = sensor;
  stopSim(); // reset
  const targetId = `sim-${sensor}`;
  showSection(targetId);
}

// ======== ENLACES DE BOTONES DE CADA SIM ========
bindSimButtons("dht");
bindSimButtons("gas");
bindSimButtons("water");
bindSimButtons("motion");

function bindSimButtons(key) {
  document.getElementById(`sim-${key}-start`).addEventListener("click", () => startSim(key));
  document.getElementById(`sim-${key}-stop`).addEventListener("click", stopSim);
  document.getElementById(`sim-${key}-save`).addEventListener("click", () => saveJSON(key));
  document.getElementById(`sim-${key}-clear`).addEventListener("click", () => clearData(key));
  document.getElementById(`sim-${key}-chart`).addEventListener("click", () => openChart(key));
}

// ======== SIMULACIÓN =========
function startSim(sensorKey) {
  if (simInterval) stopSim(); // reinicia
  currentSensor = sensorKey || currentSensor;
  if (!currentSensor) return;
  tick();
  simInterval = setInterval(tick, 2000);
}

function stopSim() {
  clearInterval(simInterval);
  simInterval = null;
}

async function tick() {
  const ts = new Date();
  if (currentSensor === "dht") {
    const temp = +(20 + Math.random() * 10).toFixed(1);
    const hum = +(40 + Math.random() * 30).toFixed(0);
    pushData("dht", { time: ts, temp, hum });
    simReadouts.dht.textContent = `🌡️ ${temp} °C | 💧 ${hum} %`;
    tTemp.textContent = `${temp} °C`;
    tHum.textContent = `${hum} %`;
    liveAppendToChart("dht", ts, { temp, hum });
  } else if (currentSensor === "gas") {
    const gas = +(300 + Math.random() * 600).toFixed(0);
    pushData("gas", { time: ts, gas });
    simReadouts.gas.textContent = `🧪 Gas: ${gas} ppm`;
    tGas.textContent = `${gas} ppm`;
    liveAppendToChart("gas", ts, { gas });
  } else if (currentSensor === "water") {
    const water = +((Math.random() * 100)).toFixed(0);
    pushData("water", { time: ts, water });
    simReadouts.water.textContent = `💧 Nivel de agua: ${water} %`;
    tWater.textContent = `${water} %`;
    liveAppendToChart("water", ts, { water });
  } else if (currentSensor === "motion") {
    // 🚨 Aquí datos reales del PIR desde el ESP32
    const realData = await getRealSensorData();
    const motion = realData.motion;
    pushData("motion", { time: ts, motion });
    simReadouts.motion.textContent = motion ? "👤 ¡Movimiento detectado!" : "Sin movimiento";
    motionLed.classList.toggle("on", motion);
    motionLabel.textContent = motion ? "Detectado" : "Sin detección";
    tMotion.textContent = motion ? "Detectado" : "Sin detección";
    tLed.classList.toggle("on", motion);
    liveAppendToChart("motion", ts, { motion: motion ? 1 : 0 });
  }
}

function pushData(key, obj) {
  const list = store[key].data;
  list.push(obj);
  if (list.length > MAX_POINTS) list.shift();
}

function clearData(key) {
  store[key].data = [];
  const ro = simReadouts[key];
  if (ro) ro.textContent = "Datos eliminados.";
}

function saveJSON(key) {
  const data = store[key].data.map(r => ({
    time: (r.time instanceof Date ? r.time.toISOString() : r.time),
    ...Object.fromEntries(Object.entries(r).filter(([k]) => k !== "time"))
  }));
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().replaceAll(":", "-");
  a.href = url;
  a.download = `${key}_data_${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ======== GRÁFICAS =========
function openChart(sensorKey) {
  chartTitle.textContent = `Gráfica - ${store[sensorKey].label}`;
  buildChart(sensorKey);
  chartModal.classList.remove("hidden");
}

function closeChart() {
  destroyChart();
  chartModal.classList.add("hidden");
}

function buildChart(sensorKey) {
  destroyChart();
  const data = store[sensorKey].data;
  const labels = data.map(d => formatTime(d.time));
  let datasets = [];
  if (sensorKey === "dht") {
    datasets = [
      {
        label: "Temperatura (°C)", data: data.map(d => d.temp ?? null),
        borderColor: "#f97316", backgroundColor: "rgba(249,115,22,.2)", borderWidth: 2, tension: 0.25
      },
      {
        label: "Humedad (%)", data: data.map(d => d.hum ?? null),
        borderColor: "#60a5fa", backgroundColor: "rgba(96,165,250,.2)", borderWidth: 2, tension: 0.25
      }
    ];
  } else if (sensorKey === "gas") {
    datasets = [{
      label: "Gas (ppm)", data: data.map(d => d.gas ?? null),
      borderColor: "#ef4444", backgroundColor: "rgba(239,68,68,.2)", borderWidth: 2, tension: 0.25
    }];
  } else if (sensorKey === "water") {
    datasets = [{
      label: "Agua (%)", data: data.map(d => d.water ?? null),
      borderColor: "#06b6d4", backgroundColor: "rgba(6,182,212,.2)", borderWidth: 2, tension: 0.25
    }];
  } else if (sensorKey === "motion") {
    datasets = [{
      label: "Movimiento (0/1)",
      data: data.map(d => (typeof d.motion === "number" ? d.motion : (d.motion ? 1 : 0))),
      borderColor: "#22c55e", backgroundColor: "rgba(34,197,94,.2)", borderWidth: 2, stepped: true
    }];
  }
  chart = new Chart(chartCanvas.getContext("2d"), {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      animation: false,
      plugins: { legend: { position: "top" } },
      scales: {
        x: { ticks: { autoSkip: true, maxTicksLimit: 8 }, title: { display: true, text: "Tiempo" } },
        y: { beginAtZero: true }
      }
    }
  });
  chart.__sensorKey = sensorKey;
}

function liveAppendToChart(sensorKey, ts, values) {
  if (!chart || chart.__sensorKey !== sensorKey) return;
  const label = formatTime(ts);
  if (chart.data.labels.length >= MAX_POINTS) {
    chart.data.labels.shift();
    chart.data.datasets.forEach(ds => ds.data.shift());
  }
  chart.data.labels.push(label);
  if (sensorKey === "dht") {
    chart.data.datasets[0].data.push(values.temp);
    chart.data.datasets[1].data.push(values.hum);
  } else if (sensorKey === "gas") {
    chart.data.datasets[0].data.push(values.gas);
  } else if (sensorKey === "water") {
    chart.data.datasets[0].data.push(values.water);
  } else if (sensorKey === "motion") {
    chart.data.datasets[0].data.push(values.motion);
  }
  chart.update();
}

function destroyChart() {
  if (chart) {
    chart.destroy();
    chart = null;
  }
}

function downloadChartPNG() {
  if (!chart) return;
  const url = chart.toBase64Image("image/png", 1.0);
  const a = document.createElement("a");
  a.href = url;
  a.download = "grafica.png";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ======== HELPERS =========
function formatTime(t) {
  const d = (t instanceof Date) ? t : new Date(t);
  return d.toLocaleTimeString();
}