const { WebcastPushConnection } = require('tiktok-live-connector');

const saasCooldowns = new Map();

function setupGameEvents(io, configGlobal) {
    console.log("🎮 Motor SaaS Venta iniciado. Esperando clientes...");

    io.on('connection', (socket) => {
        let myTikTokConnection = null;
        let currentTikTokUser = null;

        socket.on('saas_conectar', (tiktokUsername) => {
            let userLimpio = tiktokUsername.replace('@', '').trim();
            if (!userLimpio) return;

            if (myTikTokConnection) {
                try { myTikTokConnection.disconnect(); } catch (e) {}
            }

            currentTikTokUser = userLimpio;
            // 🌟 NUEVO: Acumulador de Likes Inteligente
            let likeAccumulator = 0; 
            
            socket.emit('saas_estado', { estado: 'conectando', msg: `🟡 Conectando a @${userLimpio}...` });

            myTikTokConnection = new WebcastPushConnection(userLimpio);

            myTikTokConnection.connect().then(() => {
                socket.emit('saas_estado', { estado: 'conectado', msg: `🟢 Escuchando a @${userLimpio}` });
                console.log(`✅ [SaaS] Cliente conectado al Live de: @${userLimpio}`);
                
                // 1. REGALOS VIP 
                myTikTokConnection.on('gift', (data) => {
                    if (data.giftType === 1 && !data.repeatEnd) return;
                    const totalCoins = data.diamondCount * data.repeatCount;
                    if (totalCoins > 0) {
                        let cleanName = (data.nickname || data.uniqueId).replace(/[^a-zA-Z0-9\sÁÉÍÓÚáéíóúÑñ]/g, '').trim();
                        let avatarUrl = (data.userDetails && data.userDetails.profilePictureUrls && data.userDetails.profilePictureUrls.length > 0) ? data.userDetails.profilePictureUrls[0] : "";
                        
                        let cantidadFinal = 0;
                        const bolitaConf = (configGlobal && configGlobal.bolita) ? configGlobal.bolita : {};

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

                // 2. CHAT (Modo Sigilo y Números Mágicos)
                myTikTokConnection.on('chat', (data) => {
                    const bolitaConf = (configGlobal && configGlobal.bolita) ? configGlobal.bolita : {};
                    if (bolitaConf.allowFree === false) return; 

                    const texto = data.comment.toLowerCase().trim();
                    const user = data.uniqueId;
                    const cooldownSecs = bolitaConf.chatCooldown !== undefined ? bolitaConf.chatCooldown : 60;
                    const now = Date.now();

                    // 🌟 NUEVA LÓGICA: Comandos Numéricos (Ej. "67")
                    if (bolitaConf.allowNumberCommands && /^\d+$/.test(texto)) {
                        let num = parseInt(texto);
                        // Límite de seguridad de 1000 globos para que no te crasheen la PC los trolls
                        if (num > 0 && num <= 1000) { 
                            const mapKeyNum = `chatnum_${currentTikTokUser}_${user}`;
                            const userLastTimeNum = saasCooldowns.get(mapKeyNum) || 0;

                            if ((now - userLastTimeNum) / 1000 >= cooldownSecs) {
                                saasCooldowns.set(mapKeyNum, now);
                                socket.emit('saas_game_chat', { cantidadGlobos: num });
                                return; // Si es un número, termina aquí y no lee el resto
                            }
                        }
                    }

                    // Lógica normal de palabras clave
                    const wordsStr = (bolitaConf.chatWord || "globos").toLowerCase();
                    const wordsArray = wordsStr.split(',').map(w => w.trim()).filter(w => w.length > 0);
                    const match = wordsArray.find(word => texto.includes(word));

                    if (match) {
                        const mapKey = `chat_${currentTikTokUser}_${user}`;
                        const userLastTime = saasCooldowns.get(mapKey) || 0;

                        if ((now - userLastTime) / 1000 >= cooldownSecs) {
                            saasCooldowns.set(mapKey, now);
                            socket.emit('saas_game_chat', { cantidadGlobos: bolitaConf.chatGlobos || 1 });
                        }
                    }
                });

                // 3. LIKES (Tap Tap 100% Preciso)
                myTikTokConnection.on('like', (data) => {
                    const bolitaConf = (configGlobal && configGlobal.bolita) ? configGlobal.bolita : {};
                    if (bolitaConf.allowFree === false) return;

                    let batchLikes = data.likeCount || 1;
                    likeAccumulator += batchLikes; // Sumamos a la bolsa global de likes de la sala

                    const likesMeta = bolitaConf.likesMeta || 50;
                    
                    if (likeAccumulator >= likesMeta) {
                        let multiplicadorVeces = Math.floor(likeAccumulator / likesMeta);
                        likeAccumulator = likeAccumulator % likesMeta; // Guardamos el residuo para la siguiente meta
                        
                        let globosTotales = (bolitaConf.likesGlobos || 1) * multiplicadorVeces;
                        socket.emit('saas_game_like', { cantidadGlobos: globosTotales });
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

                // 5. 🌟 NUEVO: ESPECTADORES UNIDOS (Join)
                myTikTokConnection.on('member', (data) => {
                    const bolitaConf = (configGlobal && configGlobal.bolita) ? configGlobal.bolita : {};
                    if (bolitaConf.allowFree === false || !bolitaConf.enableJoin) return;

                    const user = data.uniqueId;
                    // Usamos un cooldown para evitar ataques de bots de vistas
                    const cooldownSecs = bolitaConf.followCooldown !== undefined ? bolitaConf.followCooldown : 300; 
                    const mapKey = `join_${currentTikTokUser}_${user}`;
                    const now = Date.now();
                    const userLastTime = saasCooldowns.get(mapKey) || 0;

                    if ((now - userLastTime) / 1000 >= cooldownSecs) {
                        saasCooldowns.set(mapKey, now);
                        socket.emit('saas_game_join', { cantidadGlobos: bolitaConf.joinGlobos || 1 });
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

        socket.on('disconnect', () => {
            if (myTikTokConnection) {
                try { myTikTokConnection.disconnect(); } catch (e) {}
            }
        });
    });
}

module.exports = setupGameEvents;