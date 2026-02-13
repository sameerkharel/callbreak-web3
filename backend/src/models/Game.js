// backend/src/models/Game.js
const mongoose = require('mongoose');

const GameSchema = new mongoose.Schema({
    roomId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    tier: {
        type: Number,
        required: true, 
        enum: [0, 1, 2, 3] 
    },
    status: {
        type: String,
        enum: ['ACTIVE', 'COMPLETED', 'SUBMITTED', 'SETTLED', 'ABANDONED'],
        default: 'ACTIVE'
    },
    // Who played?
    players: [{
        walletAddress: { type: String, lowercase: true },
        nickname: String,
        score: Number,
        avatar: String
    }],
    // Verification Data (The "Receipt")
    result: {
        winnerAddress: { type: String, lowercase: true },
        scores: [Number],
        transcriptHash: String,
        signature: String,
        expiry: Number
    },
    // Transaction History
    txHash: { type: String, default: null }, 
    finalizedTxHash: { type: String, default: null },
    
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date }
});

module.exports = mongoose.model('Game', GameSchema);