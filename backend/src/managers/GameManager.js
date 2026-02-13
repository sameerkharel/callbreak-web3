const { ethers } = require("ethers");
const CallBreakGame = require('../models/CallBreakGame');
const BlockchainService = require('../services/BlockchainService');
const Game = require('../models/Game');

class GameManager {
    constructor(io) {
        this.io = io;
        this.games = {}; // In-Memory Database
        this.turnTimers = {}; // Stores timeouts for each room
    }

    // ==========================================
    //    🔒 SECURITY HELPERS
    // ==========================================

    getPublicGameState(game, requestingUserId) {
        const safeGame = JSON.parse(JSON.stringify(game));
        delete safeGame.serverSecret; 

        safeGame.players = safeGame.players.map(p => {
            if (p.id === requestingUserId) {
                return p; 
            } else {
                return {
                    ...p,
                    hand: p.hand.map(() => null), // Mask opponents' cards
                };
            }
        });

        return safeGame;
    }

    broadcastGameState(roomId) {
        const game = this.games[roomId];
        if (!game) return;

        const room = this.io.sockets.adapter.rooms.get(roomId);
        if (room) {
            for (const socketId of room) {
                const socket = this.io.sockets.sockets.get(socketId);
                if (socket && socket.data && socket.data.userId) {
                    const personalizedState = this.getPublicGameState(game, socket.data.userId);
                    socket.emit('update', personalizedState);
                }
            }
        }
    }

    // ==========================================
    //    ⏳ TURN TIMER SYSTEM (PROVABLY FAIR)
    // ==========================================
    
    startTurnTimer(roomId) {
        this.clearTurnTimer(roomId);

        const game = this.games[roomId];
        if (!game || ['GAME_OVER', 'ROUND_OVER', 'WAITING', 'INITIALIZING_ON_CHAIN'].includes(game.status)) return;

        const playerIndex = game.turn;
        const player = game.players[playerIndex];
        
        // Skip if Bot
        if (player.id && player.id.startsWith('bot_')) return;

        this.turnTimers[roomId] = setTimeout(() => {
            console.log(`⏰ Time's up for ${player.name}! Auto-playing...`);
            this.handleAutoPlay(roomId, playerIndex);
        }, 30000); 
    }

    clearTurnTimer(roomId) {
        if (this.turnTimers[roomId]) {
            clearTimeout(this.turnTimers[roomId]);
            delete this.turnTimers[roomId];
        }
    }

    handleAutoPlay(roomId, playerIndex) {
        const game = this.games[roomId];
        if (!game) return;

        const player = game.players[playerIndex];
        if (game.turn !== playerIndex) return; 

        this.io.to(roomId).emit('notification', `⏳ ${player.name} timed out! Auto-playing...`);

        if (game.status === 'BIDDING') {
            const autoBid = Math.floor(Math.random() * 2) + 1; 
            this.handleAction(roomId, 'BID', autoBid, player.id);
        } 
        else if (game.status === 'PLAYING') {
            const validIndices = CallBreakGame.getValidMoves(player.hand, game.table);
            
            if (validIndices.length > 0) {
                let selectedMoveIndex;

                if (game.mode === 'WEB3' && game.randomSeed && game.serverSecret) {
                    const entropy = `${game.randomSeed}-${game.serverSecret}-${game.round}-${playerIndex}-${player.hand.length}`;
                    const hash = ethers.keccak256(ethers.toUtf8Bytes(entropy));
                    const bigNum = BigInt(hash);
                    const randomPos = Number(bigNum % BigInt(validIndices.length));
                    selectedMoveIndex = validIndices[randomPos];
                } 
                else {
                    selectedMoveIndex = validIndices[Math.floor(Math.random() * validIndices.length)];
                }

                this.handleAction(roomId, 'PLAY', selectedMoveIndex, player.id);
            }
        }
    }

    // ==========================================
    //    🎮 GAME CREATION LOGIC
    // ==========================================

    createGame(roomId, mode, userId, userName) {
        let game = new CallBreakGame(roomId, mode, userId);
        game.players[0] = { id: userId, name: userName, hand: [], tricks: 0, bid: 0, totalScore: 0, avatar: '👤' };
        
        if (mode === 'BOTS') {
            const botNames = ['Alex', 'Siri', 'Cortana'];
            for(let i=1; i<4; i++) game.players[i] = { id: `bot_${i}`, name: botNames[i-1], hand: [], tricks: 0, bid: 0, totalScore: 0, avatar: '🤖' };
            CallBreakGame.dealCards(game);
        } else {
            for(let i=1; i<4; i++) game.players[i] = { id: null, name: "Waiting...", avatar: '⏳' };
        }
        
        this.games[roomId] = game;
        return game;
    }

    createWeb3Game(gameId, secret) {
        let game = new CallBreakGame(gameId, 'WEB3', 'CONTRACT');
        game.serverSecret = secret; 
        game.randomSeed = null;      
        game.status = 'WAITING';    
        game.createdAt = Math.floor(Date.now() / 1000); 

        for(let i=0; i<4; i++) {
            game.players[i] = { id: null, name: `Player ${i+1}`, hand: [], tricks: 0, bid: 0, totalScore: 0, avatar: '👤' };
        }

        this.games[gameId] = game;
        this.broadcastGameState(gameId);
        return game;
    }

    forceJoinSockets(gameId, playerIds) {
        console.log(`🔌 Attempting to force-join sockets for Game ${gameId}`);
        const connectedSockets = this.io.sockets.sockets; 

        for (const [socketId, socket] of connectedSockets) {
            if (socket.data.userId && playerIds.includes(socket.data.userId)) {
                socket.join(gameId);
                socket.emit('force_game_start', { gameId });
            }
        }
    }

    setGameSeed(gameId, seedString) {
        const game = this.games[gameId];
        if (!game) return;

        console.log(`🎲 Game ${gameId}: Seed Received. Starting 10s Countdown...`);
        
        game.randomSeed = seedString;
        game.status = 'COUNTDOWN'; 
        game.countdownStart = Date.now();
        game.countdownEnd = Date.now() + 10000; 

        this.broadcastGameState(gameId);
        
        this.io.to(gameId).emit('GAME_COUNTDOWN', { 
            seconds: 10, 
            serverTime: Date.now() 
        });

        setTimeout(() => {
            console.log(`🃏 Timer finished. Dealing Cards for ${gameId}...`);
            if (!this.games[gameId]) return;

            CallBreakGame.dealCardsDeterministic(game, seedString);
            
            game.status = 'BIDDING'; 
            game.turn = (game.dealer + 1) % 4;

            this.broadcastGameState(gameId);
            this.io.to(gameId).emit('GAME_STARTED_ON_CHAIN', { seed: seedString });
            
            this.startTurnTimer(gameId);

        }, 10000); 
    }

    joinGame(roomId, userId, userName) {
        const game = this.games[roomId];
        if (!game) throw new Error('Room not found');
        const emptySeat = game.players.findIndex(p => p.id === null);
        if (emptySeat === -1) throw new Error('Room full');

        game.players[emptySeat] = { 
            ...game.players[emptySeat], 
            id: userId, 
            name: userName,
            avatar: '👤' 
        };
        
        if (game.mode === 'WEB3' && game.players.every(p => p.id !== null)) {
            console.log(`🚀 Game ${roomId} is Full. Triggering On-Chain Reveal...`);
            
            game.status = 'INITIALIZING_ON_CHAIN';
            this.broadcastGameState(roomId);

            BlockchainService.revealAndStartGame(roomId, game.serverSecret)
                .catch(err => {
                    console.error(`❌ Reveal failed for ${roomId}:`, err);
                    this.io.to(roomId).emit('error', 'Server Failed to Start Game on Chain. Please check Zombie Status.');
                });
        }

        if (game.mode !== 'WEB3' && game.players.every(p => p.id !== null)) {
            CallBreakGame.dealCards(game);
            this.startTurnTimer(roomId);
        }
        
        return game;
    }

    rejoinGame(roomId, userId) {
        const game = this.games[roomId];
        if (!game) throw new Error('Room not found or expired');

        if (['COMPLETED', 'SUBMITTED', 'GAME_OVER', 'SETTLED'].includes(game.status)) {
            throw new Error('Game is finished'); 
        }

        return this.getPublicGameState(game, userId);
    }

    // ==========================================
    //    🕹️ GAMEPLAY LOGIC (Actions)
    // ==========================================
    handleAction(roomId, type, payload, userId) {
        let game = this.games[roomId];
        if (!game) return;
        
        if (game.status === 'GAME_OVER' || game.status === 'ROUND_OVER') return;
        if (game.status === 'INITIALIZING_ON_CHAIN' || game.status === 'WAITING') return;

        const pIndex = game.players.findIndex(p => p.id === userId);
        if (pIndex === -1) return;

        this.clearTurnTimer(roomId);

        // HANDLE BIDDING
        if (type === 'BID') {
            if (game.turn !== pIndex || game.status !== 'BIDDING') return;
            game.players[pIndex].bid = payload;
            game.turn = (game.turn + 1) % 4;
            
            if (game.players.every(p => p.bid > 0)) {
                game.status = 'PLAYING';
                game.turn = (game.dealer + 1) % 4;
            }
            this.broadcastGameState(roomId);
            this.gameLoop(roomId);
        }
        // HANDLE PLAY CARD
        else if (type === 'PLAY') {
            if (game.turn !== pIndex || game.status !== 'PLAYING') return;
            if (game.table.length >= 4) return; 
            game = CallBreakGame.playMove(game, userId, payload);
            this.broadcastGameState(roomId);
            this.gameLoop(roomId);
        }
    }

    // ==========================================
    //    🔄 MAIN GAME LOOP
    // ==========================================
    gameLoop(roomId) {
        let game = this.games[roomId];
        if (!game) return;
        
        // 1. CHECK IF GAME IS OVER (Triggered by Round End)
        if (game.status === 'GAME_OVER') {
            this.clearTurnTimer(roomId);
            // Ensure the frontend gets one last update with GAME_OVER status
            this.broadcastGameState(roomId);
            return;
        }

        if (game.status === 'ROUND_OVER') {
            this.clearTurnTimer(roomId);
            return;
        }

        this.startTurnTimer(roomId);

        // 2. CHECK IF TRICK IS COMPLETE
        if (game.table.length === 4) {
            this.clearTurnTimer(roomId); 
            this.broadcastGameState(roomId); 
            
            setTimeout(() => {
                game = this.games[roomId];
                if (!game || game.status === 'ROUND_OVER') return;

                const winnerIndex = CallBreakGame.calculateTrickWinner(game.table);
                game.trickWinner = winnerIndex;
                this.broadcastGameState(roomId); 

                setTimeout(() => {
                    game = this.games[roomId];
                    if (!game) return;

                    game.players[winnerIndex].tricks++;
                    game.turn = winnerIndex;
                    game.table = [];
                    game.trickWinner = null;

                    // 3. CHECK IF ROUND IS OVER
                    if (game.players.every(p => p.hand.length === 0)) {
                        CallBreakGame.calculateScores(game);
                        
                        // A. Start Next Round
                        if (game.round < game.maxRounds) {
                            game.status = 'ROUND_OVER'; 
                            this.broadcastGameState(roomId);
                            
                            setTimeout(() => {
                                game.round++;
                                game.dealer = (game.dealer + 1) % 4;
                                CallBreakGame.dealCards(game);
                                this.broadcastGameState(roomId);
                                this.gameLoop(roomId);
                            }, 5000);
                            return;
                        } 
                        // B. End Game (Actual Game Over)
                        else {
                            console.log(`🏁 Game Over: ${roomId}`);
                            game.status = 'GAME_OVER'; 
                            
                            if (game.mode === 'WEB3') {
                                this.handleWeb3GameEnd(game);
                            } else {
                                // [CRITICAL FIX] For Bots/Casual, broadcast one last time so UI shows Scoreboard
                                this.broadcastGameState(roomId); 
                                this.scheduleCleanup(roomId);
                            }
                            return;
                        }
                    }
                    
                    this.broadcastGameState(roomId);
                    this.gameLoop(roomId); 
                }, 1500); 
            }, 1000); 
            return;
        }
        
        // 4. BOT MOVE HANDLER
        if (game.mode === 'BOTS' && ['BIDDING', 'PLAYING'].includes(game.status)) {
            this.handleBotMove(game);
        }
    }

    async handleWeb3GameEnd(game) {
        try {
            console.log(`🏁 Web3 Game ${game.roomId} Ended. Calculating Winner...`);
            
            let winnerIndex = 0;
            let maxScore = -9999;
            game.players.forEach((p, i) => {
                if (p.totalScore > maxScore) { maxScore = p.totalScore; winnerIndex = i; }
            });
            const winnerAddress = game.players[winnerIndex].id;
            const scores = game.players.map(p => Math.round(p.totalScore * 10));
            const seed = game.randomSeed; 
            const nowSeconds = Math.floor(Date.now() / 1000);
            const expiryTimestamp = nowSeconds + 3600; 

            if (!seed) {
                console.error("🚨 CRITICAL: No Seed found for Game End signing!");
                return;
            }

            const transcriptHash = require('ethers').keccak256(require('ethers').toUtf8Bytes("GAME_COMPLETE"));

            const signature = await BlockchainService.signFinalResult(
                game.roomId,
                seed,
                transcriptHash,
                scores,
                winnerAddress,
                expiryTimestamp
            );

            game.winnerSignature = signature;
            game.winnerAddress = winnerAddress;
            game.expiryTimestamp = expiryTimestamp;

            await this.saveGameToHistory(game, winnerAddress, scores, signature, transcriptHash, expiryTimestamp);

            this.io.to(game.roomId).emit('GAME_RESULT_SIGNED', {
                winner: winnerAddress,
                signature: signature,
                expiry: expiryTimestamp,
                scores: scores,
                transcriptHash: transcriptHash 
            });
            
            this.broadcastGameState(game.roomId);
            this.scheduleCleanup(game.roomId);

        } catch (error) {
            console.error("❌ Error Signing Web3 Result:", error);
        }
    }

    async saveGameToHistory(game, winnerAddress, scores, signature, transcriptHash, expiry) {
        try {
            console.log(`💾 Saving Game ${game.roomId} to MongoDB...`);
            
            await Game.updateOne(
                { roomId: game.roomId },
                {
                    roomId: game.roomId,
                    tier: game.tier || 0,
                    status: 'COMPLETED',
                    players: game.players.map(p => ({
                        walletAddress: p.id,
                        nickname: p.name,
                        score: Math.round(p.totalScore * 10),
                        avatar: p.avatar
                    })),
                    result: {
                        winnerAddress: winnerAddress,
                        scores: scores,
                        transcriptHash: transcriptHash,
                        signature: signature,
                        expiry: expiry
                    },
                    endedAt: new Date()
                },
                { upsert: true }
            );
            console.log(`✅ Game Saved to DB.`);
        } catch (e) {
            console.error("⚠️ Failed to save game history:", e.message);
        }
    }

    handleOnChainSubmission(gameId, winnerAddress, submitterAddress) {
        console.log(`📢 Broadcasting On-Chain Submission for ${gameId}`);
        
        Game.updateOne({ roomId: gameId }, { 
            status: 'SUBMITTED',
            'result.winnerAddress': winnerAddress,
            txHash: 'confirmed_on_chain'
        }).catch(e => console.error("DB Update Error:", e));

        const game = this.games[gameId];
        let submitterName = "Unknown Player";
        if (game) {
            const player = game.players.find(p => p.id === submitterAddress);
            if (player) submitterName = player.name;
        }
        
        this.io.to(gameId).emit('GAME_RESULT_SUBMITTED', {
        gameId: gameId, // Frontend expects this
        submittedBy: submitterAddress, // Frontend expects address or ID
        timestamp: Date.now()
        });
        
        this.scheduleCleanup(gameId);
    }

    handleBotMove(game) {
        // [SAFETY] Don't make moves if game is over
        if (game.status === 'GAME_OVER' || game.status === 'ROUND_OVER') return;

        const currentPlayer = game.players[game.turn];
        if (currentPlayer.id && currentPlayer.id.startsWith('bot_')) {
            setTimeout(() => {
                // [SAFETY] Check if game still exists and state is valid
                const liveGame = this.games[game.roomId];
                if (!liveGame || liveGame.status === 'ROUND_OVER' || liveGame.status === 'GAME_OVER') return;
                
                if (liveGame.players[liveGame.turn].id !== currentPlayer.id) return;

                if (liveGame.status === 'BIDDING') {
                    liveGame.players[liveGame.turn].bid = Math.floor(Math.random() * 3) + 2;
                    liveGame.turn = (liveGame.turn + 1) % 4;
                    if (liveGame.players.every(p => p.bid > 0)) {
                        liveGame.status = 'PLAYING';
                        liveGame.turn = (liveGame.dealer + 1) % 4;
                    }
                } else if (liveGame.status === 'PLAYING') {
                    const validMoves = CallBreakGame.getValidMoves(currentPlayer.hand, liveGame.table);
                    if (validMoves.length > 0) {
                        const move = validMoves[Math.floor(Math.random() * validMoves.length)];
                        this.games[game.roomId] = CallBreakGame.playMove(liveGame, currentPlayer.id, move);
                    }
                }
                this.broadcastGameState(game.roomId);
                this.gameLoop(game.roomId);
            }, 1000);
        }
    }

    scheduleCleanup(roomId) {
        setTimeout(() => {
            if (this.games[roomId]) {
                console.log(`🧹 Cleaning up expired game from memory: ${roomId}`);
                delete this.games[roomId];
                this.clearTurnTimer(roomId);
            }
        }, 60 * 60 * 1000); 
    }
}

module.exports = GameManager;