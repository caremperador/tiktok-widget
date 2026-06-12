const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });
const { WebcastPushConnection } = require('tiktok-live-connector');
const fs = require('fs'); 
const path = require('path'); 

const pathData = path.join(__dirname, 'data.json');
const pathCatalogo = path.join(__dirname, 'catalogo_regalos.json'); 

app.get('/', (req, res) => res.sendFile(__dirname + '/panel.html')); 
app.get('/vista_conexion', (req, res) => res.sendFile(__dirname + '/vista_conexion.html'));
app.get('/vista_versus', (req, res) => res.sendFile(__dirname + '/vista_versus.html'));
app.get('/vista_racha', (req, res) => res.sendFile(__dirname + '/vista_racha.html'));
app.get('/vista_regalos', (req, res) => res.sendFile(__dirname + '/vista_regalos.html'));
app.get('/salvar', (req, res) => res.sendFile(__dirname + '/salvar.html'));
app.get('/racha', (req, res) => res.sendFile(__dirname + '/racha.html')); 

let topDonators = {};
let topSorted = [];
let teamSalvar = { total: 0, donators: {} };
let teamReiniciar = { total: 0, donators: {} };
let catalogoGlobal = [];

const regalosEq1Defecto = [{ id: 6064, name: "GG", diamonds: 1 }, { id: 9947, name: "BFF Necklace", diamonds: 10 }, { id: 14488, name: "Regalo 14488", diamonds: 1 }, { id: 12988, name: "Regalo 12988", diamonds: 1 }, { id: 5586, name: "Regalo 5586", diamonds: 1 }, { id: 6267, name: "Regalo 6267", diamonds: 1 }, { id: 7168, name: "Regalo 7168", diamonds: 1 }];
const regalosEq2Defecto = [{ id: 5655, name: "Rose", diamonds: 1 }, { id: 8913, name: "Rosa", diamonds: 10 }, { id: 5879, name: "Doughnut", diamonds: 30 }, { id: 7569, name: "Game Controller", diamonds: 100 }, { id: 5509, name: "Sunglasses", diamonds: 199 }, { id: 6007, name: "Boxing Gloves", diamonds: 299 }, { id: 5731, name: "Coral", diamonds: 499 }];

let configGlobal = {
    username: "", historial: [],
    equipo1: { nombre: "SALVAR", sub: "GG", color: "#00ff66", regalos: regalosEq1Defecto },
    equipo2: { nombre: "REINICIAR", sub: "ROSA", color: "#ff003c", regalos: regalosEq2Defecto },
    enableCountdown: true, countdownSeconds: 30, showTopText: true, showDonatorCoins: true,
    showEmoticons: true, roundGifts: true, 
    showTopDonators: true, // 🌟 NUEVO: Ocultar o mostrar a los MVPs
    regalosDisponibles: [],
    racha: { topRound: {}, recordDiario: {}, recordHistorico: {}, showPhoto: true, showCoins: false },
    battleStyle: { fontFamily: "'Lemon', serif", textStroke: 1.5, colorL1: "#ffd700", sizeL1: 38, colorL2: "#ff003c", sizeL2: 45, colorTimer: "#ffffff", sizeTimer: 140, shadowOpacity: 1.0, shadowDistance: 4 }
};

if (fs.existsSync(pathData)) {
    try { 
        let guardado = JSON.parse(fs.readFileSync(pathData, 'utf8')); 
        configGlobal = { ...configGlobal, ...guardado };
        if(configGlobal.equipo1.color === undefined) configGlobal.equipo1.color = "#00ff66";
        if(configGlobal.equipo2.color === undefined) configGlobal.equipo2.color = "#ff003c";
        if(configGlobal.showEmoticons === undefined) configGlobal.showEmoticons = true;
        if(configGlobal.roundGifts === undefined) configGlobal.roundGifts = true;
        if(configGlobal.showTopDonators === undefined) configGlobal.showTopDonators = true;
        if(!configGlobal.racha || !configGlobal.racha.topRound) configGlobal.racha = { topRound: {}, recordDiario: {}, recordHistorico: {}, showPhoto: true, showCoins: false };
        if(!configGlobal.battleStyle) configGlobal.battleStyle = { fontFamily: "'Lemon', serif", textStroke: 1.5, colorL1: "#ffd700", sizeL1: 38, colorL2: "#ff003c", sizeL2: 45, colorTimer: "#ffffff", sizeTimer: 140, shadowOpacity: 1.0, shadowDistance: 4 };
    } catch (e) {}
}

if (fs.existsSync(pathCatalogo)) { try { catalogoGlobal = JSON.parse(fs.readFileSync(pathCatalogo, 'utf8')); } catch (e) {} }
if (catalogoGlobal.length === 0) {
    catalogoGlobal = [...regalosEq1Defecto, ...regalosEq2Defecto].sort((a, b) => a.diamonds - b.diamonds);
    fs.writeFileSync(pathCatalogo, JSON.stringify(catalogoGlobal, null, 4));
}
configGlobal.regalosDisponibles = catalogoGlobal;

function guardarEnArchivo() { 
    try { fs.writeFileSync(pathData, JSON.stringify(configGlobal, null, 4)); fs.writeFileSync(pathCatalogo, JSON.stringify(catalogoGlobal, null, 4)); } catch (err) {}
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
        let unitPrice = data.diamondCount; 
        let cleanName = (data.nickname || data.uniqueId).replace(/[^a-zA-Z0-9\sÁÉÍÓÚáéíóúÑñ]/g, '').trim() || user; 
        let avatarUrl = "https://www.gravatar.com/avatar/0?d=mp&f=y";
        if (data.userDetails && data.userDetails.profilePictureUrls && data.userDetails.profilePictureUrls.length > 0) avatarUrl = data.userDetails.profilePictureUrls[0];
        
        let giftId = data.giftId; let giftName = data.giftName || "Regalo";
        let knownGift = catalogoGlobal.find(g => g.id === giftId);
        
        if (knownGift) { unitPrice = knownGift.diamonds; } else {
            let nuevoRegalo = { id: giftId, name: giftName, diamonds: unitPrice };
            catalogoGlobal.push(nuevoRegalo); catalogoGlobal.sort((a, b) => a.diamonds - b.diamonds);
            configGlobal.regalosDisponibles = catalogoGlobal; guardarEnArchivo(); io.emit('config_actual', configGlobal); 
        }

        if (configGlobal.roundGifts && unitPrice % 10 === 9) { unitPrice += 1; }
        const totalCoins = unitPrice * data.repeatCount;

        if (!topDonators[user]) topDonators[user] = { monedas: 0, avatar: avatarUrl, displayName: cleanName };
        else { topDonators[user].avatar = avatarUrl; topDonators[user].displayName = cleanName; }
        topDonators[user].monedas += totalCoins;
        topSorted = Object.entries(topDonators).map(([nombre, info]) => ({ nombre: info.displayName, monedas: info.monedas, avatar: info.avatar })).sort((a, b) => b.monedas - a.monedas).slice(0, 2); 
        io.emit('actualizacion', topSorted);
        
        if (!configGlobal.racha.topRound[user]) configGlobal.racha.topRound[user] = { monedas: 0, avatar: avatarUrl, displayName: cleanName };
        else { configGlobal.racha.topRound[user].avatar = avatarUrl; configGlobal.racha.topRound[user].displayName = cleanName; }
        configGlobal.racha.topRound[user].monedas += totalCoins;
        io.emit('racha_data_update', configGlobal.racha); 

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
    socket.emit('racha_data_update', configGlobal.racha); 
    emitSalvarUpdate(socket);

    socket.on('comando_conectar', (usuario) => { configGlobal.username = usuario.trim(); guardarEnArchivo(); conectarTikTok(configGlobal.username); });
    socket.on('comando_desconectar', () => { desconectarTikTok(); });

    socket.on('guardar_config', (nuevaConfig) => {
        nuevaConfig.historial = configGlobal.historial; nuevaConfig.username = configGlobal.username;
        nuevaConfig.regalosDisponibles = configGlobal.regalosDisponibles; nuevaConfig.racha = configGlobal.racha; 
        configGlobal = nuevaConfig; guardarEnArchivo(); io.emit('config_actual', configGlobal); emitSalvarUpdate(io); 
    });

    // 🌟 NUEVO EVENTO: Añadir o restar puntos manualmente a un equipo
    socket.on('modificar_puntos_equipo', (data) => {
        if (data.equipo === 1) {
            teamSalvar.total += data.cantidad;
            if (teamSalvar.total < 0) teamSalvar.total = 0;
        } else if (data.equipo === 2) {
            teamReiniciar.total += data.cantidad;
            if (teamReiniciar.total < 0) teamReiniciar.total = 0;
        }
        emitSalvarUpdate(io);
        // Si sumamos puntos en positivo, enviamos explosión
        if (data.cantidad > 0) {
            io.emit('poder_salvar', { side: data.equipo === 1 ? 'salvar' : 'reiniciar', amount: data.cantidad });
        }
    });

    socket.on('importar_catalogo', (nuevoData) => {
        if (Array.isArray(nuevoData)) {
            nuevoData.forEach(item => {
                let idx = catalogoGlobal.findIndex(g => g.id === item.id);
                if (idx === -1) catalogoGlobal.push(item);
                else catalogoGlobal[idx] = { ...catalogoGlobal[idx], ...item };
            });
            catalogoGlobal.sort((a, b) => a.diamonds - b.diamonds);
            configGlobal.regalosDisponibles = catalogoGlobal;
            guardarEnArchivo(); io.emit('config_actual', configGlobal);
        }
    });
    
    socket.on('importar_historial', (nuevoData) => {
        if (typeof nuevoData === 'object' && nuevoData !== null && !Array.isArray(nuevoData)) {
            let userActivo = configGlobal.username;
            configGlobal = { ...configGlobal, ...nuevoData };
            if(userActivo) configGlobal.username = userActivo;
            guardarEnArchivo();
            io.emit('config_actual', configGlobal);
            io.emit('racha_data_update', configGlobal.racha);
        }
    });

    socket.on('agregar_regalo_manual', (nuevoRegalo) => {
        let index = catalogoGlobal.findIndex(g => g.id === nuevoRegalo.id);
        if (index === -1) catalogoGlobal.push(nuevoRegalo); else catalogoGlobal[index] = nuevoRegalo;
        catalogoGlobal.sort((a, b) => a.diamonds - b.diamonds); configGlobal.regalosDisponibles = catalogoGlobal;
        guardarEnArchivo(); io.emit('config_actual', configGlobal);
    });

    socket.on('eliminar_regalo_catalogo', (id) => {
        catalogoGlobal = catalogoGlobal.filter(g => g.id !== id); configGlobal.regalosDisponibles = catalogoGlobal;
        configGlobal.equipo1.regalos = configGlobal.equipo1.regalos.filter(g => g.id !== id); configGlobal.equipo2.regalos = configGlobal.equipo2.regalos.filter(g => g.id !== id);
        guardarEnArchivo(); io.emit('config_actual', configGlobal);
    });

    // 🌟 ESTE ES EL BOTÓN DE REINICIAR (Deja todo en cero)
    socket.on('reset', () => {
        topDonators = {}; topSorted = []; teamSalvar = { total: 0, donators: {} }; teamReiniciar = { total: 0, donators: {} };
        io.emit('actualizacion', topSorted); emitSalvarUpdate(io);
    });

    socket.on('racha_iniciar_ronda', () => { configGlobal.racha.topRound = {}; guardarEnArchivo(); io.emit('racha_data_update', configGlobal.racha); });
    
    socket.on('racha_cerrar_ronda', () => {
        let arr = Object.values(configGlobal.racha.topRound).sort((a,b) => b.monedas - a.monedas);
        if (arr.length > 0) {
            let top1 = arr[0]; let name = top1.displayName;
            if(!configGlobal.racha.recordDiario[name]) configGlobal.racha.recordDiario[name] = { avatar: top1.avatar, displayName: name, wins: 0, monedas: 0 };
            configGlobal.racha.recordDiario[name].wins += 1; configGlobal.racha.recordDiario[name].avatar = top1.avatar; configGlobal.racha.recordDiario[name].monedas += top1.monedas;
            if(!configGlobal.racha.recordHistorico[name]) configGlobal.racha.recordHistorico[name] = { avatar: top1.avatar, displayName: name, wins: 0, monedas: 0 };
            configGlobal.racha.recordHistorico[name].wins += 1; configGlobal.racha.recordHistorico[name].avatar = top1.avatar; configGlobal.racha.recordHistorico[name].monedas += top1.monedas;
            
            configGlobal.racha.topRound = {}; guardarEnArchivo(); 
            io.emit('racha_data_update', configGlobal.racha); io.emit('config_actual', configGlobal); io.emit('racha_animacion');
        }
    });

    socket.on('racha_ajuste', (data) => {
        let lista = data.tipo === 'diario' ? configGlobal.racha.recordDiario : configGlobal.racha.recordHistorico;
        if(lista[data.name]) { lista[data.name].wins += data.amount; if(lista[data.name].wins < 0) lista[data.name].wins = 0; guardarEnArchivo(); io.emit('racha_data_update', configGlobal.racha); }
    });

    socket.on('racha_eliminar_usuario', (data) => {
        let lista = data.tipo === 'diario' ? configGlobal.racha.recordDiario : configGlobal.racha.recordHistorico;
        if(lista[data.name]) { delete lista[data.name]; guardarEnArchivo(); io.emit('racha_data_update', configGlobal.racha); }
    });

    socket.on('racha_cerrar_historico', () => { configGlobal.racha.recordHistorico = {}; guardarEnArchivo(); io.emit('racha_data_update', configGlobal.racha); });
    socket.on('racha_cerrar_diaria', () => { configGlobal.racha.recordDiario = {}; configGlobal.racha.topRound = {}; guardarEnArchivo(); io.emit('racha_data_update', configGlobal.racha); });
    socket.on('racha_guardar_opciones', (opts) => { configGlobal.racha.showPhoto = opts.showPhoto; configGlobal.racha.showCoins = opts.showCoins; guardarEnArchivo(); io.emit('config_actual', configGlobal); io.emit('racha_data_update', configGlobal.racha); });
});

http.listen(3000, () => console.log('🚀 Servidor encendido en el puerto 3000.'));