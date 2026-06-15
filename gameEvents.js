const { WebcastPushConnection } = require('tiktok-live-connector');

// Mantenemos cooldowns por cada sala/usuario para no mezclar
const saasCooldowns = new Map();

function setupGameEvents(io, configGlobal) {
    console.log("🎮 Motor SaaS Venta iniciado. Esperando clientes...");

    io.on('connection', (socket) => {
        let myTikTokConnection = null;
        let currentTikTokUser = null;

        socket.on('saas_conectar', (tiktokUsername) => {
            let userLimpio = tiktokUsername.replace('@', '').trim();
            if (!userLimpio) return;

            // Si el cliente ya estaba escuchando a alguien, desconectamos la anterior
            if (myTikTokConnection) {
                try { myTikTokConnection.disconnect(); } catch (e) {}
            }

            currentTikTokUser = userLimpio;
            socket.emit('saas_estado', { estado: 'conectando', msg: `🟡 Conectando a @${userLimpio}...` });

            myTikTokConnection = new WebcastPushConnection(userLimpio);

            myTikTokConnection.connect().then(() => {
                socket.emit('saas_estado', { estado: 'conectado', msg: `🟢 Escuchando a @${userLimpio}` });
                console.log(`✅ [SaaS] Cliente conectado al Live de: @${userLimpio}`);
                
                // 1. REGALOS VIP (Muestra foto y nombre)
                myTikTokConnection.on('gift', (data) => {
                    if (data.giftType === 1 && !data.repeatEnd) return;
                    const totalCoins = data.diamondCount * data.repeatCount;
                    if (totalCoins > 0) {
                        let cleanName = (data.nickname || data.uniqueId).replace(/[^a-zA-Z0-9\sÁÉÍÓÚáéíóúÑñ]/g, '').trim();
                        let avatarUrl = (data.userDetails && data.userDetails.profilePictureUrls && data.userDetails.profilePictureUrls.length > 0) ? data.userDetails.profilePictureUrls[0] : "";
                        
                        let cantidadFinal = 0;
                        const bolitaConf = (configGlobal && configGlobal.bolita) ? configGlobal.bolita : {};

                        // Detecta el "Quiéreme"
                        if (data.giftId === 7934 || data.giftId === "7934") {
                            let quiereMeGlobos = bolitaConf.quiereMeGlobos !== undefined ? bolitaConf.quiereMeGlobos : 60;
                            cantidadFinal = quiereMeGlobos * data.repeatCount;
                        } else {
                            let multiplicador = bolitaConf.multiplicador !== undefined ? bolitaConf.multiplicador : 2;
                            cantidadFinal = totalCoins * multiplicador;
                        }
                        
                        socket.emit('saas_game_gift', { usuario: cleanName, avatar: avatarUrl, monedas: totalCoins, cantidadGlobos: cantidadFinal });
                    }
                });

                // 2. CHAT (Modo Sigilo)
                myTikTokConnection.on('chat', (data) => {
                    const bolitaConf = (configGlobal && configGlobal.bolita) ? configGlobal.bolita : {};
                    if (bolitaConf.allowFree === false) return; // Filtro de apagar cosas gratis

                    const texto = data.comment.toLowerCase();
                    const user = data.uniqueId;
                    const wordsStr = (bolitaConf.chatWord || "globos").toLowerCase();
                    const wordsArray = wordsStr.split(',').map(w => w.trim()).filter(w => w.length > 0);
                    const match = wordsArray.find(word => texto.includes(word));

                    if (match) {
                        const cooldownSecs = bolitaConf.chatCooldown !== undefined ? bolitaConf.chatCooldown : 60;
                        const mapKey = `chat_${currentTikTokUser}_${user}`;
                        const now = Date.now();
                        const userLastTime = saasCooldowns.get(mapKey) || 0;

                        if ((now - userLastTime) / 1000 >= cooldownSecs) {
                            saasCooldowns.set(mapKey, now);
                            socket.emit('saas_game_chat', { cantidadGlobos: bolitaConf.chatGlobos || 1 });
                        }
                    }
                });

                // 3. LIKES (Modo Sigilo)
                myTikTokConnection.on('like', (data) => {
                    const bolitaConf = (configGlobal && configGlobal.bolita) ? configGlobal.bolita : {};
                    if (bolitaConf.allowFree === false) return;

                    const likesMeta = bolitaConf.likesMeta || 50;
                    if (data.likeCount >= likesMeta) {
                        socket.emit('saas_game_like', { cantidadGlobos: bolitaConf.likesGlobos || 1 });
                    }
                });

                // 4. FOLLOWS (Modo Sigilo)
                myTikTokConnection.on('follow', (data) => {
                    const bolitaConf = (configGlobal && configGlobal.bolita) ? configGlobal.bolita : {};
                    if (bolitaConf.allowFree === false) return;

                    const user = data.uniqueId;
                    const cooldownSecs = bolitaConf.followCooldown !== undefined ? bolitaConf.followCooldown : 300;
                    const mapKey = `follow_${currentTikTokUser}_${user}`;
                    const now = Date.now();
                    const userLastTime = saasCooldowns.get(mapKey) || 0;

                    if ((now - userLastTime) / 1000 >= cooldownSecs) {
                        saasCooldowns.set(mapKey, now);
                        socket.emit('saas_game_follow', { cantidadGlobos: bolitaConf.followGlobos || 5 });
                    }
                });

            }).catch(err => {
                socket.emit('saas_estado', { estado: 'error', msg: `❌ Error: No en Live o no existe` });
                myTikTokConnection = null;
            });

            myTikTokConnection.on('streamEnd', () => {
                socket.emit('saas_estado', { estado: 'error', msg: `⬛ Live terminado` });
                try { myTikTokConnection.disconnect(); } catch(e){}
            });

            myTikTokConnection.on('disconnected', () => {
                socket.emit('saas_estado', { estado: 'error', msg: `🔴 Desconectado de TikTok` });
                try { myTikTokConnection.disconnect(); } catch(e){}
            });
        });

        // Limpieza si el cliente cierra la pestaña del juego
        socket.on('disconnect', () => {
            if (myTikTokConnection) {
                try { myTikTokConnection.disconnect(); } catch (e) {}
            }
        });
    });
}

module.exports = setupGameEvents;