const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });
const { WebcastPushConnection } = require('tiktok-live-connector');

// --- RUTAS ---
app.get('/versus', (req, res) => res.sendFile(__dirname + '/versus.html'));
app.get('/salvar', (req, res) => res.sendFile(__dirname + '/salvar.html'));
app.get('/', (req, res) => res.sendFile(__dirname + '/panel.html'));

// --- ESTADO GLOBAL ---
let topDonators = {};
let topSorted = [];
let teamSalvar = { total: 0, donators: {} };
let teamReiniciar = { total: 0, donators: {} };

// NUEVA ESTRUCTURA DE CONFIGURACIÓN v1.1.7
let configGlobal = {
    username: "teamgatitos_oficial",
    equipo1: { nombre: "SALVAR", sub: "GG", ids: [6064, 9947, 14488, 12988, 5586, 6267, 7168] },
    equipo2: { nombre: "REINICIAR", sub: "ROSA", ids: [5655, 8913, 5731, 6007, 5509, 7569, 5879] },
    enableCountdown: true,
    showDonatorCoins: true
};

let tiktokLiveConnection = null;

function emitSalvarUpdate(target) {
    let topSalvar = Object.entries(teamSalvar.donators)
        .map(([name, info]) => ({ name: info.displayName, coins: info.coins, avatar: info.avatar }))
        .sort((a, b) => b.coins - a.coins)[0] || { name: 'ESPERANDO', coins: 0, avatar: '' };

    let topReiniciar = Object.entries(teamReiniciar.donators)
        .map(([name, info]) => ({ name: info.displayName, coins: info.coins, avatar: info.avatar }))
        .sort((a, b) => b.coins - a.coins)[0] || { name: 'ESPERANDO', coins: 0, avatar: '' };

    target.emit('actualizacion_salvar', {
        totalSalvar: teamSalvar.total,
        totalReiniciar: teamReiniciar.total,
        topSalvar: topSalvar,
        topReiniciar: topReiniciar
    });
}

function conectarTikTok(usuario) {
    if (tiktokLiveConnection) {
        try { tiktokLiveConnection.disconnect(); console.log(`🔌 Desconectado del directo anterior.`); } 
        catch (e) {}
    }

    if (!usuario || usuario.trim() === "") return;

    let userLimpio = usuario.replace('@', '').trim();
    console.log(`⏳ Conectando a @${userLimpio}...`);
    tiktokLiveConnection = new WebcastPushConnection(userLimpio);

    tiktokLiveConnection.connect()
        .then(() => console.log(`✅ ¡Conectado a @${userLimpio}! v1.1.7 Beta Activa.`))
        .catch(err => console.error(`❌ Error al conectar:`, err.message));

    tiktokLiveConnection.on('gift', data => {
        if (data.giftType === 1 && !data.repeatEnd) return;

        let user = data.uniqueId;
        const coins = data.diamondCount * data.repeatCount;
        
        // 🌟 EXTRACCIÓN DE NOMBRE LIMPIO (Sin emojis)
        let rawName = data.nickname || data.uniqueId;
        let cleanName = rawName.replace(/[^a-zA-Z0-9\sÁÉÍÓÚáéíóúÑñ]/g, '').trim();
        if(cleanName === "") cleanName = user; // Si su nombre era puro emoji, usamos su @

        let avatarUrl = "https://www.gravatar.com/avatar/0?d=mp&f=y";
        if (data.userDetails && data.userDetails.profilePictureUrls && data.userDetails.profilePictureUrls.length > 0) {
            avatarUrl = data.userDetails.profilePictureUrls[0];
        }
        
        // --- Widget Top Global ---
        if (!topDonators[user]) topDonators[user] = { monedas: 0, avatar: avatarUrl, displayName: cleanName };
        else { topDonators[user].avatar = avatarUrl; topDonators[user].displayName = cleanName; }
        topDonators[user].monedas += coins;

        topSorted = Object.entries(topDonators)
            .map(([nombre, info]) => ({ nombre: info.displayName, monedas: info.monedas, avatar: info.avatar }))
            .sort((a, b) => b.monedas - a.monedas)
            .slice(0, 2); 
        
        io.emit('actualizacion', topSorted);
        
        // --- Widget Batalla por Equipos ---
        let giftId = data.giftId;
        let isSalvar = configGlobal.equipo1.ids.includes(giftId);
        let isReiniciar = configGlobal.equipo2.ids.includes(giftId);
        let triggeredTeam = false;

        if (isSalvar) {
            teamSalvar.total += coins;
            if (!teamSalvar.donators[user]) teamSalvar.donators[user] = { coins: 0, avatar: avatarUrl, displayName: cleanName };
            teamSalvar.donators[user].avatar = avatarUrl;
            teamSalvar.donators[user].displayName = cleanName;
            teamSalvar.donators[user].coins += coins;
            triggeredTeam = 'salvar';
        } else if (isReiniciar) {
            teamReiniciar.total += coins;
            if (!teamReiniciar.donators[user]) teamReiniciar.donators[user] = { coins: 0, avatar: avatarUrl, displayName: cleanName };
            teamReiniciar.donators[user].avatar = avatarUrl;
            teamReiniciar.donators[user].displayName = cleanName;
            teamReiniciar.donators[user].coins += coins;
            triggeredTeam = 'reiniciar';
        }

        if (triggeredTeam) {
            emitSalvarUpdate(io);
            io.emit('poder_salvar', { side: triggeredTeam, amount: coins });
        }
    });
}

conectarTikTok(configGlobal.username);

io.on('connection', (socket) => {
    socket.emit('config_actual', configGlobal);
    socket.emit('actualizacion', topSorted);
    emitSalvarUpdate(socket);

    socket.on('guardar_config', (nuevaConfig) => {
        let cambioUsuario = (configGlobal.username !== nuevaConfig.username);
        configGlobal = nuevaConfig;
        
        // Sincronizar inmediatamente la nueva config visual con el frontend
        io.emit('config_actual', configGlobal);
        console.log("⚙️ CONFIGURACIÓN ACTUALIZADA.");

        if (cambioUsuario) conectarTikTok(configGlobal.username);
    });

    socket.on('reset', () => {
        topDonators = {}; topSorted = [];
        teamSalvar = { total: 0, donators: {} };
        teamReiniciar = { total: 0, donators: {} };
        io.emit('actualizacion', topSorted);
        emitSalvarUpdate(io);
    });
});

http.listen(3000, () => console.log('🚀 Servidor encendido en el puerto 3000.'));