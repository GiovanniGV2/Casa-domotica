const express = require('express');
const app = express();
const port = 3000;

// Middleware para habilitar CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

// Ruta para obtener los datos simulados de los sensores
app.get('/data', (req, res) => {
    const sensorData = {
        temp: 25.5,
        hum: 60,
        rain: false,
        gas: 150,
        motion: true,
        led_state: false,
        door_state: false,
        tender_state: false
    };
    res.json(sensorData);
});

// Inicia el servidor
app.listen(port, () => {
    console.log(`API escuchando en http://localhost:${port}`);
});