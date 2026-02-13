require('dotenv').config();
const port = process.env.PORT || 5000;
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const { ethers } = require("ethers");
const connectDB = require('./src/config/db'); // mongodb
const userRoutes = require('./src/routes/userRoutes'); // userroutes 
const activityRoutes = require('./src/routes/activityRoutes'); // Activity Routes

// Custom Managers & Services
const GameManager = require('./src/managers/GameManager');
const BlockchainService = require('./src/services/BlockchainService');

const app = express();

// ✅ ENHANCEMENT: Better CORS configuration with specific options
app.use(cors({
    origin: process.env.CLIENT_URL || '*',
    methods: ['GET', 'POST'],
    credentials: true
}));

app.use(express.json());

// ✅ ENHANCEMENT: Add request logging middleware (useful for debugging)
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path}`);
    next();
});

const server = http.createServer(app);

// ✅ ENHANCEMENT: Better Socket.IO configuration
const io = new Server(server, { 
    cors: { 
        origin: process.env.CLIENT_URL || "*",
        methods: ["GET", "POST"]
    },
    pingTimeout: 60000, // 60s before considering connection dead
    pingInterval: 25000  // Check connection every 25s
});

// --- INITIALIZATION ---

// 1. Initialize Game Manager
const gameManager = new GameManager(io);

// 2. Initialize Blockchain Service (The Listener)
if (process.env.SERVER_PRIVATE_KEY && process.env.CONTRACT_ADDRESS) {
    try {
        BlockchainService.initialize(gameManager);
        console.log("✅ Blockchain Service & Event Listeners Active");
    } catch (err) {
        console.error("⚠️ Failed to init Blockchain Service:", err.message);
        // ✅ ENHANCEMENT: Log the full error in development
        if (process.env.NODE_ENV === 'development') {
            console.error(err);
        }
    }
} else {
    console.warn("⚠️ WEB3 SKIPPED: Missing SERVER_PRIVATE_KEY or CONTRACT_ADDRESS in .env");
}

// 3. Temporary Storage (The Bridge)
// Maps UserAddress -> Secret (Used to pass secret from API to Socket)
const playerSecrets = new Map();

// ✅ ENHANCEMENT: Auto-cleanup old secrets (prevent memory leak)
setInterval(() => {
    const now = Date.now();
    const TIMEOUT = 5 * 60 * 1000; // 5 minutes
    
    for (const [address, data] of playerSecrets.entries()) {
        if (data.timestamp && (now - data.timestamp > TIMEOUT)) {
            playerSecrets.delete(address);
            console.log(`🧹 Cleaned up expired secret for ${address.slice(0, 6)}...`);
        }
    }
}, 60000); // Run every minute

// --- SECURITY: VALID LOBBIES ---
// Prevents hackers from creating infinite trash rooms (DoS protection)
const VALID_LOBBIES = new Set(['TIER_0_LOBBY', 'TIER_1_LOBBY', 'TIER_2_LOBBY']);


// --- API ENDPOINTS ---

// ✅ ENHANCEMENT: Health check endpoint (useful for monitoring)
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        blockchain: !!BlockchainService.provider,
        database: 'connected' // You could add actual DB health check
    });
});

app.use('/api/user', userRoutes);
app.use('/api/activity', activityRoutes);

// ============================================
// [NEW] Game Recovery Endpoint
// ============================================
/**
 * Returns completed game data for "Recovery Mode"
 * Use Case: User's blockchain state shows "PLAYING" but game is actually 
 * finished and signed. This happens when server crashes or loses socket 
 * connection after game ends. Instead of showing zombie state, we recover 
 * the result and let user submit it to unlock blockchain state.
 */
app.get('/api/game-recovery/:gameId', async (req, res) => {
    try {
        const { gameId } = req.params;
        
        // Validate gameId format
        if (!gameId || gameId.length < 5) {
            return res.status(400).json({ 
                error: 'Invalid game ID format',
                code: 'INVALID_GAME_ID'
            });
        }
        
        console.log(`🔍 Recovery request for game: ${gameId}`);
        
        // ============================================
        // OPTION A: Query from Database (Recommended)
        // ============================================
        
        const Game = require('./src/models/Game'); // Adjust path as needed
        
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
        
        // Check if game has been signed by server
        if (!game.result || !game.result.signature) {
            console.log(`⚠️ Game ${gameId} finished but not yet signed`);
            return res.status(404).json({ 
                error: 'Game not yet signed by server',
                hint: 'Wait a few seconds for server to sign results'
            });
        }
        
        // Success - Return recovery data
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

// Sign Join Request Endpoint
app.post('/api/sign-join', async (req, res) => {
    try {
        // 1. INPUT NORMALIZATION
        const tier = req.body.tier;
        // Accept both naming conventions to be safe
        const userAddress = req.body.playerAddress || req.body.userAddress;

        // 2. VALIDATION (Best of V1: Specific Error Codes)
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

        // 3. RATE LIMITING 
        // Check this early to save resources
        const lastRequest = playerSecrets.get(userAddress);
        if (lastRequest && (Date.now() - lastRequest.timestamp < 10000)) { // 10s cooldown
            console.warn(`⚠️ Rate limit hit for ${userAddress}`);
            return res.status(429).json({ 
                error: "Too many requests. Please wait 10 seconds.", 
                code: "RATE_LIMITED" 
            });
        }

        // 4. INFRASTRUCTURE CHECK (Best of V1: Stability)
        // Ensure the blockchain connection is actually alive before proceeding
        if (!BlockchainService.provider || !BlockchainService.signer) {
            console.error("❌ Blockchain Service Unavailable");
            return res.status(503).json({ 
                error: "Blockchain service not ready", 
                code: "SERVICE_UNAVAILABLE" 
            });
        }

        // Logging (Best of V1: Observability)
        console.log(`📝 Sign Request: Tier ${tier} for ${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`);

        // 5. CORE LOGIC
        const secret = ethers.hexlify(ethers.randomBytes(32)); 
        const serverHash = ethers.keccak256(secret);
        
        const nonce = Date.now(); 
        const currentBlock = await BlockchainService.provider.getBlockNumber();
        const expiryBlock = currentBlock + 50; // Valid for ~10-15 mins

        // 6. CRYPTOGRAPHIC SIGNATURE
        const signature = await BlockchainService.signJoinRequest(
            tier, 
            userAddress, 
            nonce, 
            expiryBlock, 
            serverHash
        );

        // 7. STATE MANAGEMENT (Best of V2: Rich Data)
        BlockchainService.registerSecret(serverHash, secret);

        // Store extended data so you can run cleanup jobs later based on expiryBlock
        playerSecrets.set(userAddress, {
            secret,
            timestamp: Date.now(),
            expiryBlock, // Useful for server-side cleanup logic
            tier         // Useful for analytics
        });

        // 8. RESPONSE (Best of V2: Context aware)
        // Including 'currentBlock' allows the frontend to show accurate countdowns
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
        // 9. ERROR HANDLING (Best of V1: Dev Experience)
        console.error("❌ Join API Error:", e.message);
        
        // Only show full stack trace in development mode
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
    
    // ✅ ENHANCEMENT: Track connection time for debugging
    socket.data.connectedAt = Date.now();
    
    // 1. Create Room (Standard Mode)
    socket.on('create_room', ({ userId, userName }) => {
        try {
            // ✅ ENHANCEMENT: Input validation
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

    // 2. Join Room (Handles Both Web3 & Standard)
    socket.on('join_room', ({ roomId, userId, userName }) => {
        try {
            // ✅ ENHANCEMENT: Input validation
            if (!roomId || !userId || !userName) {
                socket.emit('error', 'Missing join credentials');
                return;
            }
            
            // --- A. LOBBY LOGIC ---
            if (roomId.includes('LOBBY')) {
                if (!VALID_LOBBIES.has(roomId)) {
                    socket.emit('error', 'Invalid Lobby Room');
                    return;
                }
                
                socket.data.userId = userId;
                socket.join(roomId);
                
                // ✅ ENHANCEMENT: Notify lobby about new player
                const lobbySize = io.sockets.adapter.rooms.get(roomId)?.size || 0;
                io.to(roomId).emit('LOBBY_UPDATE', { 
                    type: 'PLAYER_JOINED', 
                    player: userId,
                    count: lobbySize
                });
                
                console.log(`⏳ ${userName} joined ${roomId} (${lobbySize}/4 players)`);
                return; 
            }

            // --- B. GAME LOGIC ---
            
            // Cleanup: Leave Lobby rooms
            const currentRooms = Array.from(socket.rooms);
            currentRooms.forEach(room => {
                if (room.includes('LOBBY')) {
                    socket.leave(room);
                    // ✅ ENHANCEMENT: Notify lobby about player leaving
                    io.to(room).emit('LOBBY_UPDATE', { 
                        type: 'PLAYER_LEFT', 
                        player: userId 
                    });
                }
            });

            socket.data.userId = userId;

            // Retrieve secret (Bridge from API to Socket)
            const secretData = playerSecrets.get(userId);
            const secret = secretData?.secret;
            
            const game = gameManager.joinGame(roomId, userId, userName);
            
            // If this is a Web3 Game and we have a secret waiting, attach it
            if (secret && game.mode === 'WEB3') {
                game.serverSecret = secret;
                playerSecrets.delete(userId); // Clear temp storage
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
            // ✅ ENHANCEMENT: Input validation
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

    // 4. Actions (Play Card, Bid)
    socket.on('action', ({ roomId, type, payload, userId }) => {
        try {
            // ✅ ENHANCEMENT: Validate action before processing
            if (!roomId || !type || !userId) {
                socket.emit('error', 'Invalid action parameters');
                return;
            }

            // ✅ ENHANCEMENT: Verify socket ownership (anti-cheat)
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
            // ✅ ENHANCEMENT: Input validation
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

    // =========================================================
    // 6. [NEW] Handle Result Submission (Syncs other players)
    // =========================================================
    socket.on('RESULT_SUBMITTED_BY_PLAYER', ({ gameId, submittedBy }) => {
        console.log(`📢 Player ${submittedBy} claims submission for ${gameId}`);
        
        // Broadcast to EVERYONE in the room (including the sender)
        // This triggers the "Result Submitted" UI on all clients
        io.to(gameId).emit('GAME_RESULT_SUBMITTED', {
            gameId,
            submittedBy,
            timestamp: Date.now()
        });
    });

    // 7. Leave Room handler (cleanup lobbies)
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

    // 8. Handle disconnection gracefully
    socket.on('disconnect', (reason) => {
        const duration = Date.now() - (socket.data.connectedAt || Date.now());
        console.log(`🔌 Socket ${socket.id} disconnected (${reason}) - Duration: ${Math.round(duration / 1000)}s`);
        
        // Cleanup lobbies
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

    // ✅ ENHANCEMENT: Error handler for uncaught socket errors
    socket.on('error', (error) => {
        console.error('❌ Socket error:', error.message);
    });
});

// ✅ ENHANCEMENT: Graceful shutdown handler
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

// ✅ ENHANCEMENT: Global error handlers
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    // In production, you might want to log this to a monitoring service
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    // In production, you might want to restart the server or alert admins
});


// ✅ ENHANCEMENT: Start server with better error handling
connectDB()
    .then(() => {
        console.log('✅ Database connected');
        server.listen(port, () => {
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log(`✅ SERVER RUNNING ON PORT ${port}`);
            console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`🔗 Client URL: ${process.env.CLIENT_URL || 'any'}`);
            console.log(`⛓️  Blockchain: ${BlockchainService.provider ? 'Active' : 'Inactive'}`);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        });
    })
    .catch((err) => {
        console.error('❌ Database connection failed:', err);
        process.exit(1);
    });