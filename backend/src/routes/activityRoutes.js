// backend/src/routes/activityRoutes.js
const express = require('express');
const router = express.Router();
const Game = require('../models/Game');

// @route   GET /api/activity/:walletAddress
// @desc    Get all games played by a specific user
router.get('/:walletAddress', async (req, res) => {
    try {
        const address = req.params.walletAddress.toLowerCase();

        // 1. Find games where this user was a player
        const games = await Game.find({
            "players.walletAddress": address
        })
        .sort({ startedAt: -1 }) // Newest first
        .limit(50); // Limit to last 50 games for performance

        // 2. Format the data for the Frontend
        const formattedGames = games.map(game => {
            // Find specific player data for this user
            const myData = game.players.find(p => p.walletAddress === address);
            const isWinner = game.result?.winnerAddress === address;
            
            // Calculate Timers
            const now = Math.floor(Date.now() / 1000);
            const unlockTime = game.result?.expiry || 0;
            const isUnlockable = now >= unlockTime;

            return {
                gameId: game.roomId,
                tier: game.tier,
                status: game.status, // ACTIVE, COMPLETED, SUBMITTED
                result: isWinner ? 'WON' : 'LOST',
                score: myData?.score || 0,
                amount: calculateReward(game.tier, isWinner),
                
                // Timing / Claim Data
                unlockTime: unlockTime,
                isUnlockable: isUnlockable,
                timestamp: game.startedAt
            };
        });

        res.json(formattedGames);

    } catch (err) {
        console.error("Activity API Error:", err);
        res.status(500).json({ error: "Server Error" });
    }
});

// Helper to estimate reward (Visual only)
function calculateReward(tier, isWinner) {
    if (!isWinner) return "-";
    const pools = ["0.000036 ETH", "0.00036 ETH", "0.0036 ETH"]; // 90% of pot
    return pools[tier] || "0 ETH";
}

module.exports = router;