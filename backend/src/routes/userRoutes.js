// backend/src/routes/userRoutes.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');

// @route   POST /api/user/login
// @desc    Get User Profile or Create New One (SIWE Logic)
router.post('/login', async (req, res) => {
    try {
        const { walletAddress } = req.body;

        if (!walletAddress) {
            return res.status(400).json({ error: "Wallet address required" });
        }

        // 1. Try to find the user
        let user = await User.findOne({ walletAddress: walletAddress.toLowerCase() });

        // 2. If not found, create them (First Time Login)
        if (!user) {
            console.log(`🆕 Creating new profile for ${walletAddress}`);
            user = new User({
                walletAddress: walletAddress.toLowerCase(),
                // nickname will auto-generate as "Player_XXXX" per our Model
            });
            await user.save();
        } else {
            console.log(`👤 User logged in: ${user.nickname}`);
        }

        // 3. Return the profile
        res.json({ success: true, user });

    } catch (err) {
        console.error("Login Error:", err);
        res.status(500).json({ error: "Server Error" });
    }
});

// @route   GET /api/user/:address
// @desc    Get specific user stats (for Scoreboard/History)
router.get('/:address', async (req, res) => {
    try {
        const user = await User.findOne({ walletAddress: req.params.address.toLowerCase() });
        if (!user) return res.status(404).json({ error: "User not found" });
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: "Server Error" });
    }
});

module.exports = router;