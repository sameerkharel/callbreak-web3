// ============================================
// BlockchainService.js - PRODUCTION READY
// Base Mainnet Only | Sniper+ Polling System
// ============================================
// CHANGES FROM ORIGINAL:
//   1. Replaced setInterval(3s) with Sniper+ loop (30s coma / 3s active)
//   2. Removed startLobbyHeartbeat() setInterval — integrated into main loop
//   3. Added triggerSniperMode() — called by server.js socket handler
//   4. Added wakeUpIfActiveGamesExist() — startup recovery after server restart
//   5. Poll loop NEVER dies silently (try/catch guarantees next run)
//   6. Immediate poll fired when sniper is triggered
// ============================================

const { ethers } = require("ethers");
const fs = require('fs');
const path = require('path');

// ============================================
// ROBUST ABI LOADING
// ============================================
const contractPath = path.join(__dirname, '../abis/CallBreakCasino.json');
let ContractABI;

try {
    const fileContent = fs.readFileSync(contractPath, 'utf8');
    const json = JSON.parse(fileContent);
    ContractABI = json.abi || json;
    console.log("✅ Contract ABI loaded successfully");
} catch (err) {
    console.error("❌ CRITICAL: Could not load Contract ABI at", contractPath);
    console.error(err.message);
    ContractABI = [];
}

require("dotenv").config();

// ============================================
// BASE MAINNET CONFIGURATION
// ============================================
const BASE_MAINNET = {
    chainId: 8453,
    chainIdHex: '0x2105',
    name: 'Base Mainnet',
    rpcUrls: {
        primary: 'https://mainnet.base.org',
        backup: 'https://base.llamarpc.com',
        fallback: 'https://base-mainnet.public.blastapi.io'
    }
};

class BlockchainService {
    constructor() {
        // Validate environment variables
        if (!process.env.SERVER_PRIVATE_KEY) {
            throw new Error("❌ Missing SERVER_PRIVATE_KEY in .env");
        }
        
        if (!process.env.CONTRACT_ADDRESS) {
            throw new Error("❌ Missing CONTRACT_ADDRESS in .env");
        }
        
        // RPC Configuration with fallbacks
        this.rpcUrl = process.env.RPC_URL || BASE_MAINNET.rpcUrls.primary;
        this.backupRpcUrl = process.env.RPC_URL_BACKUP || BASE_MAINNET.rpcUrls.backup;
        
        console.log(`🔗 Primary RPC: ${this.rpcUrl}`);
        console.log(`🔗 Backup RPC: ${this.backupRpcUrl}`);
        
        // Initialize provider
        this.provider = new ethers.JsonRpcProvider(this.rpcUrl);
        
        // Initialize wallet
        this.wallet = new ethers.Wallet(process.env.SERVER_PRIVATE_KEY, this.provider);
        this.signer = this.wallet;

        // Initialize contract
        this.contract = new ethers.Contract(
            process.env.CONTRACT_ADDRESS, 
            ContractABI, 
            this.signer
        );

        // Core state
        this.gameManager = null;
        this.lastProcessedBlock = 0; 
        this.isPolling = false;      
        this.chainId = null;
        this.isHealthy = true;
        
        // Secret storage (for commit-reveal scheme)
        this.pendingSecrets = new Map();

        // ============================================
        // SNIPER+ STATE (replaces raw setInterval)
        // ============================================
        this.isSniperActive = false;    // true = 3s polling, false = 30s polling
        this.sniperTimeout = null;       // handle for the auto-sleep timer
        this.pollLoopRunning = false;    // guard against double-start
        this._lastLobbyUpdate = 0;       // tracks when lobby was last synced
        
        this.COMA_INTERVAL   = 30000;   // 30s — safe floor for a money game
        this.SNIPER_INTERVAL = 3000;    // 3s  — active during blockchain actions
        this.SNIPER_DURATION = 120000;  // 2min — how long sniper stays hot per trigger
    }

    // ============================================
    // NETWORK VALIDATION
    // ============================================

    async validateNetwork() {
        try {
            const network = await this.provider.getNetwork();
            this.chainId = Number(network.chainId);
            
            if (this.chainId !== BASE_MAINNET.chainId) {
                const errorMsg = 
                    `\n❌ CRITICAL: WRONG NETWORK DETECTED!\n` +
                    `\nExpected: ${BASE_MAINNET.name} (Chain ID: ${BASE_MAINNET.chainId})\n` +
                    `Current:  Chain ID ${this.chainId}\n` +
                    `\nCheck RPC_URL in .env and restart.\n`;
                
                console.error(errorMsg);
                process.exit(1);
            }
            
            console.log(`✅ Network Validation: ${BASE_MAINNET.name} (Chain ID: ${this.chainId})`);
            this.isHealthy = true;
            
        } catch (err) {
            console.error("❌ Network Validation Failed:", err.message);
            throw err;
        }
    }

    async switchToBackupRpc() {
        console.warn("⚠️ Primary RPC failed. Switching to backup...");
        
        try {
            this.provider = new ethers.JsonRpcProvider(this.backupRpcUrl);
            this.wallet = new ethers.Wallet(process.env.SERVER_PRIVATE_KEY, this.provider);
            this.signer = this.wallet;
            
            this.contract = new ethers.Contract(
                process.env.CONTRACT_ADDRESS, 
                ContractABI, 
                this.signer
            );
            
            await this.validateNetwork();
            console.log("✅ Successfully switched to backup RPC");
            this.isHealthy = true;
            
        } catch (error) {
            console.error("❌ Backup RPC also failed:", error.message);
            this.isHealthy = false;
            throw new Error("All RPC endpoints failed");
        }
    }

    // ============================================
    // INITIALIZATION
    // ============================================

    async initialize(gameManager) {
        this.gameManager = gameManager;
        
        try {
            await this.validateNetwork();
            this.lastProcessedBlock = await this.provider.getBlockNumber();
            
            console.log("\n========================================");
            console.log("🛡️  BLOCKCHAIN SERVICE: INITIALIZED");
            console.log("========================================");
            console.log(`🌍  Network: ${BASE_MAINNET.name}`);
            console.log(`🔗  Chain ID: ${this.chainId}`);
            console.log(`🔗  RPC: ${this.rpcUrl}`);
            console.log(`👛  Server Address: ${this.wallet.address}`);
            console.log(`📝  Contract: ${process.env.CONTRACT_ADDRESS}`);
            console.log(`📦  Starting Block: ${this.lastProcessedBlock}`);
            console.log(`🎯  Sniper+ Polling: COMA=${this.COMA_INTERVAL/1000}s / ACTIVE=${this.SNIPER_INTERVAL/1000}s`);
            console.log("========================================\n");

            // ✅ FIX: Check DB for active games — wake up if they exist
            // This handles the Railway/Render free-tier restart problem
            await this.wakeUpIfActiveGamesExist();

            // ✅ Start the Sniper+ polling loop (replaces setInterval)
            this.startSniperLoop();
            
            // ✅ Start health monitoring (unchanged from original)
            this.monitorNetworkHealth();

        } catch (err) {
            console.error("❌ Failed to initialize Blockchain Service:", err.message);
            process.exit(1);
        }
    }

    // ============================================
    // SNIPER+ POLLING SYSTEM
    // ============================================

    /**
     * The main poll loop. Runs forever.
     * Speed: 3s when sniper is ON, 30s when sniper is OFF.
     * NEVER dies silently — try/catch guarantees the next setTimeout always fires.
     */
    startSniperLoop() {
        if (this.pollLoopRunning) return; // Prevent accidental double-start
        this.pollLoopRunning = true;

        const loop = async () => {
            const interval = this.isSniperActive 
                ? this.SNIPER_INTERVAL 
                : this.COMA_INTERVAL;

            try {
                if (this.isSniperActive) {
                    console.log(`🔫 [Sniper] Polling block...`);
                } else {
                    console.log(`💤 [Coma] Polling block... (next: ${interval/1000}s)`);
                }

                await this.robustPoll();

                // Lobby sync integrated here — no separate setInterval needed
                await this.syncLobbyIfNeeded();

            } catch (err) {
                // ✅ KEY FIX: Log but NEVER let this kill the loop
                console.error(`⚠️ Poll loop error (will retry in ${interval/1000}s):`, err.message);
            }

            // ✅ Always schedule next run, even after errors
            setTimeout(loop, interval);
        };

        // Kick it off immediately
        loop();
    }

    /**
     * Called from server.js whenever the frontend fires a blockchain transaction.
     * Wakes up the poll loop to 3s speed for SNIPER_DURATION ms.
     * Calling it again while active resets the timer (extends the hot window).
     *
     * @param {string} reason - Label for logging (e.g. 'JOIN_QUEUE', 'SUBMIT_RESULT')
     */
    triggerSniperMode(reason = 'Unknown') {
        if (this.isSniperActive) {
            // Already hot — just extend the timer
            console.log(`🔄 [Sniper] Extended by: ${reason}`);
        } else {
            console.log(`🎯 [Sniper] ACTIVATED by: ${reason} → switching to 3s polling`);
            this.isSniperActive = true;
        }

        // Reset the auto-sleep countdown
        if (this.sniperTimeout) clearTimeout(this.sniperTimeout);
        this.sniperTimeout = setTimeout(() => {
            console.log(`💤 [Sniper] Deactivated → returning to Coma (${this.COMA_INTERVAL/1000}s)`);
            this.isSniperActive = false;
        }, this.SNIPER_DURATION);

        // ✅ Fire an IMMEDIATE poll so user doesn't wait for next scheduled run
        this.robustPoll().catch(e =>
            console.error("[Sniper] Immediate poll error:", e.message)
        );
    }

    /**
     * On server start, check if any active games exist in DB.
     * If yes, activate sniper immediately so no game is left in coma.
     * This solves the Railway/Render free-tier restart problem.
     */
    async wakeUpIfActiveGamesExist() {
        try {
            // Lazy-require to avoid circular dependency issues
            const Game = require('../models/Game');
            const activeCount = await Game.countDocuments({ 
                status: { $in: ['WAITING', 'ACTIVE', 'GAME_OVER'] } 
            });
            
            if (activeCount > 0) {
                console.log(`⚡ [Startup] Found ${activeCount} active game(s) — activating Sniper immediately!`);
                this.triggerSniperMode('StartupRecovery');
            } else {
                console.log(`💤 [Startup] No active games — starting in Coma Mode (${this.COMA_INTERVAL/1000}s)`);
            }
        } catch (err) {
            // DB not ready yet, or model not found — default to sniper for safety
            console.warn(`⚠️ [Startup] DB check failed (${err.message}) — starting in Sniper mode for safety`);
            this.triggerSniperMode('StartupSafety');
        }
    }

    /**
     * Lobby sync — runs at most once every ~30s, integrated into the poll loop.
     * Replaces the old startLobbyHeartbeat() setInterval.
     * Only queries the contract if players are actually watching the lobby.
     */
    async syncLobbyIfNeeded() {
        if (!this.gameManager) return;

        // Throttle: only run every 30s regardless of sniper mode
        const now = Date.now();
        if (now - this._lastLobbyUpdate < 28000) return;
        this._lastLobbyUpdate = now;

        for (let tier = 0; tier <= 3; tier++) {
            try {
                // Only query contract if someone is watching this lobby
                const room = this.gameManager.io.sockets.adapter.rooms
                    .get(`TIER_${tier}_LOBBY`);

                if (!room || room.size === 0) continue;

                const queueMembers = await this.contract.getQueueMembers(tier);
                this.gameManager.io.to(`TIER_${tier}_LOBBY`).emit('LOBBY_SYNC', {
                    count: queueMembers.length,
                    players: queueMembers,
                    timestamp: Date.now()
                });
            } catch (e) {
                // Silent fail — non-critical, next sync will retry
            }
        }
    }

    // ============================================
    // SECRET MANAGEMENT (Commit-Reveal Scheme)
    // ============================================

    registerSecret(serverHash, secret) {
        this.pendingSecrets.set(serverHash, secret);
        
        setTimeout(() => {
            if (this.pendingSecrets.has(serverHash)) {
                console.log(`🧹 Cleaning up expired secret: ${serverHash.slice(0, 10)}...`);
                this.pendingSecrets.delete(serverHash);
            }
        }, 15 * 60 * 1000);
        
        console.log(`🔐 Secret registered: ${serverHash.slice(0, 10)}... (auto-cleanup in 15m)`);
    }

    // ============================================
    // EVENT POLLING (Unchanged — only call-site changed)
    // ============================================

    async robustPoll() {
        if (this.isPolling) return;
        this.isPolling = true;

        try {
            const currentBlock = await this.provider.getBlockNumber();
            
            if (currentBlock <= this.lastProcessedBlock) {
                this.isPolling = false;
                return;
            }

            const fromBlock = this.lastProcessedBlock + 1;
            const toBlock = currentBlock;

            console.log(`📡 Polling blocks ${fromBlock} → ${toBlock}`);

            // ============================================
            // EVENT 1: GameReadyToStart
            // ============================================
            try {
                const readyEvents = await this.contract.queryFilter(
                    "GameReadyToStart", 
                    fromBlock, 
                    toBlock
                );
                
                for (const event of readyEvents) {
                    const gameId = event.args[0];
                    const revealBlock = Number(event.args[1]);
                    
                    console.log(`🎮 GameReadyToStart: ${gameId}`);
                    console.log(`   Reveal Block: ${revealBlock}`);
                    
                    this.handleGameReady(gameId, revealBlock);
                }
            } catch (e) {
                console.error("Event Error (GameReadyToStart):", e.message);
            }

            // ============================================
            // EVENT 2: GameStarted
            // ============================================
            try {
                const startEvents = await this.contract.queryFilter(
                    "GameStarted", 
                    fromBlock, 
                    toBlock
                );
                
                for (const event of startEvents) {
                    const gameId = event.args[0];
                    const randomSeed = event.args[1];
                    
                    console.log(`🚀 GameStarted: ${gameId}`);
                    console.log(`   Random Seed: ${randomSeed.toString()}`);
                    
                    if (this.gameManager) {
                        this.gameManager.setGameSeed(gameId, randomSeed.toString());
                    }
                }
            } catch (e) {
                console.error("Event Error (GameStarted):", e.message);
            }

            // ============================================
            // EVENT 3: FinalStateSubmitted
            // ============================================
            try {
                const finalEvents = await this.contract.queryFilter(
                    "FinalStateSubmitted", 
                    fromBlock, 
                    toBlock
                );
                
                for (const event of finalEvents) {
                    const gameId = event.args[0];
                    const winner = event.args[1];
                    
                    console.log(`✅ FinalStateSubmitted: ${gameId}`);
                    console.log(`   Winner: ${winner}`);
                    
                    const tx = await event.getTransaction();
                    const submitter = tx.from;
                    
                    if (this.gameManager && this.gameManager.handleOnChainSubmission) {
                        this.gameManager.handleOnChainSubmission(gameId, winner, submitter);
                    }
                }
            } catch (e) {
                console.error("Event Error (FinalStateSubmitted):", e.message);
            }

            // ============================================
            // EVENT 4: Queue Events (for Lobby UI)
            // ============================================
            this.pollQueueEvents(fromBlock, toBlock);

            this.lastProcessedBlock = currentBlock;
            this.isHealthy = true;

        } catch (err) {
            console.error("⚠️ Polling Error:", err.message);
            
            if (err.message.includes('connection') || err.message.includes('timeout')) {
                await this.switchToBackupRpc().catch(() => {
                    console.error("❌ Both RPC endpoints failed");
                    this.isHealthy = false;
                });
            }
            
        } finally {
            this.isPolling = false;
        }
    }

    async handleGameReady(gameId, targetBlock) {
        try {
            const core = await this.contract.gameCores(gameId);
            const serverHash = core.serverCommitHash;
            
            const secret = this.pendingSecrets.get(serverHash);
            
            if (!secret) {
                console.error(`❌ CRITICAL: No secret found for Game ${gameId}!`);
                console.error(`   Server Hash: ${serverHash}`);
                console.error(`   Players will need emergency withdraw.`);
                return;
            }

            if (this.gameManager && !this.gameManager.games[gameId]) {
                console.log(`📥 Initializing memory for Game ${gameId}`);
                
                const game = this.gameManager.createWeb3Game(gameId, secret);
                const gameInfo = await this.contract.getGameInfo(gameId);
                const players = gameInfo[1];
                
                const validPlayerIds = [];
                for (let i = 0; i < 4; i++) {
                    if (players[i] && players[i] !== ethers.ZeroAddress) {
                        game.players[i].id = players[i];
                        game.players[i].name = `Player ${i + 1}`;
                        validPlayerIds.push(players[i]);
                    }
                }

                if (this.gameManager.forceJoinSockets) {
                    this.gameManager.forceJoinSockets(gameId, validPlayerIds);
                }
                
                this.gameManager.broadcastGameState(gameId);
            }

            let current = await this.provider.getBlockNumber();
            while (current <= targetBlock) {
                console.log(`⏳ Waiting for block ${targetBlock + 1} (Current: ${current})...`);
                await new Promise(r => setTimeout(r, 2000));
                current = await this.provider.getBlockNumber();
            }

            console.log(`🔓 Revealing Game ${gameId}...`);
            await this.revealAndStartGame(gameId, secret);
            
            this.pendingSecrets.delete(serverHash);
            console.log(`✅ Secret revealed and cleaned up for ${gameId}`);

        } catch (e) {
            console.error(`❌ Handle Game Ready Failed for ${gameId}:`, e.message);
        }
    }

    pollQueueEvents(from, to) {
        if (!this.gameManager) return;
        
        this.contract.queryFilter("QueueEntered", from, to)
            .then(events => {
                for (const e of events) {
                    const { player, tier, currentQueueLength } = e.args;
                    this.gameManager.io.to(`TIER_${tier}_LOBBY`).emit('LOBBY_UPDATE', {
                        type: 'PLAYER_JOINED', 
                        player, 
                        count: Number(currentQueueLength)
                    });
                }
            })
            .catch(() => {});

        this.contract.queryFilter("QueueLeft", from, to)
            .then(events => {
                for (const e of events) {
                    const { player, tier } = e.args;
                    this.gameManager.io.to(`TIER_${tier}_LOBBY`).emit('LOBBY_UPDATE', {
                        type: 'PLAYER_LEFT', 
                        player
                    });
                }
            })
            .catch(() => {});
    }

    // ============================================
    // EIP-712 SIGNING (Unchanged)
    // ============================================

    getDomain() {
        return { 
            name: "CallBreak_V3", 
            version: "1", 
            chainId: BASE_MAINNET.chainId,
            verifyingContract: process.env.CONTRACT_ADDRESS 
        };
    }

    async signJoinRequest(tier, playerAddress, nonce, expiryBlock, serverHash) {
        const types = { 
            Join: [
                { name: "serverHash", type: "bytes32" },
                { name: "tier", type: "uint256" },
                { name: "player", type: "address" },
                { name: "nonce", type: "uint256" },
                { name: "expiryBlock", type: "uint256" }
            ] 
        };
        
        const value = { 
            serverHash, 
            tier: BigInt(tier), 
            player: playerAddress, 
            nonce: BigInt(nonce), 
            expiryBlock: BigInt(expiryBlock) 
        };
        
        const signature = await this.wallet.signTypedData(this.getDomain(), types, value);
        
        console.log(`✍️ Signed Join Request:`);
        console.log(`   Player: ${playerAddress.slice(0, 6)}...${playerAddress.slice(-4)}`);
        console.log(`   Tier: ${tier}`);
        console.log(`   Nonce: ${nonce}`);
        
        return signature;
    }

    async signFinalResult(gameId, randomSeed, transcriptHash, scores, winner, expiryTimestamp) {
        const intScores = scores.map((s, i) => {
            const rounded = Math.floor(Number(s));
            if (isNaN(rounded)) {
                throw new Error(`Invalid score at index ${i}: ${s}`);
            }
            return rounded;
        });
        
        console.log(`📝 Signing Final Result:`);
        console.log(`   Game ID: ${gameId}`);
        console.log(`   Winner: ${winner}`);
        console.log(`   Scores (validated): ${JSON.stringify(intScores)}`);
        
        const scoresHash = ethers.keccak256(
            ethers.solidityPacked(
                ["int256", "int256", "int256", "int256"], 
                intScores
            )
        );
        
        console.log(`   Scores Hash: ${scoresHash}`);
        
        const types = { 
            FinalState: [
                { name: "gameId", type: "bytes32" },
                { name: "randomSeed", type: "uint256" },
                { name: "transcriptHash", type: "bytes32" },
                { name: "scoresHash", type: "bytes32" },
                { name: "winner", type: "address" },
                { name: "expiryTimestamp", type: "uint256" }
            ] 
        };
        
        const value = { 
            gameId, 
            randomSeed: BigInt(randomSeed), 
            transcriptHash, 
            scoresHash,
            winner, 
            expiryTimestamp: BigInt(expiryTimestamp) 
        };
        
        const signature = await this.wallet.signTypedData(this.getDomain(), types, value);
        
        console.log(`✅ Final Result Signed Successfully`);
        console.log(`   Signature: ${signature.slice(0, 20)}...`);
        
        return signature;
    }

    // ============================================
    // CONTRACT INTERACTIONS (Unchanged)
    // ============================================

    async revealAndStartGame(gameId, secret) {
        try {
            console.log(`🔓 Revealing Game ${gameId}...`);
            
            const tx = await this.contract.revealAndStart(gameId, secret);
            console.log(`📤 Reveal TX Sent: ${tx.hash}`);
            
            const receipt = await tx.wait(1);
            
            if (receipt.status === 0) {
                throw new Error("Transaction reverted");
            }
            
            console.log(`✅ Game ${gameId} revealed at block ${receipt.blockNumber}`);
            return true;
            
        } catch (error) {
            console.error(`❌ Failed to reveal game ${gameId}:`, error.message);
            if (error.message?.includes('Commit Mismatch')) {
                console.error(`   Secret does not match server hash!`);
            }
            throw error;
        }
    }

    // ============================================
    // HEALTH MONITORING (Unchanged)
    // ============================================

    async monitorNetworkHealth() {
        setInterval(async () => {
            try {
                const network = await this.provider.getNetwork();
                if (Number(network.chainId) !== BASE_MAINNET.chainId) {
                    console.error("❌ CRITICAL: Not on Base Mainnet!");
                    this.alertAdmin("Network mismatch detected!");
                    this.isHealthy = false;
                    return;
                }
                
                const startTime = Date.now();
                await this.provider.getBlockNumber();
                const latency = Date.now() - startTime;
                
                if (latency > 5000) {
                    console.warn(`⚠️ High RPC latency: ${latency}ms`);
                }
                
                const bond = await this.contract.serverBond();
                const locked = await this.contract.lockedBond();
                const available = bond - locked;
                
                if (available < ethers.parseEther("0.5")) {
                    console.warn(`⚠️ Low Server Bond!`);
                    console.warn(`   Total: ${ethers.formatEther(bond)} ETH`);
                    console.warn(`   Locked: ${ethers.formatEther(locked)} ETH`);
                    console.warn(`   Available: ${ethers.formatEther(available)} ETH`);
                    this.alertAdmin(`Low server bond: ${ethers.formatEther(available)} ETH available`);
                }
                
                this.isHealthy = true;
                
            } catch (error) {
                console.error("❌ Health check failed:", error.message);
                this.isHealthy = false;
            }
        }, 60000);
    }

    alertAdmin(message) {
        console.log(`\n🚨 ========================================`);
        console.log(`🚨 ADMIN ALERT: ${message}`);
        console.log(`🚨 Time: ${new Date().toISOString()}`);
        console.log(`🚨 ========================================\n`);
        
        // TODO: Wire up your notification channel here
        // Discord webhook example:
        // if (process.env.DISCORD_WEBHOOK) {
        //     fetch(process.env.DISCORD_WEBHOOK, {
        //         method: 'POST',
        //         headers: { 'Content-Type': 'application/json' },
        //         body: JSON.stringify({
        //             content: `🚨 **CallBreak Alert**\n${message}\n${new Date().toISOString()}`
        //         })
        //     }).catch(e => console.error("Discord alert failed:", e));
        // }
    }

    // ============================================
    // UTILITY (Unchanged)
    // ============================================

    async getCurrentBlock() {
        try {
            return await this.provider.getBlockNumber();
        } catch (error) {
            console.error("Error getting block number:", error.message);
            return this.lastProcessedBlock;
        }
    }

    getHealthStatus() {
        return {
            isHealthy: this.isHealthy,
            chainId: this.chainId,
            network: BASE_MAINNET.name,
            lastProcessedBlock: this.lastProcessedBlock,
            serverAddress: this.wallet.address,
            contractAddress: process.env.CONTRACT_ADDRESS,
            // Bonus: expose sniper state for debugging
            sniperActive: this.isSniperActive,
            pollMode: this.isSniperActive ? `Sniper (${this.SNIPER_INTERVAL/1000}s)` : `Coma (${this.COMA_INTERVAL/1000}s)`
        };
    }
}

module.exports = new BlockchainService();