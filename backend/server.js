// ============================================
// server.js - PRODUCTION READY
// ============================================

require('dotenv').config();
const port = process.env.PORT || 5000;
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const { ethers } = require("ethers");
const connectDB = require('./src/config/db');
const userRoutes = require('./src/routes/userRoutes');
const activityRoutes = require('./src/routes/activityRoutes');

const GameManager = require('./src/managers/GameManager');
const BlockchainService = require('./src/services/BlockchainService');

const app = express();

app.use(cors({
    origin: process.env.CLIENT_URL || '*',
    methods: ['GET', 'POST'],
    credentials: true
}));

app.use(express.json());

app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path}`);
    next();
});

const server = http.createServer(app);

const io = new Server(server, { 
    cors: { 
        origin: process.env.CLIENT_URL || "*",
        methods: ["GET", "POST"]
    },
    pingTimeout: 60000,
    pingInterval: 25000
});

// --- INITIALIZATION ---

const gameManager = new GameManager(io);

if (process.env.SERVER_PRIVATE_KEY && process.env.CONTRACT_ADDRESS) {
    try {
        BlockchainService.initialize(gameManager);
        console.log("✅ Blockchain Service & Event Listeners Active");
    } catch (err) {
        console.error("⚠️ Failed to init Blockchain Service:", err.message);
        if (process.env.NODE_ENV === 'development') {
            console.error(err);
        }
    }
} else {
    console.warn("⚠️ WEB3 SKIPPED: Missing SERVER_PRIVATE_KEY or CONTRACT_ADDRESS in .env");
}

const playerSecrets = new Map();

setInterval(() => {
    const now = Date.now();
    const TIMEOUT = 5 * 60 * 1000;
    
    for (const [address, data] of playerSecrets.entries()) {
        if (data.timestamp && (now - data.timestamp > TIMEOUT)) {
            playerSecrets.delete(address);
            console.log(`🧹 Cleaned up expired secret for ${address.slice(0, 6)}...`);
        }
    }
}, 60000);

const VALID_LOBBIES = new Set(['TIER_0_LOBBY', 'TIER_1_LOBBY', 'TIER_2_LOBBY']);


// --- API ENDPOINTS ---

app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        blockchain: !!BlockchainService.provider,
        database: 'connected',
        // [SNIPER+] Expose poll mode in health check (useful for debugging)
        pollMode: BlockchainService.isSniperActive 
            ? `Sniper (3s)` 
            : `Coma (30s)`
    });
});

app.use('/api/user', userRoutes);
app.use('/api/activity', activityRoutes);

app.get('/api/game-recovery/:gameId', async (req, res) => {
    try {
        const { gameId } = req.params;
        
        if (!gameId || gameId.length < 5) {
            return res.status(400).json({ 
                error: 'Invalid game ID format',
                code: 'INVALID_GAME_ID'
            });
        }
        
        console.log(`🔍 Recovery request for game: ${gameId}`);
        
        const Game = require('./src/models/Game');
        
        const game = await Game.findOne({ 
            roomId: gameId,
            status: { $in: ['COMPLETED', 'GAME_OVER'] }
        });
        
        if (!game) {
            console.log(`ℹ️ No recoverable game found for ${gameId}`);
            return res.status(404).json({ 
                error: 'No recoverable game found',
                hint: 'Game might still be active or never existed'
            });
        }
        
        if (!game.result || !game.result.signature) {
            console.log(`⚠️ Game ${gameId} finished but not yet signed`);
            return res.status(404).json({ 
                error: 'Game not yet signed by server',
                hint: 'Wait a few seconds for server to sign results'
            });
        }
        
        console.log(`✅ Sending recovery data for ${gameId}`);
        console.log(`   Winner: ${game.result.winner}`);
        
        res.json({
            success: true,
            players: game.players,
            result: {
                winner: game.result.winner,
                winnerAddress: game.result.winner,
                scores: game.result.scores,
                transcriptHash: game.result.transcriptHash,
                expiry: game.result.expiry,
                signature: game.result.signature
            }
        });
        
    } catch (error) {
        console.error('❌ Game recovery endpoint error:', error);
        res.status(500).json({ 
            error: 'Server error during recovery',
            code: 'RECOVERY_ERROR',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

app.post('/api/sign-join', async (req, res) => {
    try {
        const tier = req.body.tier;
        const userAddress = req.body.playerAddress || req.body.userAddress;

        if (!userAddress) {
            return res.status(400).json({ 
                error: "Missing player address", 
                code: "MISSING_ADDRESS" 
            });
        }

        if (!ethers.isAddress(userAddress)) {
            return res.status(400).json({ 
                error: "Invalid Ethereum address format", 
                code: "INVALID_ADDRESS" 
            });
        }

        if (tier === undefined || tier < 0 || tier > 3) {
            return res.status(400).json({ 
                error: "Invalid tier (must be 0-3)", 
                code: "INVALID_TIER" 
            });
        }

        const lastRequest = playerSecrets.get(userAddress);
        if (lastRequest && (Date.now() - lastRequest.timestamp < 10000)) {
            console.warn(`⚠️ Rate limit hit for ${userAddress}`);
            return res.status(429).json({ 
                error: "Too many requests. Please wait 10 seconds.", 
                code: "RATE_LIMITED" 
            });
        }

        if (!BlockchainService.provider || !BlockchainService.signer) {
            console.error("❌ Blockchain Service Unavailable");
            return res.status(503).json({ 
                error: "Blockchain service not ready", 
                code: "SERVICE_UNAVAILABLE" 
            });
        }

        console.log(`📝 Sign Request: Tier ${tier} for ${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`);

        const secret = ethers.hexlify(ethers.randomBytes(32)); 
        const serverHash = ethers.keccak256(secret);
        
        const nonce = Date.now(); 
        const currentBlock = await BlockchainService.provider.getBlockNumber();
        const expiryBlock = currentBlock + 50;

        const signature = await BlockchainService.signJoinRequest(
            tier, 
            userAddress, 
            nonce, 
            expiryBlock, 
            serverHash
        );

        BlockchainService.registerSecret(serverHash, secret);

        playerSecrets.set(userAddress, {
            secret,
            timestamp: Date.now(),
            expiryBlock,
            tier
        });

        res.json({
            success: true,
            serverHash,
            signature,
            nonce,
            expiryBlock,
            tier,
            currentBlock
        });
        
        console.log(`✅ Signed for ${userAddress.slice(0, 6)}... (Expires: ${expiryBlock})`);

    } catch (e) {
        console.error("❌ Join API Error:", e.message);
        if (process.env.NODE_ENV === 'development') {
            console.error(e);
        }
        res.status(500).json({ 
            error: "Failed to generate signature", 
            code: "SIGNATURE_ERROR" 
        });
    }
});


// --- SOCKET LOGIC ---

io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);
    socket.data.connectedAt = Date.now();
    
    // 1. Create Room
    socket.on('create_room', ({ userId, userName }) => {
        try {
            if (!userId || !userName) {
                socket.emit('error', 'Missing user credentials');
                return;
            }

            const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
            socket.data.userId = userId;

            const game = gameManager.createGame(roomId, 'MULTIPLAYER', userId, userName);
            socket.join(roomId);
            socket.emit('room_created', { roomId });
            
            gameManager.broadcastGameState(roomId);
            console.log(`🎮 Room ${roomId} created by ${userName}`);
        } catch (e) {
            console.error('❌ Create room error:', e.message);
            socket.emit('error', 'Failed to create room: ' + e.message);
        }
    });

    // 2. Join Room
    socket.on('join_room', ({ roomId, userId, userName }) => {
        try {
            if (!roomId || !userId || !userName) {
                socket.emit('error', 'Missing join credentials');
                return;
            }
            
            if (roomId.includes('LOBBY')) {
                if (!VALID_LOBBIES.has(roomId)) {
                    socket.emit('error', 'Invalid Lobby Room');
                    return;
                }
                
                socket.data.userId = userId;
                socket.join(roomId);
                
                const lobbySize = io.sockets.adapter.rooms.get(roomId)?.size || 0;
                io.to(roomId).emit('LOBBY_UPDATE', { 
                    type: 'PLAYER_JOINED', 
                    player: userId,
                    count: lobbySize
                });
                
                console.log(`⏳ ${userName} joined ${roomId} (${lobbySize}/4 players)`);
                return; 
            }

            const currentRooms = Array.from(socket.rooms);
            currentRooms.forEach(room => {
                if (room.includes('LOBBY')) {
                    socket.leave(room);
                    io.to(room).emit('LOBBY_UPDATE', { 
                        type: 'PLAYER_LEFT', 
                        player: userId 
                    });
                }
            });

            socket.data.userId = userId;

            const secretData = playerSecrets.get(userId);
            const secret = secretData?.secret;
            
            const game = gameManager.joinGame(roomId, userId, userName);
            
            if (secret && game.mode === 'WEB3') {
                game.serverSecret = secret;
                playerSecrets.delete(userId);
                console.log(`🔐 Secret attached for ${userId.slice(0, 6)}... in ${roomId}`);
            }

            socket.join(roomId);
            gameManager.broadcastGameState(roomId);
            console.log(`✅ ${userName} joined game ${roomId}`);

        } catch(e) { 
            console.error('❌ Join room error:', e.message);
            socket.emit('error', e.message); 
        }
    });

    // 3. Play Bots
    socket.on('play_bots', ({ userId, userName }) => {
        try {
            if (!userId || !userName) {
                socket.emit('error', 'Missing user credentials');
                return;
            }

            const roomId = "bot_" + socket.id;
            socket.data.userId = userId;

            const game = gameManager.createGame(roomId, 'BOTS', userId, userName);
            socket.join(roomId);
            
            gameManager.broadcastGameState(roomId);
            gameManager.gameLoop(roomId);
            console.log(`🤖 Bot game started for ${userName}`);
        } catch (e) {
            console.error('❌ Bot game error:', e.message);
            socket.emit('error', 'Failed to start bot game: ' + e.message);
        }
    });

    // 4. Actions
    socket.on('action', ({ roomId, type, payload, userId }) => {
        try {
            if (!roomId || !type || !userId) {
                socket.emit('error', 'Invalid action parameters');
                return;
            }

            if (socket.data.userId && socket.data.userId !== userId) {
                console.warn(`⚠️ User ID mismatch: Socket=${socket.data.userId}, Claimed=${userId}`);
                socket.emit('error', 'Authentication mismatch');
                return;
            }

            gameManager.handleAction(roomId, type, payload, userId);
        } catch (e) {
            console.error('❌ Action error:', e.message);
            socket.emit('error', 'Action failed: ' + e.message);
        }
    });

    // 5. Rejoin
    socket.on('rejoin_room', ({ roomId, userId }) => {
        try {
            if (!roomId || !userId) {
                socket.emit('error', 'Missing rejoin credentials');
                return;
            }

            socket.data.userId = userId;
            const game = gameManager.rejoinGame(roomId, userId);
            
            socket.join(roomId);
            socket.emit('rejoin_success', game);
            console.log(`🔄 ${userId.slice(0, 6)}... rejoined ${roomId}`);
        } catch(e) {
            console.error('❌ Rejoin error:', e.message);
            socket.emit('error', 'Could not rejoin: ' + e.message);
        }
    });

    // 6. Result Submission Sync
    socket.on('RESULT_SUBMITTED_BY_PLAYER', ({ gameId, submittedBy }) => {
        console.log(`📢 Player ${submittedBy} claims submission for ${gameId}`);
        io.to(gameId).emit('GAME_RESULT_SUBMITTED', {
            gameId,
            submittedBy,
            timestamp: Date.now()
        });
    });

    // 7. Leave Room
    socket.on('leave_room', ({ roomId, userId }) => {
        try {
            if (roomId && roomId.includes('LOBBY')) {
                socket.leave(roomId);
                io.to(roomId).emit('LOBBY_UPDATE', { 
                    type: 'PLAYER_LEFT', 
                    player: userId 
                });
                console.log(`👋 ${userId.slice(0, 6)}... left ${roomId}`);
            }
        } catch (e) {
            console.error('❌ Leave room error:', e.message);
        }
    });

    // ============================================================
    // [SNIPER+] 8. Blockchain Transaction Trigger
    // ============================================================
    // Frontend emits 'WE_MADE_A_MOVE' immediately before any
    // blockchain transaction (join, submit, challenge, finalize, etc.)
    // This wakes the backend from 30s Coma Mode → 3s Sniper Mode
    // so users see on-chain confirmations fast without wasting CUs
    // during idle periods.
    // ============================================================
    socket.on('WE_MADE_A_MOVE', ({ action } = {}) => {
        console.log(`🔫 [Sniper] TX trigger from ${socket.id}: ${action || 'unknown'}`);
        
        // Guard: only call if blockchain service is initialized
        if (BlockchainService && typeof BlockchainService.triggerSniperMode === 'function') {
            BlockchainService.triggerSniperMode(action || 'FrontendTrigger');
        }
    });

    // 9. Disconnect
    socket.on('disconnect', (reason) => {
        const duration = Date.now() - (socket.data.connectedAt || Date.now());
        console.log(`🔌 Socket ${socket.id} disconnected (${reason}) - Duration: ${Math.round(duration / 1000)}s`);
        
        const rooms = Array.from(socket.rooms);
        rooms.forEach(room => {
            if (room.includes('LOBBY')) {
                io.to(room).emit('LOBBY_UPDATE', { 
                    type: 'PLAYER_LEFT', 
                    player: socket.data.userId 
                });
            }
        });
    });

    // 10. Socket Error
    socket.on('error', (error) => {
        console.error('❌ Socket error:', error.message);
    });
});

// --- GRACEFUL SHUTDOWN ---

process.on('SIGTERM', () => {
    console.log('⚠️ SIGTERM received. Closing server gracefully...');
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('⚠️ SIGINT received. Closing server gracefully...');
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
});

// --- START ---

connectDB()
    .then(() => {
        console.log('✅ Database connected');
        server.listen(port, () => {
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log(`✅ SERVER RUNNING ON PORT ${port}`);
            console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`🔗 Client URL: ${process.env.CLIENT_URL || 'any'}`);
            console.log(`⛓️  Blockchain: ${BlockchainService.provider ? 'Active' : 'Inactive'}`);
            // [SNIPER+] Show poll mode in startup banner
            console.log(`🎯 Poll Mode: Sniper+ (30s coma / 3s active)`);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        });
    })
    .catch((err) => {
        console.error('❌ Database connection failed:', err);
        process.exit(1);
    });