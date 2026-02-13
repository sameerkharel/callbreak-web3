// backend/src/config/db.js
const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI);
        
        console.log(`\n========================================`);
        console.log(`🍃 MONGODB CONNECTED: ${conn.connection.host}`);
        console.log(`========================================\n`);
    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        process.exit(1); // Stop the app if DB fails (Safety First)
    }
};

module.exports = connectDB;