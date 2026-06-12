const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });
const { WebcastPushConnection } = require('tiktok-live-connector');
const fs = require('fs'); 

const pathData = './data.json';
const pathCatalogo = './catalogo_regalos.json'; 

// --- RUTAS ---
app.get('/versus', (req, res) => res.sendFile(__dirname + '/versus.html'));
app.get('/salvar', (req, res) => res.sendFile(__dirname + '/salvar.html'));
app.get('/regalos', (req, res) => res.sendFile(__dirname + '/regalos.html'));
app.get('/racha', (req, res) => res.sendFile(__dirname + '/racha.html')); // 🌟 NUEVO OVERLAY
app.get('/', (req, res) => res.sendFile(__dirname + '/panel.html'));

let topDonators = {};
let topSorted = [];
let teamSalvar = { total: 0, donators: {} };
let teamReiniciar = { total: 0, donators: {} };
let catalogoGlobal = [];

const regalosEq1Defecto = [
    { id: 6064, name: "GG", diamonds: 1 }, { id: 9947, name: "Regalo 9947", diamonds: 1 },
    { id: 14488, name: "Regalo 14488", diamonds: 1 }, { id: 12988, name: "Regalo 12988", diamonds: 1 },
    { id: 5586, name: "Regalo 5586", diamonds: 1 }, { id: 6267, name: "Regalo 6267", diamonds: 1 },
    { id: 7168, name: "Regalo 7168", diamonds: 1 }
];
const regalosEq2Defecto = [
    { id: 5655, name: "Rose", diamonds: 1 }, { id: 8913, name: "Perfume", diamonds: 10 },
    { id: 5879, name: "Doughnut", diamonds: 30 }, { id: 7569, name: "Game Controller", diamonds: 100 },
    { id: 5509, name: "Sunglasses", diamonds: 199 }, { id: 6007, name: "Boxing Gloves", diamonds: 299 },
    { id: 5731, name: "Coral", diamonds: 499 }
];

let configGlobal = {
    username: "", historial: [],
    equipo1: { nombre: "SALVAR", sub: "GG", regalos: regalosEq1Defecto },
    equipo2: { nombre: "REINICIAR", sub: "ROSA", regalos: regalosEq2Defecto },
    enableCountdown: true, countdownSeconds: 30, showTopText: true, showDonatorCoins: true,
    regalosDisponibles: [],
    // 🌟 NUEVOS DATOS PARA LA RACHA
    racha: { currentWins: 0, showCoins: true },
    lifetimeWins: {} // Guardará el récord histórico de cada usuario {"Pedro": 5, "Juan": 12}
};

if (fs.existsSync(pathData)) {
    try { let guardado = JSON.parse(fs.readFileSync(pathData, 'utf8')); configGlobal = { ...configGlobal, ...guardado }; } catch (e) {}
}
if (fs.existsSync(pathCatalogo)) {
    try { catalogoGlobal = JSON.parse(fs.readFileSync(pathCatalogo, 'utf8')); } catch (e) {}
}
if (catalogoGlobal.length === 0) {
    catalogoGlobal = [...regalosEq1Defecto, ...regalosEq2Defecto];
    catalogoGlobal.sort((a, b) => a.diamonds - b.diamonds);
    fs.writeFileSync(pathCatalogo, JSON.stringify(catalogoGlobal, null, 4));
}
configGlobal.regalosDisponibles = catalogoGlobal;

function guardarEnArchivo() { 
    fs.writeFileSync(pathData, JSON.stringify(configGlobal, null, 4)); 
    fs.writeFileSync(pathCatalogo, JSON.stringify(catalogoGlobal, null, 4)); 
}

let tiktokLiveConnection = null;
let desconexionIntencional = false;
const regalosProcesados = new Set();

function emitSalvarUpdate(target) {
    let topSalvar = Object.entries(teamSalvar.donators).map(([name, info]) => ({ name: info.displayName, coins: info.coins, avatar: info.avatar })).sort((a, b) => b.coins - a.coins)[0] || { name: 'ESPERANDO', coins: 0, avatar: '' };
    let topReiniciar = Object.entries(teamReiniciar.donators).map(([name, info]) => ({ name: info.displayName, coins: info.coins, avatar: info.avatar })).sort((a, b) => b.coins - a.coins)[0] || { name: 'ESPERANDO', coins: 0, avatar: '' };
    target.emit('actualizacion_salvar', { totalSalvar: teamSalvar.total, totalReiniciar: teamReiniciar.total, topSalvar: topSalvar, topReiniciar: topReiniciar });
}

function desconectarTikTok() {
    if (tiktokLiveConnection) {
        desconexionIntencional = true;
        try { tiktokLiveConnection.disconnect(); } catch (e) {}
        tiktokLiveConnection = null;
        io.emit('estado_conexion', { estado: 'desconectado', msg: '🔴 Desconectado manualmente' });
    }
}

function conectarTikTok(usuario) {
    desconectarTikTok();
    if (!usuario || usuario.trim() === "") { io.emit('estado_conexion', { estado: 'desconectado', msg: '⚠️ Ingresa un usuario para conectar' }); return; }
    let userLimpio = usuario.replace('@', '').trim();
    desconexionIntencional = false;
    io.emit('estado_conexion', { estado: 'conectando', msg: `🟡 Conectando a @${userLimpio}...` });
    let connectionInstance = new WebcastPushConnection(userLimpio);
    tiktokLiveConnection = connectionInstance;

    connectionInstance.connect().then(() => {
        io.emit('estado_conexion', { estado: 'conectado', msg: `🟢 Conectado a @${userLimpio} | 📡 Radar Activo` });
        if (!configGlobal.historial.includes(userLimpio)) {
            configGlobal.historial.unshift(userLimpio);
            if (configGlobal.historial.length > 10) configGlobal.historial.pop();
            guardarEnArchivo();
        }
        io.emit('config_actual', configGlobal);
    }).catch(err => { io.emit('estado_conexion', { estado: 'error', msg: `❌ Error: ${err.message}` }); });

    connectionInstance.on('disconnected', () => {
        if (tiktokLiveConnection === connectionInstance && !desconexionIntencional) {
            io.emit('estado_conexion', { estado: 'conectando', msg: '🟡 Conexión perdida. Auto-reconectando...' });
            setTimeout(() => { conectarTikTok(userLimpio); }, 3000);
        }
    });

    connectionInstance.on('streamEnd', () => {
        if (tiktokLiveConnection === connectionInstance) { desconexionIntencional = true; io.emit('estado_conexion', { estado: 'offline', msg: '⬛ El LIVE ha finalizado' }); }
    });

    connectionInstance.on('gift', data => {
        if (data.giftType === 1 && !data.repeatEnd) return;
        let huellaRegalo = data.msgId || (data.uniqueId + data.timestamp);
        if (regalosProcesados.has(huellaRegalo)) return; 
        regalosProcesados.add(huellaRegalo);
        if (regalosProcesados.size > 1000) regalosProcesados.clear(); 

        let user = data.uniqueId;
        const totalCoins = data.diamondCount * data.repeatCount;
        const unitPrice = data.diamondCount;
        let cleanName = (data.nickname || data.uniqueId).replace(/[^a-zA-Z0-9\sÁÉÍÓÚáéíóúÑñ]/g, '').trim() || user; 
        let avatarUrl = "https://www.gravatar.com/avatar/0?d=mp&f=y";
        if (data.userDetails && data.userDetails.profilePictureUrls && data.userDetails.profilePictureUrls.length > 0) avatarUrl = data.userDetails.profilePictureUrls[0];
        
        let giftId = data.giftId; let giftName = data.giftName || "Regalo";
        let knownGift = catalogoGlobal.find(g => g.id === giftId);
        if (!knownGift) {
            let nuevoRegalo = { id: giftId, name: giftName, diamonds: unitPrice };
            catalogoGlobal.push(nuevoRegalo); catalogoGlobal.sort((a, b) => a.diamonds - b.diamonds);
            configGlobal.regalosDisponibles = catalogoGlobal; guardarEnArchivo(); io.emit('config_actual', configGlobal); 
        } else if (knownGift.name.startsWith("Regalo ") && giftName !== "Regalo") {
            knownGift.name = giftName; knownGift.diamonds = unitPrice; guardarEnArchivo(); io.emit('config_actual', configGlobal);
        }

        if (!topDonators[user]) topDonators[user] = { monedas: 0, avatar: avatarUrl, displayName: cleanName };
        else { topDonators[user].avatar = avatarUrl; topDonators[user].displayName = cleanName; }
        topDonators[user].monedas += totalCoins;

        topSorted = Object.entries(topDonators).map(([nombre, info]) => ({ nombre: info.displayName, monedas: info.monedas, avatar: info.avatar })).sort((a, b) => b.monedas - a.monedas).slice(0, 2); 
        io.emit('actualizacion', topSorted);
        
        let isSalvar = configGlobal.equipo1.regalos.some(r => r.id === giftId);
        let isReiniciar = configGlobal.equipo2.regalos.some(r => r.id === giftId);
        let triggeredTeam = false;

        if (isSalvar) {
            teamSalvar.total += totalCoins;
            if (!teamSalvar.donators[user]) teamSalvar.donators[user] = { coins: 0, avatar: avatarUrl, displayName: cleanName };
            teamSalvar.donators[user].avatar = avatarUrl; teamSalvar.donators[user].displayName = cleanName; teamSalvar.donators[user].coins += totalCoins;
            triggeredTeam = 'salvar';
        } else if (isReiniciar) {
            teamReiniciar.total += totalCoins;
            if (!teamReiniciar.donators[user]) teamReiniciar.donators[user] = { coins: 0, avatar: avatarUrl, displayName: cleanName };
            teamReiniciar.donators[user].avatar = avatarUrl; teamReiniciar.donators[user].displayName = cleanName; teamReiniciar.donators[user].coins += totalCoins;
            triggeredTeam = 'reiniciar';
        }
        if (triggeredTeam) { emitSalvarUpdate(io); io.emit('poder_salvar', { side: triggeredTeam, amount: totalCoins }); }
    });
}

if(configGlobal.username !== "") conectarTikTok(configGlobal.username);

io.on('connection', (socket) => {
    socket.emit('config_actual', configGlobal);
    socket.emit('actualizacion', topSorted);
    emitSalvarUpdate(socket);

    socket.on('comando_conectar', (usuario) => { configGlobal.username = usuario.trim(); guardarEnArchivo(); conectarTikTok(configGlobal.username); });
    socket.on('comando_desconectar', () => { desconectarTikTok(); });

    socket.on('guardar_config', (nuevaConfig) => {
        nuevaConfig.historial = configGlobal.historial; nuevaConfig.username = configGlobal.username;
        nuevaConfig.regalosDisponibles = configGlobal.regalosDisponibles; nuevaConfig.racha = configGlobal.racha; nuevaConfig.lifetimeWins = configGlobal.lifetimeWins;
        configGlobal = nuevaConfig; guardarEnArchivo(); io.emit('config_actual', configGlobal); emitSalvarUpdate(io); 
    });

    socket.on('agregar_regalo_manual', (nuevoRegalo) => {
        let index = catalogoGlobal.findIndex(g => g.id === nuevoRegalo.id);
        if (index === -1) { catalogoGlobal.push(nuevoRegalo); } else { catalogoGlobal[index] = nuevoRegalo; }
        catalogoGlobal.sort((a, b) => a.diamonds - b.diamonds); configGlobal.regalosDisponibles = catalogoGlobal;
        guardarEnArchivo(); io.emit('config_actual', configGlobal);
    });

    socket.on('eliminar_regalo_catalogo', (id) => {
        catalogoGlobal = catalogoGlobal.filter(g => g.id !== id); configGlobal.regalosDisponibles = catalogoGlobal;
        configGlobal.equipo1.regalos = configGlobal.equipo1.regalos.filter(g => g.id !== id); configGlobal.equipo2.regalos = configGlobal.equipo2.regalos.filter(g => g.id !== id);
        guardarEnArchivo(); io.emit('config_actual', configGlobal);
    });

    socket.on('reset', () => {
        topDonators = {}; topSorted = []; teamSalvar = { total: 0, donators: {} }; teamReiniciar = { total: 0, donators: {} };
        io.emit('actualizacion', topSorted); emitSalvarUpdate(io);
    });

    // 🌟 NUEVOS EVENTOS PARA LA RACHA 🌟
    socket.on('racha_add', () => {
        if(!configGlobal.racha) configGlobal.racha = { currentWins: 0, showCoins: true };
        if(!configGlobal.lifetimeWins) configGlobal.lifetimeWins = {};
        
        configGlobal.racha.currentWins++;
        
        // Sumar al récord histórico del Top 1 actual
        let top1 = topSorted[0];
        if (top1 && top1.nombre !== 'ESPERANDO') {
            if (!configGlobal.lifetimeWins[top1.nombre]) configGlobal.lifetimeWins[top1.nombre] = 0;
            configGlobal.lifetimeWins[top1.nombre]++;
        }
        guardarEnArchivo();
        io.emit('config_actual', configGlobal);
        io.emit('racha_animacion'); // Efecto de zoom visual
    });

    socket.on('racha_remove', () => {
        if(!configGlobal.racha) return;
        if (configGlobal.racha.currentWins > 0) {
            configGlobal.racha.currentWins--;
            // Restar también al récord histórico del Top 1 actual si nos equivocamos
            let top1 = topSorted[0];
            if (top1 && top1.nombre !== 'ESPERANDO' && configGlobal.lifetimeWins && configGlobal.lifetimeWins[top1.nombre] > 0) {
                configGlobal.lifetimeWins[top1.nombre]--;
            }
            guardarEnArchivo();
            io.emit('config_actual', configGlobal);
        }
    });

    socket.on('racha_reset', () => {
        if(configGlobal.racha) {
            configGlobal.racha.currentWins = 0;
            guardarEnArchivo();
            io.emit('config_actual', configGlobal);
        }
    });

    socket.on('racha_toggle_coins', (val) => {
        if(!configGlobal.racha) configGlobal.racha = { currentWins: 0, showCoins: true };
        configGlobal.racha.showCoins = val;
        guardarEnArchivo();
        io.emit('config_actual', configGlobal);
    });
});

http.listen(3000, () => console.log('🚀 Servidor encendido en el puerto 3000.'));