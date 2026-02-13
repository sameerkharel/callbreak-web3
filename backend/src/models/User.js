// backend/src/models/User.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    walletAddress: {
        type: String,
        required: true,
        unique: true, // No duplicate accounts for one wallet
        lowercase: true, // Store addresses in lowercase to prevent mismatches
        index: true // Makes searching faster
    },
    nickname: {
        type: String,
        default: function() {
            // Default name: "Player_1234" (Last 4 digits of wallet)
            return "Player_" + this.walletAddress.slice(-4);
        }
    },
    avatarId: {
        type: String,
        default: "default_avatar" // We will map this to an image on frontend
    },
    // --- Stats Tracker ---
    stats: {
        gamesPlayed: { type: Number, default: 0 },
        wins: { type: Number, default: 0 },
        totalEarnings: { type: String, default: "0" } // Store big numbers as Strings
    },
    // --- Security ---
    nonce: { 
        // Used for "Sign-In with Ethereum" security check
        type: Number, 
        default: () => Math.floor(Math.random() * 1000000) 
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('User', UserSchema);