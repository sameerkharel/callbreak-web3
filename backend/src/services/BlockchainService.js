// ============================================
// BlockchainService.js - PRODUCTION READY
// Base Mainnet Only | All Compatibility Fixes Applied
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

        // State management
        this.gameManager = null;
        this.lastProcessedBlock = 0; 
        this.isPolling = false;      
        this.chainId = null;
        this.isHealthy = true;
        
        // Secret storage (for commit-reveal scheme)
        this.pendingSecrets = new Map();
        
        // Network validation (must be done before use)
        this.validateNetwork();
    }

    // ============================================
    // NETWORK VALIDATION
    // ============================================

    /**
     * Validate we're connected to Base Mainnet
     * Exits process if wrong network
     */
    async validateNetwork() {
        try {
            const network = await this.provider.getNetwork();
            this.chainId = Number(network.chainId);
            
            // STRICT: Only Base Mainnet allowed (8453)
            if (this.chainId !== BASE_MAINNET.chainId) {
                const errorMsg = 
                    `\n❌ CRITICAL: WRONG NETWORK DETECTED!\n` +
                    `\n` +
                    `Expected: ${BASE_MAINNET.name} (Chain ID: ${BASE_MAINNET.chainId})\n` +
                    `Current:  Chain ID ${this.chainId}\n` +
                    `\n` +
                    `ACTION REQUIRED:\n` +
                    `1. Check your RPC_URL in .env file\n` +
                    `2. Ensure you're connecting to Base Mainnet\n` +
                    `3. Restart the server after fixing\n` +
                    `\n` +
                    `Shutting down to prevent invalid transactions...\n`;
                
                console.error(errorMsg);
                process.exit(1); // Exit immediately
            }
            
            console.log(`✅ Network Validation: ${BASE_MAINNET.name} (Chain ID: ${this.chainId})`);
            this.isHealthy = true;
            
        } catch (err) {
            console.error("❌ Network Validation Failed:", err.message);
            console.error("Unable to connect to blockchain. Check your RPC_URL.");
            throw err;
        }
    }

    /**
     * Switch to backup RPC if primary fails
     */
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
            // Validate network first (critical)
            await this.validateNetwork();
            
            // Get starting block
            this.lastProcessedBlock = await this.provider.getBlockNumber();
            
            // Display startup banner
            console.log("\n========================================");
            console.log("🛡️  BLOCKCHAIN SERVICE: INITIALIZED");
            console.log("========================================");
            console.log(`🌍  Network: ${BASE_MAINNET.name}`);
            console.log(`🔗  Chain ID: ${this.chainId}`);
            console.log(`🔗  RPC: ${this.rpcUrl}`);
            console.log(`👛  Server Address: ${this.wallet.address}`);
            console.log(`📝  Contract: ${process.env.CONTRACT_ADDRESS}`);
            console.log(`📦  Starting Block: ${this.lastProcessedBlock}`);
            console.log("========================================\n");
            
            // Start event polling (every 3 seconds)
            setInterval(() => this.robustPoll(), 3000);
            
            // Start lobby heartbeat (every 10 seconds)
            this.startLobbyHeartbeat();
            
            // Start health monitoring (every minute)
            this.monitorNetworkHealth();

        } catch (err) {
            console.error("❌ Failed to initialize Blockchain Service:", err.message);
            process.exit(1); // Exit if initialization fails
        }
    }

    // ============================================
    // SECRET MANAGEMENT (Commit-Reveal Scheme)
    // ============================================

    /**
     * Register a secret for later reveal
     * Secrets are auto-cleaned after 15 minutes
     */
    registerSecret(serverHash, secret) {
        this.pendingSecrets.set(serverHash, secret);
        
        // Auto-cleanup after 15 minutes
        setTimeout(() => {
            if (this.pendingSecrets.has(serverHash)) {
                console.log(`🧹 Cleaning up expired secret: ${serverHash.slice(0, 10)}...`);
                this.pendingSecrets.delete(serverHash);
            }
        }, 15 * 60 * 1000);
        
        console.log(`🔐 Secret registered: ${serverHash.slice(0, 10)}... (auto-cleanup in 15m)`);
    }

    // ============================================
    // EVENT POLLING (Robust with Error Handling)
    // ============================================

    async robustPoll() {
        // Prevent concurrent polling
        if (this.isPolling) return;
        this.isPolling = true;

        try {
            // Get current block
            const currentBlock = await this.provider.getBlockNumber();
            
            // Skip if no new blocks
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
                    
                    // Get submitter from transaction
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

            // Update last processed block
            this.lastProcessedBlock = currentBlock;
            this.isHealthy = true;

        } catch (err) {
            console.error("⚠️ Polling Error:", err.message);
            
            // Try backup RPC if primary fails repeatedly
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

    /**
     * Handle GameReadyToStart event
     * Waits for reveal block, then reveals secret
     */
    async handleGameReady(gameId, targetBlock) {
        try {
            // Get game data from contract
            const core = await this.contract.gameCores(gameId);
            const serverHash = core.serverCommitHash;
            
            // Retrieve secret
            const secret = this.pendingSecrets.get(serverHash);
            
            if (!secret) {
                console.error(`❌ CRITICAL: No secret found for Game ${gameId}!`);
                console.error(`   Server Hash: ${serverHash}`);
                console.error(`   Cannot reveal game. Players will need emergency withdraw.`);
                return;
            }

            // Initialize game in memory if needed
            if (this.gameManager && !this.gameManager.games[gameId]) {
                console.log(`📥 Initializing memory for Game ${gameId}`);
                
                const game = this.gameManager.createWeb3Game(gameId, secret);
                
                // Get players from contract
                const gameInfo = await this.contract.getGameInfo(gameId);
                const players = gameInfo[1]; // address[4] players
                
                const validPlayerIds = [];
                for (let i = 0; i < 4; i++) {
                    if (players[i] && players[i] !== ethers.ZeroAddress) {
                        game.players[i].id = players[i];
                        game.players[i].name = `Player ${i + 1}`;
                        validPlayerIds.push(players[i]);
                    }
                }

                // Force socket connections
                if (this.gameManager.forceJoinSockets) {
                    this.gameManager.forceJoinSockets(gameId, validPlayerIds);
                }
                
                this.gameManager.broadcastGameState(gameId);
            }

            // Wait for reveal block
            let current = await this.provider.getBlockNumber();
            while (current <= targetBlock) {
                console.log(`⏳ Waiting for block ${targetBlock + 1} (Current: ${current})...`);
                await new Promise(r => setTimeout(r, 2000)); // Wait 2 seconds
                current = await this.provider.getBlockNumber();
            }

            // Reveal game
            console.log(`🔓 Revealing Game ${gameId}...`);
            await this.revealAndStartGame(gameId, secret);
            
            // Cleanup secret
            this.pendingSecrets.delete(serverHash);
            console.log(`✅ Secret revealed and cleaned up for ${gameId}`);

        } catch (e) {
            console.error(`❌ Handle Game Ready Failed for ${gameId}:`, e.message);
        }
    }

    /**
     * Poll queue events for lobby updates
     */
    pollQueueEvents(from, to) {
        if (!this.gameManager) return;
        
        // QueueEntered event
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
            .catch(() => {}); // Silently ignore errors

        // QueueLeft event
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
            .catch(() => {}); // Silently ignore errors
    }

    /**
     * Send periodic lobby sync updates
     */
    startLobbyHeartbeat() {
        setInterval(async () => {
            if (!this.gameManager) return;
            
            for (let tier = 0; tier <= 3; tier++) {
                try {
                    const queueMembers = await this.contract.getQueueMembers(tier);
                    
                    this.gameManager.io.to(`TIER_${tier}_LOBBY`).emit('LOBBY_SYNC', {
                        count: queueMembers.length,
                        players: queueMembers,
                        timestamp: Date.now()
                    });
                } catch (e) {
                    // Silently ignore - next heartbeat will retry
                }
            }
        }, 10000); // Every 10 seconds
    }

    // ============================================
    // EIP-712 SIGNING (Deterministic Signatures)
    // ============================================

    /**
     * Get EIP-712 Domain - Base Mainnet Only
     */
    getDomain() {
        return { 
            name: "CallBreak_V3", 
            version: "1", 
            chainId: BASE_MAINNET.chainId, // Hardcoded: 8453
            verifyingContract: process.env.CONTRACT_ADDRESS 
        };
    }

    /**
     * Sign Join Request (for joinAndStartGame)
     */
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

    /**
     * Sign Final Result (CRITICAL FIX - Proper Score Hashing)
     */
    async signFinalResult(gameId, randomSeed, transcriptHash, scores, winner, expiryTimestamp) {
        // ============================================
        // CRITICAL FIX: Validate and hash scores correctly
        // ============================================
        
        // 1. Ensure scores are integers (no decimals)
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
        
        // 2. Hash scores exactly as Solidity does
        // Solidity: keccak256(abi.encodePacked(int256[]))
        const scoresHash = ethers.keccak256(
            ethers.solidityPacked(
                ["int256", "int256", "int256", "int256"], 
                intScores
            )
        );
        
        console.log(`   Scores Hash: ${scoresHash}`);
        
        // 3. Create EIP-712 signature
        const types = { 
            FinalState: [
                { name: "gameId", type: "bytes32" },
                { name: "randomSeed", type: "uint256" },
                { name: "transcriptHash", type: "bytes32" },
                { name: "scoresHash", type: "bytes32" }, // Note: Hash, not array
                { name: "winner", type: "address" },
                { name: "expiryTimestamp", type: "uint256" }
            ] 
        };
        
        const value = { 
            gameId, 
            randomSeed: BigInt(randomSeed), 
            transcriptHash, 
            scoresHash, // Use the hash
            winner, 
            expiryTimestamp: BigInt(expiryTimestamp) 
        };
        
        const signature = await this.wallet.signTypedData(this.getDomain(), types, value);
        
        console.log(`✅ Final Result Signed Successfully`);
        console.log(`   Signature: ${signature.slice(0, 20)}...`);
        
        return signature;
    }

    // ============================================
    // CONTRACT INTERACTIONS
    // ============================================

    /**
     * Reveal and start game (called by server)
     */
    async revealAndStartGame(gameId, secret) {
        try {
            console.log(`🔓 Revealing Game ${gameId}...`);
            
            // Send transaction
            const tx = await this.contract.revealAndStart(gameId, secret);
            console.log(`📤 Reveal TX Sent: ${tx.hash}`);
            
            // Wait for confirmation
            const receipt = await tx.wait(1);
            
            if (receipt.status === 0) {
                throw new Error("Transaction reverted");
            }
            
            console.log(`✅ Game ${gameId} revealed successfully at block ${receipt.blockNumber}`);
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
    // HEALTH MONITORING
    // ============================================

    /**
     * Monitor network health and server bond
     */
    async monitorNetworkHealth() {
        setInterval(async () => {
            try {
                // Check network ID
                const network = await this.provider.getNetwork();
                if (Number(network.chainId) !== BASE_MAINNET.chainId) {
                    console.error("❌ CRITICAL: Not on Base Mainnet!");
                    this.alertAdmin("Network mismatch detected!");
                    this.isHealthy = false;
                    return;
                }
                
                // Check RPC responsiveness
                const startTime = Date.now();
                await this.provider.getBlockNumber();
                const latency = Date.now() - startTime;
                
                if (latency > 5000) {
                    console.warn(`⚠️ High RPC latency: ${latency}ms`);
                }
                
                // Check server bond levels
                const bond = await this.contract.serverBond();
                const locked = await this.contract.lockedBond();
                const available = bond - locked;
                
                // Alert if low (less than 0.5 ETH available)
                if (available < ethers.parseEther("0.5")) {
                    console.warn(`⚠️ Low Server Bond!`);
                    console.warn(`   Total: ${ethers.formatEther(bond)} ETH`);
                    console.warn(`   Locked: ${ethers.formatEther(locked)} ETH`);
                    console.warn(`   Available: ${ethers.formatEther(available)} ETH`);
                    this.alertAdmin(`Low server bond: ${ethers.formatEther(available)} ETH available`);
                }
                
                // Mark as healthy if all checks pass
                this.isHealthy = true;
                
            } catch (error) {
                console.error("❌ Health check failed:", error.message);
                this.isHealthy = false;
            }
        }, 60000); // Every minute
    }

    /**
     * Alert admin (implement your notification system here)
     */
    alertAdmin(message) {
        console.log(`\n🚨 ========================================`);
        console.log(`🚨 ADMIN ALERT: ${message}`);
        console.log(`🚨 Time: ${new Date().toISOString()}`);
        console.log(`🚨 ========================================\n`);
        
        // TODO: Implement actual alerting
        // Examples:
        // - Send Discord webhook
        // - Send Telegram message
        // - Send email via SendGrid
        // - Log to Sentry
        
        // Example Discord webhook:
        // if (process.env.DISCORD_WEBHOOK) {
        //     fetch(process.env.DISCORD_WEBHOOK, {
        //         method: 'POST',
        //         headers: { 'Content-Type': 'application/json' },
        //         body: JSON.stringify({
        //             content: `🚨 **CallBreak Alert**\n${message}\nTime: ${new Date().toISOString()}`
        //         })
        //     }).catch(e => console.error("Failed to send Discord alert:", e));
        // }
    }

    // ============================================
    // UTILITY FUNCTIONS
    // ============================================

    /**
     * Get current block number
     */
    async getCurrentBlock() {
        try {
            return await this.provider.getBlockNumber();
        } catch (error) {
            console.error("Error getting block number:", error.message);
            return this.lastProcessedBlock; // Return last known block
        }
    }

    /**
     * Get service health status
     */
    getHealthStatus() {
        return {
            isHealthy: this.isHealthy,
            chainId: this.chainId,
            network: BASE_MAINNET.name,
            lastProcessedBlock: this.lastProcessedBlock,
            serverAddress: this.wallet.address,
            contractAddress: process.env.CONTRACT_ADDRESS
        };
    }
}

module.exports = new BlockchainService();
