const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });
const { WebcastPushConnection } = require('tiktok-live-connector');
const fs = require('fs'); 
const path = require('path'); 
const setupGameEvents = require('./gameEvents'); 

const pathData = path.join(__dirname, 'data.json');
const pathCatalogo = path.join(__dirname, 'catalogo_regalos.json'); 

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html'))); 

app.get('/vista_conexion', (req, res) => res.sendFile(path.join(__dirname, 'vistas', 'vista_conexion.html')));
app.get('/vista_versus', (req, res) => res.sendFile(path.join(__dirname, 'vistas', 'vista_versus.html')));
app.get('/vista_racha', (req, res) => res.sendFile(path.join(__dirname, 'vistas', 'vista_racha.html')));
app.get('/vista_regalos', (req, res) => res.sendFile(path.join(__dirname, 'vistas', 'vista_regalos.html')));
app.get('/vista_racha_versus', (req, res) => res.sendFile(path.join(__dirname, 'vistas', 'vista_racha_versus.html')));
app.get('/vista_bolita_globos', (req, res) => res.sendFile(path.join(__dirname, 'vistas', 'vista_bolita_globos.html')));
app.get('/vista_meta_likes', (req, res) => res.sendFile(path.join(__dirname, 'vistas', 'vista_meta_likes.html')));
app.get('/vista_top_likes', (req, res) => res.sendFile(path.join(__dirname, 'vistas', 'vista_top_likes.html')));
app.get('/vista_top_donadores', (req, res) => res.sendFile(path.join(__dirname, 'vistas', 'vista_top_donadores.html')));

app.get('/versus', (req, res) => res.sendFile(path.join(__dirname, 'overlays', 'versus.html'))); 
app.get('/pop_regalos', (req, res) => res.sendFile(path.join(__dirname, 'overlays', 'pop_regalos.html'))); 
app.get('/racha', (req, res) => res.sendFile(path.join(__dirname, 'overlays', 'racha.html'))); 
app.get('/racha_versus', (req, res) => res.sendFile(path.join(__dirname, 'overlays', 'racha_versus.html')));
app.get('/meta_likes', (req, res) => res.sendFile(path.join(__dirname, 'overlays', 'meta_likes.html')));
app.get('/top_likes', (req, res) => res.sendFile(path.join(__dirname, 'overlays', 'top_likes.html')));
app.get('/top_donadores', (req, res) => res.sendFile(path.join(__dirname, 'overlays', 'top_donadores.html')));

let topDonators = {};
let topSorted = [];
let teamSalvar = { total: 0, donators: {} };
let teamReiniciar = { total: 0, donators: {} };
let catalogoGlobal = [];
let currentTotalLikes = 0; 

const regalosEq1Defecto = [{ id: 6064, name: "GG", diamonds: 1 }, { id: 9947, name: "BFF Necklace", diamonds: 10 }];
const regalosEq2Defecto = [{ id: 5655, name: "Rose", diamonds: 1 }, { id: 8913, name: "Rosa", diamonds: 10 }];

let configGlobal = {
    username: "", historial: [],
    equipo1: { nombre: "SALVAR", sub: "GG", color: "#00ff66", regalos: regalosEq1Defecto },
    equipo2: { nombre: "REINICIAR", sub: "ROSA", color: "#ff003c", regalos: regalosEq2Defecto },
    enableCountdown: true, countdownSeconds: 30, showTopText: true, showDonatorCoins: true,
    showEmoticons: true, roundGifts: true, showTopDonators: true,
    regalosDisponibles: [],
    racha: { topRound: {}, recordDiario: {}, recordHistorico: {}, showPhoto: true, showCoins: false },
    rachaVersus: { salvadas: {}, reinicios: {}, showName: true, showCount: true, showCoins: true },
    bolita: { multiplicador: 2, chatWord: "globos, jugar", chatGlobos: 1, chatCooldown: 60, likesMeta: 50, likesGlobos: 1, followGlobos: 5, followCooldown: 300, allowFree: true, quiereMeGlobos: 60 },
    metaLikes: { active: false, firstGoal: 0, step: 20000, prefixText: "A los", actionText: "REINICIO", currentGoal: 20000, style: { fontSize: 45, color: "#ffffff", shadowColor: "#ff003c", fontFamily: "'Luckiest Guy', cursive" } },
    topLikes: { currentRound: {}, recordHistorico: {}, mirrorMode: false }, // 🌟 Agregado mirrorMode
    topVIP: { currentRound: {}, recordHistorico: {}, displayLimit: 2, mirrorMode: false } // 🌟 Agregado mirrorMode
};

if (fs.existsSync(pathData)) {
    try { 
        let guardado = JSON.parse(fs.readFileSync(pathData, 'utf8')); 
        configGlobal = { ...configGlobal, ...guardado };
        if(!configGlobal.rachaVersus) configGlobal.rachaVersus = { salvadas: {}, reinicios: {}, showName: true, showCount: true, showCoins: true };
        if(!configGlobal.bolita) configGlobal.bolita = { multiplicador: 2, chatWord: "globos, jugar", chatGlobos: 1, chatCooldown: 60, likesMeta: 50, likesGlobos: 1, followGlobos: 5, followCooldown: 300, allowFree: true, quiereMeGlobos: 60 };
        if(!configGlobal.metaLikes) configGlobal.metaLikes = { active: false, firstGoal: 0, step: 20000, prefixText: "A los", actionText: "REINICIO", currentGoal: 20000, style: { fontSize: 45, color: "#ffffff", shadowColor: "#ff003c", fontFamily: "'Luckiest Guy', cursive" } };
        if(!configGlobal.topLikes) configGlobal.topLikes = { currentRound: {}, recordHistorico: {}, mirrorMode: false };
        if(configGlobal.topLikes.mirrorMode === undefined) configGlobal.topLikes.mirrorMode = false;
        if(!configGlobal.topVIP) configGlobal.topVIP = { currentRound: {}, recordHistorico: {}, displayLimit: 2, mirrorMode: false };
        if(!configGlobal.topVIP.displayLimit) configGlobal.topVIP.displayLimit = 2; 
        if(configGlobal.topVIP.mirrorMode === undefined) configGlobal.topVIP.mirrorMode = false;
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

function cerrarRondasGlobales() {
    let seCerroAlgo = false;

    let arrLikes = Object.entries(configGlobal.topLikes.currentRound).map(([u, d]) => ({userKey: u, ...d})).sort((a,b) => b.likes - a.likes);
    if (arrLikes.length > 0) {
        let top1 = arrLikes[0]; 
        if(!configGlobal.topLikes.recordHistorico[top1.userKey]) configGlobal.topLikes.recordHistorico[top1.userKey] = { avatar: top1.avatar, displayName: top1.displayName, wins: 0 };
        configGlobal.topLikes.recordHistorico[top1.userKey].wins += 1; 
        configGlobal.topLikes.recordHistorico[top1.userKey].avatar = top1.avatar; 
        configGlobal.topLikes.recordHistorico[top1.userKey].displayName = top1.displayName; 
        configGlobal.topLikes.currentRound = {}; 
        seCerroAlgo = true;
    }

    let arrVIPs = Object.entries(configGlobal.topVIP.currentRound).map(([u, d]) => ({userKey: u, ...d})).sort((a,b) => b.coins - a.coins);
    if (arrVIPs.length > 0) {
        let top1 = arrVIPs[0]; 
        if(!configGlobal.topVIP.recordHistorico[top1.userKey]) configGlobal.topVIP.recordHistorico[top1.userKey] = { avatar: top1.avatar, displayName: top1.displayName, wins: 0 };
        configGlobal.topVIP.recordHistorico[top1.userKey].wins += 1; 
        configGlobal.topVIP.recordHistorico[top1.userKey].avatar = top1.avatar; 
        configGlobal.topVIP.recordHistorico[top1.userKey].displayName = top1.displayName; 
        configGlobal.topVIP.currentRound = {}; 
        seCerroAlgo = true;
    }

    let arrRachas = Object.values(configGlobal.racha.topRound).sort((a,b) => b.monedas - a.monedas);
    if (arrRachas.length > 0) {
        let top1 = arrRachas[0]; let name = top1.displayName;
        if(!configGlobal.racha.recordDiario[name]) configGlobal.racha.recordDiario[name] = { avatar: top1.avatar, displayName: name, wins: 0, monedas: 0 };
        configGlobal.racha.recordDiario[name].wins += 1; 
        configGlobal.racha.recordDiario[name].avatar = top1.avatar; 
        configGlobal.racha.recordDiario[name].monedas += top1.monedas;
        
        if(!configGlobal.racha.recordHistorico[name]) configGlobal.racha.recordHistorico[name] = { avatar: top1.avatar, displayName: name, wins: 0, monedas: 0 };
        configGlobal.racha.recordHistorico[name].wins += 1; 
        configGlobal.racha.recordHistorico[name].avatar = top1.avatar; 
        configGlobal.racha.recordHistorico[name].monedas += top1.monedas;
        
        configGlobal.racha.topRound = {}; 
        seCerroAlgo = true;
    }

    if (seCerroAlgo) {
        guardarEnArchivo(); 
        io.emit('top_likes_data_update', configGlobal.topLikes); 
        io.emit('top_vip_data_update', configGlobal.topVIP); 
        io.emit('racha_data_update', configGlobal.racha);
        io.emit('config_actual', configGlobal);
        io.emit('racha_animacion'); 
    }
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
        currentTotalLikes = 0; 
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

    connectionInstance.on('like', data => {
        let totalTikTok = parseInt(data.totalLikeCount);
        let batchLikes = parseInt(data.likeCount) || 1;

        if (!isNaN(totalTikTok) && totalTikTok > currentTotalLikes) {
            currentTotalLikes = totalTikTok;
        } else {
            currentTotalLikes += batchLikes;
        }
        
        io.emit('sync_likes_actuales', currentTotalLikes);

        if (configGlobal.metaLikes && configGlobal.metaLikes.active) {
            let meta = configGlobal.metaLikes;
            let cGoal = parseInt(meta.currentGoal) || 0;
            let mStep = parseInt(meta.step) || 20000;
            
            if (cGoal > 0 && currentTotalLikes >= cGoal) {
                io.emit('meta_likes_reached', { goal: cGoal, text: meta.actionText });
                meta.firstGoal = 0;
                while (cGoal <= currentTotalLikes) { cGoal += mStep; }
                meta.currentGoal = cGoal; 
                guardarEnArchivo();
                io.emit('config_actual', configGlobal);
                
                setTimeout(() => {
                    io.emit('meta_likes_update', { current: currentTotalLikes, goal: cGoal, text: meta.actionText, prefix: meta.prefixText, style: meta.style });
                }, 4000); 
            } else {
                io.emit('meta_likes_update', { current: currentTotalLikes, goal: cGoal, text: meta.actionText, prefix: meta.prefixText, style: meta.style });
            }
        }

        let user = data.uniqueId;
        let cleanName = (data.nickname || data.uniqueId).replace(/[^a-zA-Z0-9\sÁÉÍÓÚáéíóúÑñ]/g, '').trim() || user;
        if (cleanName.length > 12) { cleanName = cleanName.substring(0, 12) + "..."; }
        
        let avatarUrl = "https://www.gravatar.com/avatar/0?d=mp&f=y";
        if (data.profilePictureUrl) {
            avatarUrl = data.profilePictureUrl;
        } else if (data.userDetails && data.userDetails.profilePictureUrls && data.userDetails.profilePictureUrls.length > 0) {
            avatarUrl = data.userDetails.profilePictureUrls[0];
        }

        if (!configGlobal.topLikes.currentRound[user]) {
            configGlobal.topLikes.currentRound[user] = { likes: 0, avatar: avatarUrl, displayName: cleanName };
        } else {
            configGlobal.topLikes.currentRound[user].avatar = avatarUrl;
            configGlobal.topLikes.currentRound[user].displayName = cleanName;
        }
        configGlobal.topLikes.currentRound[user].likes += batchLikes;
        
        io.emit('top_likes_data_update', configGlobal.topLikes);
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
        if (cleanName.length > 12) { cleanName = cleanName.substring(0, 12) + "..."; }
        
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

        if (!configGlobal.topVIP.currentRound[user]) {
            configGlobal.topVIP.currentRound[user] = { coins: 0, avatar: avatarUrl, displayName: cleanName };
        } else {
            configGlobal.topVIP.currentRound[user].avatar = avatarUrl;
            configGlobal.topVIP.currentRound[user].displayName = cleanName;
        }
        configGlobal.topVIP.currentRound[user].coins += totalCoins;
        io.emit('top_vip_data_update', configGlobal.topVIP);

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
    socket.emit('racha_versus_update', configGlobal.rachaVersus);
    socket.emit('sync_likes_actuales', currentTotalLikes);
    socket.emit('top_likes_data_update', configGlobal.topLikes); 
    socket.emit('top_vip_data_update', configGlobal.topVIP); 

    if(configGlobal.metaLikes) {
        socket.emit('meta_likes_update', { current: currentTotalLikes, goal: configGlobal.metaLikes.currentGoal, text: configGlobal.metaLikes.actionText, prefix: configGlobal.metaLikes.prefixText, style: configGlobal.metaLikes.style });
    }
    emitSalvarUpdate(socket);

    socket.on('comando_conectar', (usuario) => { configGlobal.username = usuario.trim(); guardarEnArchivo(); conectarTikTok(configGlobal.username); });
    socket.on('comando_desconectar', () => { desconectarTikTok(); });

    socket.on('guardar_config', (nuevaConfig) => {
        nuevaConfig.historial = configGlobal.historial; nuevaConfig.username = configGlobal.username;
        nuevaConfig.regalosDisponibles = configGlobal.regalosDisponibles; 
        nuevaConfig.racha = configGlobal.racha; nuevaConfig.rachaVersus = configGlobal.rachaVersus;
        nuevaConfig.bolita = configGlobal.bolita; 
        nuevaConfig.metaLikes = configGlobal.metaLikes; 
        nuevaConfig.topLikes = configGlobal.topLikes;
        nuevaConfig.topVIP = configGlobal.topVIP;
        configGlobal = nuevaConfig; guardarEnArchivo(); io.emit('config_actual', configGlobal); emitSalvarUpdate(io); 
    });

    socket.on('guardar_meta_likes', (data) => {
        configGlobal.metaLikes = data.config;
        let mStep = parseInt(configGlobal.metaLikes.step) || 100;
        let mFirstGoal = parseInt(configGlobal.metaLikes.firstGoal) || 0;
        if (mFirstGoal > currentTotalLikes) {
            configGlobal.metaLikes.currentGoal = mFirstGoal;
        } else {
            let base = Math.floor(currentTotalLikes / mStep) * mStep;
            configGlobal.metaLikes.currentGoal = base + mStep;
        }
        configGlobal.metaLikes.step = mStep;
        configGlobal.metaLikes.firstGoal = mFirstGoal; 
        guardarEnArchivo();
        io.emit('config_actual', configGlobal); 
        io.emit('meta_likes_update', { current: currentTotalLikes, goal: configGlobal.metaLikes.currentGoal, text: configGlobal.metaLikes.actionText, prefix: configGlobal.metaLikes.prefixText, style: configGlobal.metaLikes.style });
    });

    socket.on('force_fetch_likes', async () => {
        if (tiktokLiveConnection) {
            try {
                let roomInfo = await tiktokLiveConnection.getRoomInfo();
                let fetchedLikes = 0;
                
                if (roomInfo && roomInfo.like_count) fetchedLikes = parseInt(roomInfo.like_count);
                else if (roomInfo && roomInfo.data && roomInfo.data.like_count) fetchedLikes = parseInt(roomInfo.data.like_count);
                else if (roomInfo && roomInfo.stats && roomInfo.stats.likeCount) fetchedLikes = parseInt(roomInfo.stats.likeCount);

                if (!isNaN(fetchedLikes)) {
                    currentTotalLikes = fetchedLikes;
                    io.emit('sync_likes_actuales', currentTotalLikes);
                }
            } catch (error) {
                console.log("No se pudo extraer la información de la sala manualmente.", error);
            }
        }
    });

    socket.on('top_cerrar_ambas_rondas', () => { cerrarRondasGlobales(); });

    socket.on('top_likes_limpiar_ronda', () => { configGlobal.topLikes.currentRound = {}; guardarEnArchivo(); io.emit('top_likes_data_update', configGlobal.topLikes); });
    socket.on('top_likes_limpiar_historial', () => { configGlobal.topLikes.recordHistorico = {}; guardarEnArchivo(); io.emit('top_likes_data_update', configGlobal.topLikes); });
    socket.on('top_likes_eliminar_ronda', (userKey) => { delete configGlobal.topLikes.currentRound[userKey]; guardarEnArchivo(); io.emit('top_likes_data_update', configGlobal.topLikes); });
    
    socket.on('top_likes_eliminar_historial', (userKey) => { 
        let hist = configGlobal.topLikes.recordHistorico[userKey];
        if(hist) {
            let name = hist.displayName;
            delete configGlobal.racha.recordHistorico[name];
            delete configGlobal.racha.recordDiario[name];
        }
        delete configGlobal.topLikes.recordHistorico[userKey]; 
        guardarEnArchivo(); 
        io.emit('top_likes_data_update', configGlobal.topLikes); 
        io.emit('racha_data_update', configGlobal.racha);
    });

    socket.on('top_likes_ajuste_historial', (data) => { 
        let hist = configGlobal.topLikes.recordHistorico[data.userKey]; 
        if(hist) { 
            hist.wins += data.amount; if(hist.wins < 0) hist.wins = 0; 
            
            let rachaKey = hist.displayName;
            if(!configGlobal.racha.recordHistorico[rachaKey]) configGlobal.racha.recordHistorico[rachaKey] = { avatar: hist.avatar, displayName: hist.displayName, wins: 0, monedas: 0 };
            configGlobal.racha.recordHistorico[rachaKey].wins += data.amount;
            if(configGlobal.racha.recordHistorico[rachaKey].wins < 0) configGlobal.racha.recordHistorico[rachaKey].wins = 0;
            
            if(!configGlobal.racha.recordDiario[rachaKey]) configGlobal.racha.recordDiario[rachaKey] = { avatar: hist.avatar, displayName: hist.displayName, wins: 0, monedas: 0 };
            configGlobal.racha.recordDiario[rachaKey].wins += data.amount;
            if(configGlobal.racha.recordDiario[rachaKey].wins < 0) configGlobal.racha.recordDiario[rachaKey].wins = 0;

            guardarEnArchivo(); 
            io.emit('top_likes_data_update', configGlobal.topLikes); 
            io.emit('racha_data_update', configGlobal.racha);
        } 
    });

    // 🌟 COMANDO NUEVO: Guardar Opciones (Espejo)
    socket.on('top_likes_guardar_opciones', (opts) => { 
        configGlobal.topLikes.mirrorMode = opts.mirrorMode; 
        guardarEnArchivo(); 
        io.emit('config_actual', configGlobal); 
        io.emit('top_likes_data_update', configGlobal.topLikes); 
    });

    socket.on('top_vip_limpiar_ronda', () => { configGlobal.topVIP.currentRound = {}; guardarEnArchivo(); io.emit('top_vip_data_update', configGlobal.topVIP); });
    socket.on('top_vip_limpiar_historial', () => { configGlobal.topVIP.recordHistorico = {}; guardarEnArchivo(); io.emit('top_vip_data_update', configGlobal.topVIP); });
    socket.on('top_vip_eliminar_ronda', (userKey) => { delete configGlobal.topVIP.currentRound[userKey]; guardarEnArchivo(); io.emit('top_vip_data_update', configGlobal.topVIP); });
    
    socket.on('top_vip_eliminar_historial', (userKey) => { 
        let hist = configGlobal.topVIP.recordHistorico[userKey];
        if(hist) {
            let name = hist.displayName;
            delete configGlobal.racha.recordHistorico[name];
            delete configGlobal.racha.recordDiario[name];
        }
        delete configGlobal.topVIP.recordHistorico[userKey]; 
        guardarEnArchivo(); 
        io.emit('top_vip_data_update', configGlobal.topVIP); 
        io.emit('racha_data_update', configGlobal.racha);
    });

    socket.on('top_vip_ajuste_historial', (data) => { 
        let hist = configGlobal.topVIP.recordHistorico[data.userKey]; 
        if(hist) { 
            hist.wins += data.amount; if(hist.wins < 0) hist.wins = 0; 
            
            let rachaKey = hist.displayName;
            if(!configGlobal.racha.recordHistorico[rachaKey]) configGlobal.racha.recordHistorico[rachaKey] = { avatar: hist.avatar, displayName: hist.displayName, wins: 0, monedas: 0 };
            configGlobal.racha.recordHistorico[rachaKey].wins += data.amount;
            if(configGlobal.racha.recordHistorico[rachaKey].wins < 0) configGlobal.racha.recordHistorico[rachaKey].wins = 0;
            
            if(!configGlobal.racha.recordDiario[rachaKey]) configGlobal.racha.recordDiario[rachaKey] = { avatar: hist.avatar, displayName: hist.displayName, wins: 0, monedas: 0 };
            configGlobal.racha.recordDiario[rachaKey].wins += data.amount;
            if(configGlobal.racha.recordDiario[rachaKey].wins < 0) configGlobal.racha.recordDiario[rachaKey].wins = 0;

            guardarEnArchivo(); 
            io.emit('top_vip_data_update', configGlobal.topVIP); 
            io.emit('racha_data_update', configGlobal.racha);
        } 
    });
    
    socket.on('top_vip_ajuste_ronda', (data) => { let ronda = configGlobal.topVIP.currentRound[data.userKey]; if(ronda) { ronda.coins += data.amount; if(ronda.coins < 0) ronda.coins = 0; guardarEnArchivo(); io.emit('top_vip_data_update', configGlobal.topVIP); } });
    
    // 🌟 ACTUALIZADO: Guardar Límite y Espejo
    socket.on('top_vip_guardar_opciones', (opts) => { 
        configGlobal.topVIP.displayLimit = opts.displayLimit; 
        configGlobal.topVIP.mirrorMode = opts.mirrorMode; 
        guardarEnArchivo(); 
        io.emit('config_actual', configGlobal); 
        io.emit('top_vip_data_update', configGlobal.topVIP); 
    });

    socket.on('racha_iniciar_ronda', () => { configGlobal.racha.topRound = {}; guardarEnArchivo(); io.emit('racha_data_update', configGlobal.racha); });
    socket.on('racha_cerrar_ronda', () => { cerrarRondasGlobales(); });
    
    socket.on('racha_ajuste', (data) => {
        let lista = data.tipo === 'diario' ? configGlobal.racha.recordDiario : configGlobal.racha.recordHistorico;
        if(lista[data.name]) { 
            lista[data.name].wins += data.amount; 
            if(lista[data.name].wins < 0) lista[data.name].wins = 0; 

            let userKeyVip = Object.keys(configGlobal.topVIP.recordHistorico).find(k => configGlobal.topVIP.recordHistorico[k].displayName === data.name);
            if(userKeyVip) {
                configGlobal.topVIP.recordHistorico[userKeyVip].wins += data.amount;
                if(configGlobal.topVIP.recordHistorico[userKeyVip].wins < 0) configGlobal.topVIP.recordHistorico[userKeyVip].wins = 0;
                io.emit('top_vip_data_update', configGlobal.topVIP);
            }
            
            let userKeyLikes = Object.keys(configGlobal.topLikes.recordHistorico).find(k => configGlobal.topLikes.recordHistorico[k].displayName === data.name);
            if(userKeyLikes) {
                configGlobal.topLikes.recordHistorico[userKeyLikes].wins += data.amount;
                if(configGlobal.topLikes.recordHistorico[userKeyLikes].wins < 0) configGlobal.topLikes.recordHistorico[userKeyLikes].wins = 0;
                io.emit('top_likes_data_update', configGlobal.topLikes);
            }

            guardarEnArchivo(); 
            io.emit('racha_data_update', configGlobal.racha); 
        }
    });

    socket.on('racha_eliminar_usuario', (data) => {
        let lista = data.tipo === 'diario' ? configGlobal.racha.recordDiario : configGlobal.racha.recordHistorico;
        if(lista[data.name]) { delete lista[data.name]; guardarEnArchivo(); io.emit('racha_data_update', configGlobal.racha); }
    });
    
    socket.on('racha_cerrar_historico', () => { configGlobal.racha.recordHistorico = {}; guardarEnArchivo(); io.emit('racha_data_update', configGlobal.racha); });
    socket.on('racha_cerrar_diaria', () => { configGlobal.racha.recordDiario = {}; configGlobal.racha.topRound = {}; guardarEnArchivo(); io.emit('racha_data_update', configGlobal.racha); });
    socket.on('racha_guardar_opciones', (opts) => { configGlobal.racha.showPhoto = opts.showPhoto; configGlobal.racha.showCoins = opts.showCoins; guardarEnArchivo(); io.emit('config_actual', configGlobal); io.emit('racha_data_update', configGlobal.racha); });

    socket.on('guardar_config_bolita', (bolitaConfig) => { configGlobal.bolita = bolitaConfig; guardarEnArchivo(); io.emit('config_actual', configGlobal); });
    socket.on('modificar_puntos_equipo', (data) => {
        if (data.equipo === 1) { teamSalvar.total += data.cantidad; if (teamSalvar.total < 0) teamSalvar.total = 0; } 
        else if (data.equipo === 2) { teamReiniciar.total += data.cantidad; if (teamReiniciar.total < 0) teamReiniciar.total = 0; }
        emitSalvarUpdate(io);
        if (data.cantidad > 0) io.emit('poder_salvar', { side: data.equipo === 1 ? 'salvar' : 'reiniciar', amount: data.cantidad });
    });
    socket.on('importar_catalogo', (nuevoData) => {
        if (Array.isArray(nuevoData)) {
            nuevoData.forEach(item => { let idx = catalogoGlobal.findIndex(g => g.id === item.id); if (idx === -1) catalogoGlobal.push(item); else catalogoGlobal[idx] = { ...catalogoGlobal[idx], ...item }; });
            catalogoGlobal.sort((a, b) => a.diamonds - b.diamonds); configGlobal.regalosDisponibles = catalogoGlobal;
            guardarEnArchivo(); io.emit('config_actual', configGlobal);
        }
    });
    socket.on('importar_historial', (nuevoData) => {
        if (typeof nuevoData === 'object' && nuevoData !== null && !Array.isArray(nuevoData)) {
            let userActivo = configGlobal.username;
            configGlobal = { ...configGlobal, ...nuevoData };
            if(userActivo) configGlobal.username = userActivo;
            guardarEnArchivo(); io.emit('config_actual', configGlobal); io.emit('racha_data_update', configGlobal.racha); io.emit('racha_versus_update', configGlobal.rachaVersus);
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
    socket.on('reset', () => {
        topDonators = {}; topSorted = []; teamSalvar = { total: 0, donators: {} }; teamReiniciar = { total: 0, donators: {} };
        io.emit('actualizacion', topSorted); emitSalvarUpdate(io);
    });
    socket.on('registrar_victoria_versus', (data) => {
        let tipo = data.tipo; let user = data.user;
        if(!user || !user.name || user.name === 'ESPERANDO') return;
        let targetObj = tipo === 'salvada' ? configGlobal.rachaVersus.salvadas : configGlobal.rachaVersus.reinicios;
        if(!targetObj[user.name]) targetObj[user.name] = { avatar: user.avatar, displayName: user.name, count: 0 };
        targetObj[user.name].count += 1; targetObj[user.name].avatar = user.avatar;
        guardarEnArchivo(); io.emit('racha_versus_update', configGlobal.rachaVersus);
    });
    socket.on('racha_versus_ajuste', (data) => {
        let targetObj = data.tipo === 'salvadas' ? configGlobal.rachaVersus.salvadas : configGlobal.rachaVersus.reinicios;
        if(targetObj[data.name]) { targetObj[data.name].count += data.amount; if(targetObj[data.name].count < 0) targetObj[data.name].count = 0; guardarEnArchivo(); io.emit('racha_versus_update', configGlobal.rachaVersus); }
    });
    socket.on('racha_versus_eliminar', (data) => {
        let targetObj = data.tipo === 'salvadas' ? configGlobal.rachaVersus.salvadas : configGlobal.rachaVersus.reinicios;
        if(targetObj[data.name]) { delete targetObj[data.name]; guardarEnArchivo(); io.emit('racha_versus_update', configGlobal.rachaVersus); }
    });
    socket.on('racha_versus_limpiar', (tipo) => {
        if(tipo === 'salvadas') configGlobal.rachaVersus.salvadas = {}; else configGlobal.rachaVersus.reinicios = {};
        guardarEnArchivo(); io.emit('racha_versus_update', configGlobal.rachaVersus);
    });
    socket.on('racha_versus_guardar_opciones', (opts) => {
        configGlobal.rachaVersus.showName = opts.showName; configGlobal.rachaVersus.showCount = opts.showCount; configGlobal.rachaVersus.showCoins = opts.showCoins;
        guardarEnArchivo(); io.emit('racha_versus_update', configGlobal.rachaVersus);
    });
});

setupGameEvents(io, configGlobal);

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`🚀 Servidor encendido en el puerto ${PORT}`);
});