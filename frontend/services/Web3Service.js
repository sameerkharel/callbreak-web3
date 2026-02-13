// ============================================
// Web3Service.js - PRODUCTION READY
// Base Mainnet Only | All Compatibility Fixes Applied
// ============================================

import { ethers } from "ethers";
import CallBreakABI from "../abis/CallBreakCasino.json"; 

// ============================================
// BASE MAINNET CONFIGURATION
// ============================================

const BASE_MAINNET = {
    chainId: 8453,
    chainIdHex: '0x2105',
    chainIdBigInt: 8453n,
    name: 'Base Mainnet',
    nativeCurrency: {
        name: 'Ethereum',
        symbol: 'ETH',
        decimals: 18
    },
    rpcUrls: {
        default: { http: ['https://mainnet.base.org'] },
        public: { http: ['https://mainnet.base.org'] },
        backup: { http: ['https://base.llamarpc.com'] }
    },
    blockExplorers: {
        default: { name: 'BaseScan', url: 'https://basescan.org' }
    }
};

// Environment Variables
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || BASE_MAINNET.rpcUrls.default.http[0];
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

class Web3Service {
    constructor() {
        this.provider = null;
        this.signer = null;
        this.contract = null;
        this.account = null;
        
        // Network constants (Base Mainnet Only)
        this.EXPECTED_CHAIN_ID = BASE_MAINNET.chainIdBigInt;
        this.EXPECTED_CHAIN_HEX = BASE_MAINNET.chainIdHex;
        this.NETWORK_NAME = BASE_MAINNET.name;
        this.EXPLORER_URL = BASE_MAINNET.blockExplorers.default.url;
    }

    // ============================================
    // AUTHENTICATION & CONNECTION
    // ============================================

    /**
     * Connect wallet and ensure Base Mainnet
     * @param {boolean} forceNewSelection - Force account picker to open
     */
    async connect(forceNewSelection = false) {
        if (typeof window === "undefined" || !window.ethereum) {
            throw new Error("No Wallet Found. Please install MetaMask or another Web3 wallet.");
        }
        
        this.provider = new ethers.BrowserProvider(window.ethereum);
        
        // CRITICAL: Ensure Base Mainnet before anything else
        await this.ensureNetwork();

        // Force account selection if requested
        if (forceNewSelection) {
            try {
                await window.ethereum.request({
                    method: "wallet_requestPermissions",
                    params: [{ eth_accounts: {} }]
                });
            } catch (error) {
                console.warn("User cancelled account switch");
                throw new Error("Account selection cancelled");
            }
        }

        // Get signer and account
        this.signer = await this.provider.getSigner();
        this.account = await this.signer.getAddress();
        
        // Validate contract address
        if (!CONTRACT_ADDRESS || CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000') {
            throw new Error(
                "Contract not deployed. Please set NEXT_PUBLIC_CONTRACT_ADDRESS in your environment."
            );
        }
        
        // Initialize contract
        this.contract = new ethers.Contract(
            CONTRACT_ADDRESS, 
            CallBreakABI, 
            this.signer
        );
        
        console.log(`🎮 Connected: ${this.account.slice(0, 6)}...${this.account.slice(-4)}`);
        console.log(`📝 Contract: ${CONTRACT_ADDRESS.slice(0, 6)}...${CONTRACT_ADDRESS.slice(-4)}`);
        console.log(`🌍 Network: ${this.NETWORK_NAME} (Chain ID: 8453)`);
        
        return this.account;
    }

    /**
     * Ensures user is on Base Mainnet - Auto-switches or adds network
     */
    async ensureNetwork() {
        const network = await this.provider.getNetwork();
        
        if (network.chainId !== this.EXPECTED_CHAIN_ID) {
            console.log(`⚠️ Wrong Network (Chain ID: ${network.chainId})`);
            console.log(`🔄 Switching to ${this.NETWORK_NAME}...`);
            
            try {
                // Attempt to switch to Base Mainnet
                await window.ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: this.EXPECTED_CHAIN_HEX }],
                });
                
                // Refresh provider after switch
                this.provider = new ethers.BrowserProvider(window.ethereum);
                
                // Verify switch succeeded
                const newNetwork = await this.provider.getNetwork();
                if (newNetwork.chainId !== this.EXPECTED_CHAIN_ID) {
                    throw new Error("Network switch verification failed");
                }
                
                console.log(`✅ Switched to ${this.NETWORK_NAME}`);
                
            } catch (switchError) {
                // User rejected switch
                if (switchError.code === 4001) {
                    throw new Error(
                        `❌ Network Switch Required\n\n` +
                        `You must switch to ${this.NETWORK_NAME} to play.\n\n` +
                        `Current Network: Chain ID ${network.chainId}\n` +
                        `Required: ${this.NETWORK_NAME} (Chain ID 8453)`
                    );
                }
                
                // Network not added to wallet - add it automatically
                if (switchError.code === 4902) {
                    console.log(`📝 Adding ${this.NETWORK_NAME} to wallet...`);
                    
                    try {
                        await window.ethereum.request({
                            method: 'wallet_addEthereumChain',
                            params: [{
                                chainId: this.EXPECTED_CHAIN_HEX,
                                chainName: BASE_MAINNET.name,
                                nativeCurrency: BASE_MAINNET.nativeCurrency,
                                rpcUrls: BASE_MAINNET.rpcUrls.default.http,
                                blockExplorerUrls: [BASE_MAINNET.blockExplorers.default.url]
                            }]
                        });
                        
                        // Refresh provider after adding
                        this.provider = new ethers.BrowserProvider(window.ethereum);
                        console.log(`✅ ${this.NETWORK_NAME} added successfully`);
                        
                    } catch (addError) {
                        if (addError.code === 4001) {
                            throw new Error(
                                `❌ Network Addition Rejected\n\n` +
                                `You must add ${this.NETWORK_NAME} to your wallet to play.\n` +
                                `Please add it manually in your wallet settings.`
                            );
                        }
                        throw new Error(
                            `Failed to add ${this.NETWORK_NAME} to your wallet.\n` +
                            `Error: ${addError.message}`
                        );
                    }
                } else {
                    // Unknown error during switch
                    throw new Error(
                        `❌ Network Switch Failed\n\n` +
                        `Error: ${switchError.message}\n\n` +
                        `Please manually switch to ${this.NETWORK_NAME} in your wallet.`
                    );
                }
            }
        } else {
            console.log(`✅ Already on ${this.NETWORK_NAME}`);
        }
    }

    /**
     * Sign message for authentication (SIWE pattern)
     */
    async authenticateUser(address) {
        if (!this.signer) await this.connect();
        
        try {
            const message = `Welcome to CallBreak Ultimate!

Please sign this message to verify your identity and log in securely.

Wallet: ${address}
Network: ${this.NETWORK_NAME}
Timestamp: ${Date.now()}
Nonce: ${Math.random().toString(36).substr(2, 9)}

This signature will not trigger any blockchain transactions.`;
            
            const signature = await this.signer.signMessage(message);
            
            console.log("✅ User authenticated. Signature:", signature.slice(0, 10) + "...");
            return signature;
            
        } catch (error) {
            if (error.code === 4001 || error.code === 'ACTION_REJECTED') {
                throw new Error("You must sign the message to enter the Casino.");
            }
            throw new Error("Authentication failed: " + error.message);
        }
    }

    /**
     * Disconnect and reset service
     */
    disconnect() {
        this.provider = null;
        this.signer = null;
        this.contract = null;
        this.account = null;
        console.log("🔌 Wallet disconnected");
    }

    // ============================================
    // USER & ACTIVITY APIs
    // ============================================

    /**
     * Login/Register user on backend
     */
    async loginUser(walletAddress) {
        try {
            const response = await fetch(`${API_URL}/api/user/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ walletAddress })
            });

            const data = await response.json();
            
            if (data.success) {
                console.log("✅ Logged in as:", data.user.nickname);
                return data.user;
            } else {
                console.error("Login API Error:", data.error);
                return null;
            }
        } catch (error) {
            console.error("Login Network Error:", error);
            return null;
        }
    }

    /**
     * Fetch user's game history
     */
    async fetchUserActivity(walletAddress) {
        try {
            const response = await fetch(`${API_URL}/api/activity/${walletAddress}`);
            if (!response.ok) throw new Error("Failed to fetch activity");
            return await response.json();
        } catch (error) {
            console.error("Activity Fetch Error:", error);
            return [];
        }
    }

    // ============================================
    // CONTRACT INTERACTIONS - QUEUE & GAME
    // ============================================

    /**
     * Get dynamic entry fee from contract (future-proof)
     */
    async getEntryFee(tier) {
        if (!this.contract) await this.connect();
        
        try {
            const fee = await this.contract.tierEntryFees(tier);
            return fee;
        } catch (error) {
            console.warn("⚠️ Could not fetch fee from contract, using fallback:", error.message);
            // Fallback fees (should match contract deployment)
            const fallbackFees = ["0.00001", "0.0001", "0.001", "0.01"];
            return ethers.parseEther(fallbackFees[tier] || "0.00001");
        }
    }

    /**
     * Join game with full pre-flight checks and deterministic path selection
     */
    async joinGame(tier) {
        if (!this.contract) await this.connect();

        // Validate tier
        if (tier < 0 || tier > 3) {
            throw new Error(`Invalid Game Tier: ${tier}. Must be 0-3.`);
        }

        console.log(`🔍 Checking blockchain state for ${this.account}...`);

        // ============================================
        // PRE-FLIGHT CHECK: Verify player is free
        // ============================================
        const status = await this.getPlayerStatus();
        
        if (status.status === "PLAYING") {
            throw new Error(
                `Active Game Exists\n\n` +
                `Room: ${status.gameId}\n` +
                `You must finish your current game before joining a new one.`
            );
        }
        
        if (status.status === "QUEUED") {
            throw new Error(
                `Already Queued\n\n` +
                `Tier: ${status.tier}\n` +
                `Please wait for opponents or leave the queue first.`
            );
        }

        // ============================================
        // CHECK QUEUE LENGTH
        // ============================================
        const queueLengthBigInt = await this.contract.getQueueLength(tier);
        const queueLength = Number(queueLengthBigInt);
        console.log(`📊 Queue Length for Tier ${tier}: ${queueLength}/4`);

        // ============================================
        // GET ENTRY FEE
        // ============================================
        const valueToSend = await this.getEntryFee(tier);
        console.log(`💰 Entry Fee: ${ethers.formatEther(valueToSend)} ETH`);

        // ============================================
        // PATH A: NORMAL QUEUE ENTRY (< 3 players)
        // ============================================
        if (queueLength < 3) {
            console.log("👉 Path A: Joining Queue (waiting for more players)");
            
            try {
                // Gas estimation
                await this.contract.enterQueue.estimateGas(tier, { value: valueToSend });
                
                // Execute transaction
                const tx = await this.contract.enterQueue(tier, { value: valueToSend });
                console.log(`⏳ Queue Entry Tx: ${tx.hash}`);
                console.log(`🔗 View on BaseScan: ${this.EXPLORER_URL}/tx/${tx.hash}`);
                
                // Wait for confirmation
                const receipt = await this.waitForTransaction(tx, "Queue Entry");
                console.log(`✅ Successfully joined queue at block ${receipt.blockNumber}`);
                
                return true;
                
            } catch (err) {
                console.error("❌ Queue Entry Failed:", err);
                
                if (err.code === 'INSUFFICIENT_FUNDS') {
                    throw new Error("Insufficient ETH balance to join queue");
                }
                
                if (err.message?.includes('Active Game Exists')) {
                    throw new Error("Active Game Exists");
                }
                
                if (err.message?.includes('Already Queued')) {
                    throw new Error("Already Queued");
                }
                
                throw new Error("Queue Entry Failed: " + (err.reason || err.message));
            }
        } 
        // ============================================
        // PATH B: TRIGGER GAME START (exactly 3 players)
        // ============================================
        else if (queueLength === 3) {
            console.log("👉 Path B: Starting Game (you are the 4th player)");
            
            // Get server signature
            console.log("📝 Requesting server signature...");
            
            const response = await fetch(`${API_URL}/api/sign-join`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    tier, 
                    playerAddress: this.account 
                })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || "Backend signature request failed");
            }
            
            const data = await response.json();
            console.log("✅ Server signature received");

            // Prepare join parameters
            const joinParams = {
                serverHash: data.serverHash,
                signature: data.signature,
                nonce: data.nonce,
                expiryBlock: data.expiryBlock
            };

            try {
                // Gas estimation
                await this.contract.joinAndStartGame.estimateGas(tier, joinParams, { value: valueToSend });
                
                // Execute transaction
                const tx = await this.contract.joinAndStartGame(tier, joinParams, { value: valueToSend });
                console.log(`⏳ Game Start Tx: ${tx.hash}`);
                console.log(`🔗 View on BaseScan: ${this.EXPLORER_URL}/tx/${tx.hash}`);
                
                // Wait for confirmation
                const receipt = await this.waitForTransaction(tx, "Game Start");
                console.log(`✅ Game started successfully at block ${receipt.blockNumber}`);
                
                return true;
                
            } catch (err) {
                console.error("❌ Game Start Failed:", err);
                
                if (err.code === 'INSUFFICIENT_FUNDS') {
                    throw new Error("Insufficient ETH balance to start game");
                }
                
                if (err.message?.includes('Sig Expired')) {
                    throw new Error("Signature expired. Please try again.");
                }
                
                if (err.message?.includes('Queue not ready')) {
                    throw new Error("Queue state changed. Please try again.");
                }
                
                throw new Error("Game Start Failed: " + (err.reason || err.message));
            }
        } 
        // ============================================
        // INVALID STATE (queue > 3 - should not happen)
        // ============================================
        else {
            throw new Error(
                `Queue Error\n\n` +
                `Queue is currently full or in invalid state (${queueLength}/4).\n` +
                `Please try again in a few seconds.`
            );
        }
    }

    /**
     * Leave matchmaking queue
     */
    async leaveQueue() {
        if (!this.contract) await this.connect();
        
        try {
            const tx = await this.contract.leaveQueue();
            console.log(`⏳ Leave Queue Tx: ${tx.hash}`);
            
            await this.waitForTransaction(tx, "Leave Queue");
            console.log("✅ Successfully left queue");
            
            return true;
            
        } catch (error) {
            // If already not in queue, treat as success
            if (error.message?.includes("Not Queued") || error.reason === "Not Queued") {
                console.log("ℹ️ Already not in queue");
                return true;
            }
            throw error;
        }
    }

    // ============================================
    // GAME RESULT SUBMISSION
    // ============================================

    /**
     * Submit game result to blockchain
     */
    async submitResult(gameId, resultData) {
        if (!this.contract) await this.connect();
        
        // Validate inputs
        if (!gameId || gameId === ethers.ZeroHash) {
            throw new Error("Invalid game ID provided");
        }
        
        if (!resultData || !resultData.winner || !resultData.scores || !resultData.signature) {
            throw new Error("Incomplete result data. Missing required fields.");
        }

        // Validate scores are integers (CRITICAL FIX)
        const validatedScores = resultData.scores.map((score, i) => {
            const intScore = Math.round(Number(score) * 10);
            if (isNaN(intScore)) {
                throw new Error(`Invalid score at index ${i}: ${score}`);
            }
            return intScore;
        });

        const params = {
            winner: resultData.winner,
            scores: validatedScores, // Use validated integer scores
            transcriptHash: resultData.transcriptHash,
            expiryTimestamp: resultData.expiry,
            signature: resultData.signature
        };

        console.log("📝 Submitting Game Result:");
        console.log("  Game ID:", gameId);
        console.log("  Winner:", params.winner);
        console.log("  Scores:", params.scores);

        try {
            // Gas estimation
            await this.contract.submitFinalState.estimateGas(gameId, params);
            
            // Execute
            const tx = await this.contract.submitFinalState(gameId, params);
            console.log(`⏳ Submit Result Tx: ${tx.hash}`);
            console.log(`🔗 View on BaseScan: ${this.EXPLORER_URL}/tx/${tx.hash}`);
            
            // Wait for confirmation
            await this.waitForTransaction(tx, "Submit Result");
            console.log("✅ Result submitted successfully");
            
            return true;
            
        } catch (error) {
            console.error("❌ Submit Result Failed:", error);
            
            if (error.message?.includes("Submitted") || error.message?.includes("0xbaa6adbd")) {
                throw new Error("Result already submitted by another player");
            }
            
            if (error.message?.includes("Invalid Server Sig")) {
                throw new Error("Server signature verification failed. Please contact support.");
            }
            
            if (error.message?.includes("Expired")) {
                throw new Error("Result signature has expired");
            }
            
            throw new Error("Submit Failed: " + (error.reason || error.message));
        }
    }

    /**
     * Finalize game and claim winnings
     */
    async finalizeGame(gameId) {
        if (!this.contract) await this.connect();
        
        if (!gameId || gameId === ethers.ZeroHash) {
            throw new Error("Invalid game ID provided");
        }
        
        console.log("💰 Claiming Winnings for:", gameId);
        
        try {
            // Gas estimation
            await this.contract.finalizeGame.estimateGas(gameId);
            
            // Execute
            const tx = await this.contract.finalizeGame(gameId);
            console.log(`⏳ Finalize Tx: ${tx.hash}`);
            console.log(`🔗 View on BaseScan: ${this.EXPLORER_URL}/tx/${tx.hash}`);
            
            // Wait for confirmation
            await this.waitForTransaction(tx, "Finalize Game");
            console.log("✅ Winnings claimed successfully");
            
            return true;
            
        } catch (error) {
            console.error("❌ Finalize Failed:", error);
            
            if (error.message?.includes("Wait window") || error.message?.includes("0x5bb5f22c")) {
                throw new Error("⏳ Challenge window not finished yet. Please wait a few more minutes.");
            }
            
            if (error.message?.includes("Settled") || error.message?.includes("0x8f9195fb")) {
                throw new Error("This game has already been finalized");
            }
            
            if (error.message?.includes("Not Submitted") || error.message?.includes("0x82b42900")) {
                throw new Error("Game result hasn't been submitted yet");
            }
            
            if (error.message?.includes("Challenged")) {
                throw new Error("Game is under dispute. Admin resolution required.");
            }
            
            throw new Error("Claim Failed: " + (error.reason || error.message));
        }
    }

    // ============================================
    // EMERGENCY FUNCTIONS
    // ============================================

    /**
     * Emergency withdraw from stuck/abandoned game
     */
    async emergencyWithdraw(gameId) {
        if (!this.contract) await this.connect();
        
        if (!gameId || gameId === ethers.ZeroHash) {
            throw new Error("Invalid game ID provided");
        }
        
        console.log("🚑 Attempting Emergency Withdraw for:", gameId);
        
        try {
            // Gas estimation
            await this.contract.emergencyWithdraw.estimateGas(gameId);
            
            // Execute
            const tx = await this.contract.emergencyWithdraw(gameId);
            console.log(`⏳ Emergency Withdraw Tx: ${tx.hash}`);
            console.log(`🔗 View on BaseScan: ${this.EXPLORER_URL}/tx/${tx.hash}`);
            
            // Wait for confirmation
            await this.waitForTransaction(tx, "Emergency Withdraw");
            console.log("✅ Funds recovered successfully");
            
            return true;
            
        } catch (error) {
            console.error("❌ Emergency Withdraw Failed:", error);
            
            if (error.message?.includes("Too early")) {
                throw new Error("⏳ Emergency unlock timer hasn't expired yet. Please wait.");
            }
            
            if (error.message?.includes("Game not found")) {
                throw new Error("Game not found or already settled");
            }
            
            throw new Error("Withdraw Failed: " + (error.reason || error.message));
        }
    }

    /**
     * Withdraw pending funds from fallback storage
     */
    async withdrawPendingFunds() {
        if (!this.contract) await this.connect();
        
        try {
            // Gas estimation
            await this.contract.withdrawPending.estimateGas();
            
            // Execute
            const tx = await this.contract.withdrawPending();
            console.log(`⏳ Withdraw Pending Tx: ${tx.hash}`);
            
            // Wait for confirmation
            await this.waitForTransaction(tx, "Withdraw Pending");
            console.log("✅ Pending funds withdrawn successfully");
            
            return true;
            
        } catch (error) {
            if (error.message?.includes("Zero balance") || error.message?.includes("0x01f180c9")) {
                throw new Error("No pending funds to withdraw");
            }
            throw new Error("Withdraw Failed: " + (error.reason || error.message));
        }
    }

    /**
     * Check if user has pending withdrawals
     */
    async checkPendingWithdrawals() {
        if (!this.contract) await this.connect();
        
        try {
            const pendingWei = await this.contract.pendingWithdrawals(this.account);
            return pendingWei > 0n;
        } catch (error) {
            console.error("Error checking pending withdrawals:", error);
            return false;
        }
    }

    // ============================================
    // STATE QUERIES
    // ============================================

    /**
     * Get comprehensive player status (FIXED - matches contract logic)
     */
    async getPlayerStatus() {
        if (!this.contract) await this.connect();
        
        try {
            // Check active game mapping
            const activeGameId = await this.contract.playerActiveGame(this.account);
            
            if (activeGameId && activeGameId !== ethers.ZeroHash) {
                try {
                    // Get game state
                    const state = await this.contract.gameStates(activeGameId);
                    
                    // CRITICAL FIX: Match contract's _isPlayerBusy logic exactly
                    // if (state.finalSubmitted || state.isSettled) return false;
                    if (state.finalSubmitted || state.isSettled) {
                        console.log("✅ Game complete (submitted or settled). User is free.");
                        return { status: "IDLE" };
                    }

                    // Game is active - player is busy
                    const gameInfo = await this.contract.getGameInfo(activeGameId);
                    
                    return { 
                        status: "PLAYING", 
                        gameId: activeGameId,
                        hasStarted: gameInfo.randomSeed > 0n,
                        createdAt: Number(gameInfo.creationTime),
                        emergencyUnlocksAt: Number(gameInfo.emergencyUnlocksAt)
                    };
                    
                } catch (e) {
                    // DEFENSIVE: If read fails, assume IDLE to prevent UI locks
                    console.warn("⚠️ Contract read error, assuming IDLE:", e.message);
                    return { status: "IDLE" };
                }
            }

            // Check if in queue
            const isQueued = await this.contract.isQueued(this.account);
            if (isQueued) {
                const tier = await this.contract.queuedTier(this.account);
                return { 
                    status: "QUEUED", 
                    tier: Number(tier) 
                };
            }
            
            // Player is free
            return { status: "IDLE" };
            
        } catch (error) {
            // DEFENSIVE: On any error, return IDLE to prevent UI locks
            console.error("⚠️ Status Check Error - Defaulting to IDLE:", error);
            return { status: "IDLE" };
        }
    }

    /**
     * Get game status from blockchain
     */
    async getGameStatus(gameId) {
        if (!this.contract) await this.connect();
        
        if (!gameId || gameId === ethers.ZeroHash) {
            console.warn("⚠️ Invalid gameId provided to getGameStatus:", gameId);
            return null;
        }
        
        try {
            const state = await this.contract.gameStates(gameId);
            
            return {
                finalSubmitted: state.finalSubmitted,
                challengeWindowEnds: Number(state.challengeWindowEnds),
                isSettled: state.isSettled,
                signedWinner: state.signedWinner,
                isActive: state.isActive
            };
            
        } catch (error) {
            console.error("Get Game Status Error:", error);
            return null;
        }
    }

    /**
     * Recovery Mode - Fetch finished game data from backend
     * Used when blockchain says user is in game, but server lost state
     */
    async getRecoverableGame(gameId) {
        if (!gameId || gameId === ethers.ZeroHash) {
            console.warn("⚠️ Invalid gameId for recovery:", gameId);
            return null;
        }
        
        try {
            console.log("🔍 Checking if game is recoverable:", gameId);
            
            const response = await fetch(`${API_URL}/api/game-recovery/${gameId}`);
            
            if (!response.ok) {
                console.log("ℹ️ No recoverable game found (expected for active games)");
                return null;
            }
            
            const data = await response.json();
            
            console.log("✅ RECOVERY DATA FOUND:", data);
            return data;
            
        } catch (error) {
            console.error("Recovery fetch error:", error);
            return null;
        }
    }

    // ============================================
    // UTILITY FUNCTIONS
    // ============================================

    /**
     * Wait for transaction with timeout and status check
     */
    async waitForTransaction(tx, actionName = "Transaction") {
        try {
            console.log(`⏳ ${actionName} pending...`);
            
            // Wait for 1 confirmation
            const receipt = await tx.wait(1);
            
            // Check if transaction succeeded
            if (receipt.status === 0) {
                throw new Error(`${actionName} reverted on-chain`);
            }
            
            console.log(`✅ ${actionName} confirmed in block ${receipt.blockNumber}`);
            return receipt;
            
        } catch (error) {
            if (error.code === 'TIMEOUT') {
                throw new Error(
                    `${actionName} is taking too long.\n\n` +
                    `Check transaction status: ${this.EXPLORER_URL}/tx/${tx.hash}`
                );
            }
            throw error;
        }
    }

    /**
     * Get current network info
     */
    async getNetworkInfo() {
        if (!this.provider) {
            return { chainId: 0, name: 'Not Connected' };
        }
        
        try {
            const network = await this.provider.getNetwork();
            return {
                chainId: Number(network.chainId),
                name: network.chainId === this.EXPECTED_CHAIN_ID ? this.NETWORK_NAME : 'Unknown Network'
            };
        } catch (error) {
            return { chainId: 0, name: 'Error' };
        }
    }

    /**
     * Format address for display
     */
    formatAddress(address) {
        if (!address) return '';
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    }

    /**
     * Get explorer link for transaction
     */
    getExplorerLink(txHash) {
        return `${this.EXPLORER_URL}/tx/${txHash}`;
    }

    /**
     * Get explorer link for address
     */
    getAddressLink(address) {
        return `${this.EXPLORER_URL}/address/${address}`;
    }
}

export default new Web3Service();