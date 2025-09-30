const htmlEl = document.documentElement;
const themeToggle = document.getElementById('themeToggle');
const apiBaseUrlInput = document.getElementById('apiBaseUrl');
const connectBtn = document.getElementById('connectBtn');
const statusMessageEl = document.getElementById('statusMessage');

// Elementos del dashboard
const tileTemp = document.getElementById('tile-temp');
const tileHum = document.getElementById('tile-hum');
const tileRain = document.getElementById('tile-rain');
const tileGas = document.getElementById('tile-gas');
const tileMotion = document.getElementById('tile-motion');
const ledIndicatorEl = document.getElementById('ledIndicator');
const tileLed = document.getElementById('tile-led');
const tileDoor = document.getElementById('tile-door');
const tileTender = document.getElementById('tile-tender');

// Botones de control
const toggleLedBtn = document.getElementById('toggleLedBtn');
const toggleDoorBtn = document.getElementById('toggleDoorBtn');
const toggleTenderBtn = document.getElementById('toggleTenderBtn');

// Elementos de la gráfica
const chartSection = document.getElementById('chart-section');
const chartCanvas = document.getElementById('chartCanvas');
const chartTitleEl = document.getElementById('chartTitle');
const closeChartBtn = document.getElementById('closeChartBtn');
let chartInstance = null;
let fetchInterval = null;
const MAX_POINTS = 50;
let currentChartKey = null;

// Modal de confirmación
const confirmModal = document.getElementById('confirmModal');
const confirmOkBtn = document.getElementById('confirmOkBtn');
const confirmCancelBtn = document.getElementById('confirmCancelBtn');

// Almacén de datos para gráficas
const store = {
    'dht-temp-hum': {
        labels: ["Temperatura (°C)", "Humedad (%)"],
        units: [' °C', ' %'],
        data: [],
        colors: ['var(--acc-temp)', 'var(--acc-water)']
    },
    'rain': { label: "Lluvia", data: [], units: '', stepped: true, color: 'var(--acc-rain)' },
    'gas': { label: "Gas (ppm)", data: [], units: ' ppm', color: 'var(--acc-gas)' },
    'motion': { label: "Movimiento", data: [], units: '', stepped: true, color: 'var(--acc-motion)' },
    'led': { label: "LED", data: [], units: '', stepped: true, color: 'var(--acc-motion)' },
    'door': { label: "Puerta", data: [], units: '', stepped: true, color: 'var(--acc-door)' },
    'tender': { label: "Tendedero", data: [], units: '', stepped: true, color: 'var(--acc-tender)' },
};

function saveApiUrl() {
    localStorage.setItem('apiBaseUrl', apiBaseUrlInput.value.trim());
}

// Función para obtener datos del ESP32
async function fetchData() {
    const apiBase = apiBaseUrlInput.value.trim();
    if (!apiBase) {
        updateStatus('URL de API no configurada.', 'text-red-600 dark:text-red-400');
        return;
    }

    try {
        const url = `${apiBase.replace(/\/$/, '')}/data`;
        const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        updateDashboard(data);
        appendDataToStore(data);
        if (chartInstance) {
            liveAppendToChart(data);
        }
        updateStatus(`Conectado. Última actualización: ${formatTime(new Date())}`, 'text-green-600 dark:text-green-400');
    } catch (error) {
        console.error("Error al obtener datos:", error);
        updateStatus('Fallo de conexión. Revisa la URL y el ESP32.', 'text-red-600 dark:text-red-400');
    }
}

// Funciones de control de actuadores
async function toggleLedState() {
    const currentState = toggleLedBtn.dataset.state === 'on';
    const newState = !currentState;
    await sendActuatorCommand('led', `state=${newState ? 'on' : 'off'}`, newState);
}

async function toggleDoorState() {
    const currentState = toggleDoorBtn.dataset.state === 'open';
    const newState = !currentState;
    await sendActuatorCommand('door', `state=${newState ? 'open' : 'close'}`, newState);
}

async function toggleTenderState() {
    const currentState = toggleTenderBtn.dataset.state === 'extend';
    const newState = !currentState;
    await sendActuatorCommand('tender', `state=${newState ? 'extend' : 'retract'}`, newState);
}

async function sendActuatorCommand(actuator, params, newState) {
    const apiBase = apiBaseUrlInput.value.trim();
    if (!apiBase) {
        alert('Conéctate a la API antes de controlar los actuadores.');
        return;
    }
    try {
        const url = `${apiBase.replace(/\/$/, '')}/${actuator}?${params}`;
        const response = await fetch(url, {
            method: 'POST',
            signal: AbortSignal.timeout(5000)
        });
        if (!response.ok) {
            throw new Error(`Error al cambiar el estado: ${response.status}`);
        }
        const result = await response.json();
        console.log(`${actuator} update:`, result);
        updateDashboard(result);
    } catch (error) {
        console.error(`Error al controlar ${actuator}:`, error);
        alert(`Error al intentar cambiar el estado de ${actuator}.`);
    }
}

// Lógica de confirmación
function showConfirmation(event) {
    const targetBtn = event.currentTarget;
    const actionName = targetBtn.textContent.trim();
    document.getElementById('modal-message').textContent = `¿Seguro que deseas "${actionName}"?`;
    confirmModal.classList.remove('hidden');

    return new Promise((resolve, reject) => {
        const okHandler = () => {
            confirmModal.classList.add('hidden');
            resolve(true);
            removeListeners();
        };
        const cancelHandler = () => {
            confirmModal.classList.add('hidden');
            resolve(false);
            removeListeners();
        };
        const removeListeners = () => {
            confirmOkBtn.removeEventListener('click', okHandler);
            confirmCancelBtn.removeEventListener('click', cancelHandler);
        };
        confirmOkBtn.addEventListener('click', okHandler);
        confirmCancelBtn.addEventListener('click', cancelHandler);
    });
}

// Actualizar la interfaz con los datos
function updateDashboard(data) {
    tileTemp.textContent = `${data.temp !== undefined ? data.temp.toFixed(1) : '--'} °C`;
    tileHum.textContent = `${data.hum !== undefined ? data.hum.toFixed(0) : '--'} %`;
    tileRain.textContent = data.rain ? 'LLUVIENDO' : 'SECO';
    tileGas.textContent = `${data.gas !== undefined ? data.gas.toFixed(0) : '--'} ppm`;
    tileMotion.textContent = data.motion ? '¡DETECTADO!' : 'Sin detección';
    
    updateLedDisplay(data.led_state);
    updateActuatorDisplay(toggleDoorBtn, data.door_state, 'open', 'close', 'ABIERTA', 'CERRADA');
    updateActuatorDisplay(toggleTenderBtn, data.tender_state, 'extend', 'retract', 'EXTENDIDO', 'RETRAÍDO');
}

function updateLedDisplay(ledState) {
    ledIndicatorEl.classList.toggle('on', ledState);
    tileLed.textContent = ledState ? 'ENCENDIDO' : 'APAGADO';
    toggleLedBtn.textContent = ledState ? 'Apagar' : 'Encender';
    toggleLedBtn.dataset.state = ledState ? 'on' : 'off';
    
    if (ledState) {
        toggleLedBtn.classList.remove('bg-gray-200', 'dark:bg-gray-700', 'text-gray-700', 'dark:text-gray-200');
        toggleLedBtn.classList.add('bg-red-500', 'hover:bg-red-600', 'text-white');
    } else {
        toggleLedBtn.classList.remove('bg-red-500', 'hover:bg-red-600', 'text-white');
        toggleLedBtn.classList.add('bg-gray-200', 'dark:bg-gray-700', 'text-gray-700', 'dark:text-gray-200');
    }
}

function updateActuatorDisplay(btn, state, onValue, offValue, onText, offText) {
    const tileTextEl = btn.previousElementSibling;
    tileTextEl.textContent = state ? onText : offText;
    btn.textContent = state ? `Retraer` : `Extender`;
    btn.dataset.state = state ? onValue : offValue;
    
    if (state) {
        btn.classList.remove('bg-gray-200', 'dark:bg-gray-700', 'text-gray-700', 'dark:text-gray-200');
        btn.classList.add('bg-indigo-600', 'hover:bg-indigo-700', 'text-white');
    } else {
        btn.classList.remove('bg-indigo-600', 'hover:bg-indigo-700', 'text-white');
        btn.classList.add('bg-gray-200', 'dark:bg-gray-700', 'text-gray-700', 'dark:text-gray-200');
    }
}

function updateStatus(message, className) {
    statusMessageEl.className = `mt-3 text-sm font-medium ${className}`;
    statusMessageEl.textContent = message;
}

function appendDataToStore(data) {
    const now = new Date();
    pushData('dht-temp-hum', { time: now, temp: data.temp, hum: data.hum });
    pushData('rain', { time: now, value: data.rain ? 1 : 0 });
    pushData('gas', { time: now, value: data.gas });
    pushData('motion', { time: now, value: data.motion ? 1 : 0 });
    pushData('led', { time: now, value: data.led_state ? 1 : 0 });
    pushData('door', { time: now, value: data.door_state ? 1 : 0 });
    pushData('tender', { time: now, value: data.tender_state ? 1 : 0 });
}

function pushData(key, data) {
    if (!store[key]) return;
    const list = store[key].data;
    list.push(data);
    if (list.length > MAX_POINTS) {
        list.shift();
    }
}

// Lógica de gráficas
function getChartConfig(sensorKey) {
    if (sensorKey === 'dht-temp-hum') {
        return {
            datasets: [
                {
                    label: store[sensorKey].labels[0],
                    data: store[sensorKey].data.map(d => d.temp),
                    yAxisID: 'yTemp',
                    borderColor: store[sensorKey].colors[0],
                    backgroundColor: 'rgba(249, 115, 22, 0.1)'
                },
                {
                    label: store[sensorKey].labels[1],
                    data: store[sensorKey].data.map(d => d.hum),
                    yAxisID: 'yHum',
                    borderColor: store[sensorKey].colors[1],
                    backgroundColor: 'rgba(6, 182, 212, 0.1)'
                }
            ],
            labels: store[sensorKey].data.map(d => formatTime(d.time))
        };
    }

    const sensorData = store[sensorKey];
    return {
        datasets: [{
            label: sensorData.label,
            data: sensorData.data.map(d => d.value),
            borderColor: sensorData.color,
            backgroundColor: sensorData.color.replace(')', ', 0.1)').replace('rgb', 'rgba'),
            stepped: sensorData.stepped || false,
            tension: sensorData.stepped ? 0 : 0.25,
            borderWidth: 2,
            fill: true
        }],
        labels: sensorData.data.map(d => formatTime(d.time))
    };
}

function openChart(sensorKey) {
    currentChartKey = sensorKey;
    if (chartInstance) {
        chartInstance.destroy();
    }
    const config = getChartConfig(sensorKey);
    chartTitleEl.textContent = `Gráfica de ${store[sensorKey].label} en Tiempo Real`;
    
    const scalesConfig = (sensorKey === 'dht-temp-hum') ? {
        yTemp: {
            type: 'linear', position: 'left', title: { display: true, text: 'Temperatura (°C)', color: 'var(--acc-temp)' },
            min: 10, max: 40, ticks: { color: 'var(--acc-temp)' }
        },
        yHum: {
            type: 'linear', position: 'right', title: { display: true, text: 'Humedad (%)', color: 'var(--acc-water)' },
            min: 0, max: 100, grid: { drawOnChartArea: false }, ticks: { color: 'var(--acc-water)' }
        }
    } : {
        y: { beginAtZero: true, title: { display: true, text: store[sensorKey].label } }
    };
    
    chartInstance = new Chart(chartCanvas, {
        type: 'line',
        data: {
            labels: config.labels,
            datasets: config.datasets.map(ds => ({
                ...ds, pointBackgroundColor: ds.borderColor, pointBorderColor: '#fff', pointBorderWidth: 2,
            }))
        },
        options: {
            responsive: true, maintainAspectRatio: false, animation: false,
            plugins: { legend: { position: 'top' } },
            scales: {
                x: { ticks: { autoSkip: true, maxTicksLimit: 10 }, title: { display: true, text: "Tiempo" } },
                ...scalesConfig
            },
            color: (context) => htmlEl.classList.contains('dark') ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)'
        }
    });
    chartSection.classList.remove('hidden');
    setTimeout(() => chartInstance.resize(), 100);
}

function closeChart() {
    if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
    }
    currentChartKey = null;
    chartSection.classList.add('hidden');
}

function liveAppendToChart(data) {
    if (!chartInstance || !currentChartKey) return;
    const now = new Date();
    const label = formatTime(now);
    if (chartInstance.data.labels.length >= MAX_POINTS) {
        chartInstance.data.labels.shift();
        chartInstance.data.datasets.forEach(ds => ds.data.shift());
    }
    chartInstance.data.labels.push(label);
    
    if (currentChartKey === 'dht-temp-hum') {
        chartInstance.data.datasets[0].data.push(data.temp);
        chartInstance.data.datasets[1].data.push(data.hum);
    } else if (currentChartKey === 'rain') {
        chartInstance.data.datasets[0].data.push(data.rain ? 1 : 0);
    } else if (currentChartKey === 'gas') {
        chartInstance.data.datasets[0].data.push(data.gas);
    } else if (currentChartKey === 'motion') {
        chartInstance.data.datasets[0].data.push(data.motion ? 1 : 0);
    } else if (currentChartKey === 'led') {
        chartInstance.data.datasets[0].data.push(data.led_state ? 1 : 0);
    } else if (currentChartKey === 'door') {
        chartInstance.data.datasets[0].data.push(data.door_state ? 1 : 0);
    } else if (currentChartKey === 'tender') {
        chartInstance.data.datasets[0].data.push(data.tender_state ? 1 : 0);
    }
    chartInstance.update('none');
}

function formatTime(t) {
    const d = (t instanceof Date) ? t : new Date(t);
    return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function startFetching() {
    if (fetchInterval) clearInterval(fetchInterval);
    fetchInterval = setInterval(fetchData, 4000);
    fetchData();
}

function stopFetching() {
    if (fetchInterval) {
        clearInterval(fetchInterval);
        fetchInterval = null;
    }
    updateStatus('Desconectado. Pulsa Conectar para reanudar.', 'text-gray-500 dark:text-gray-400');
}

// Event Listeners
connectBtn.addEventListener('click', () => {
    saveApiUrl();
    startFetching();
});

document.querySelectorAll('[data-actuator]').forEach(el => {
    const btn = el.querySelector('button');
    btn.addEventListener('click', async (e) => {
        if (e.currentTarget.dataset.confirm === 'true') {
            const confirmed = await showConfirmation(e);
            if (confirmed) {
                const actuator = el.dataset.actuator;
                if (actuator === 'led') toggleLedState();
                if (actuator === 'door') toggleDoorState();
                if (actuator === 'tender') toggleTenderState();
            }
        }
    });
});

document.querySelectorAll('[data-sensor], [data-actuator]').forEach(el => {
    const sensorKey = el.dataset.sensor || el.dataset.actuator;
    el.addEventListener('click', (e) => {
        // Ignorar clicks en el botón del actuador
        if (e.target.closest('button')) return;
        if (currentChartKey === sensorKey) {
            closeChart();
        } else {
            openChart(sensorKey);
        }
    });
});

closeChartBtn.addEventListener('click', closeChart);

themeToggle.addEventListener('click', () => {
    htmlEl.classList.toggle('dark');
    localStorage.setItem('theme', htmlEl.classList.contains('dark') ? 'dark' : 'light');
});

// Inicialización
window.onload = function() {
    const savedUrl = localStorage.getItem('apiBaseUrl');
    if (savedUrl) {
        apiBaseUrlInput.value = savedUrl;
    }
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        htmlEl.classList.add('dark');
    } else {
        htmlEl.classList.remove('dark');
    }
    if (apiBaseUrlInput.value.trim()) {
        startFetching();
    }
};