class CallBreakGame {
    constructor(id, mode, creatorId, tier = 0) {
        this.roomId = id;
        this.mode = mode; // 'BOTS', 'MULTIPLAYER', or 'WEB3'
        this.creatorId = creatorId;
        this.tier = tier; // [NEW] 0=Silver, 1=Gold, 2=Diamond
        
        this.players = [{}, {}, {}, {}];
        this.table = [];
        this.turn = 0;
        this.dealer = 0;
        this.round = 1;
        this.maxRounds = 3; // 1 for testing, change to 3 for prod
        this.status = 'WAITING'; // Internal Game State (WAITING, BIDDING, PLAYING)
        this.scores = [];
        
        // --- WEB3 & HYBRID HISTORY DATA ---
        this.serverSecret = null;   // Hidden secret
        this.randomSeed = null;     // Blockchain Seed
        
        // [NEW] Verification Data (For Activity Page)
        this.transcriptHash = null; // The unique ID of the game result
        this.winnerSignature = null; // The key to unlock funds
        this.winnerAddress = null;
        
        // [NEW] Transaction Tracking (For "Safety Net")
        this.txHash = null;         // Submission TX (User submitted result)
        this.finalizedTxHash = null;// Claim TX (User claimed funds)
        
        // [NEW] Status & Timestamps
        this.gameStatus = 'ACTIVE'; // ACTIVE, COMPLETED, SUBMITTED, SETTLED
        this.createdAt = Math.floor(Date.now() / 1000); 
        this.startTime = Date.now();
        this.endTime = null;
        this.expiryTimestamp = 0;   // When the 5-min challenge window ends

        this.hasStarted = false;    // Tracks if cards were dealt
    }

    // Standard Shuffle (Random) - For Free Games
    static dealCards(game) {
        const deck = this.createDeck();
        this.shuffle(deck); // Standard Math.random()
        this.distribute(game, deck);
        
        game.hasStarted = true;
        
        return this.checkRedeal(game);
    }

    // WEB3 Shuffle (Deterministic/Fair) - For Crypto Games
    static dealCardsDeterministic(game, seed) {
        const deck = this.createDeck();
        // Convert seed to string to ensure consistency across re-deals
        this.shuffleSeeded(deck, seed.toString()); 
        this.distribute(game, deck);
        
        game.hasStarted = true;
        
        return this.checkRedeal(game, seed); // Pass seed for recursion
    }

    // --- Helpers ---

    static createDeck() {
        const suits = ['S', 'H', 'D', 'C'];
        let deck = [];
        for (let s of suits) for (let r = 2; r <= 14; r++) deck.push({ s, r });
        return deck;
    }

    // Standard Fisher-Yates
    static shuffle(deck) {
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
    }

    // Deterministic Fisher-Yates using Blockchain Seed
    static shuffleSeeded(deck, seed) {
        let bigSeed;
        try {
            bigSeed = BigInt(seed);
        } catch (e) {
            console.error("Invalid seed provided, defaulting to 1", e);
            bigSeed = 1n;
        }

        let currentSeed = Number(bigSeed % 2147483647n);

        const random = () => {
            currentSeed = (currentSeed * 16807) % 2147483647;
            return (currentSeed - 1) / 2147483646;
        };

        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
    }

    static distribute(game, deck) {
        game.players.forEach((p, i) => {
            p.hand = deck.slice(i*13, (i+1)*13).sort((a,b) => {
                if (a.s === 'S' && b.s !== 'S') return -1;
                if (b.s === 'S' && a.s !== 'S') return 1;
                if (a.s !== b.s) return a.s.localeCompare(b.s);
                return b.r - a.r;
            });
            p.tricks = 0;
            p.bid = 0;
            if(game.round === 1) p.totalScore = 0;
        });
        
        game.status = 'BIDDING';
        game.turn = (game.dealer + 1) % 4;
    }

    static checkRedeal(game, seed = null) {
        const needsRedeal = game.players.some(p => {
            const hasSpade = p.hand.some(c => c.s === 'S');
            const hasFace = p.hand.some(c => c.r >= 11);
            return !hasSpade || !hasFace;
        });

        if (needsRedeal) {
            if (seed) {
                const newSeed = (BigInt(seed) + 1n).toString();
                console.log(`🔄 Redealing Web3 Game with derived seed`);
                return this.dealCardsDeterministic(game, newSeed);
            } else {
                return this.dealCards(game);
            }
        }
        return game;
    }

    // --- Gameplay Logic (Unchanged) ---

    static getValidMoves(hand, table) {
        if (table.length === 0) return hand.map((_, i) => i);
        const leadSuit = table[0].card.s;
        const followSuitCards = hand.filter(c => c.s === leadSuit);
        const spades = hand.filter(c => c.s === 'S');

        if (followSuitCards.length > 0) return hand.map((c, i) => c.s === leadSuit ? i : -1).filter(i => i !== -1);
        if (spades.length > 0) return hand.map((c, i) => c.s === 'S' ? i : -1).filter(i => i !== -1);
        return hand.map((_, i) => i);
    }

    static playMove(game, playerId, cardIndex) {
        const pIndex = game.players.findIndex(p => p.id === playerId);
        const player = game.players[pIndex];
        const card = player.hand[cardIndex];

        player.hand.splice(cardIndex, 1);
        game.table.push({ pIndex, card });
        
        if (game.table.length < 4) {
            game.turn = (game.turn + 1) % 4;
        }
        return game;
    }

    static calculateTrickWinner(table) {
        const leadSuit = table[0].card.s;
        let best = table[0];
        for (let i = 1; i < 4; i++) {
            const curr = table[i];
            const isSpade = curr.card.s === 'S';
            const bestIsSpade = best.card.s === 'S';

            if (isSpade && !bestIsSpade) best = curr;
            else if (isSpade && bestIsSpade && curr.card.r > best.card.r) best = curr;
            else if (!isSpade && !bestIsSpade && curr.card.s === leadSuit && curr.card.r > best.card.r) best = curr;
        }
        return best.pIndex;
    }

    static calculateScores(game) {
        let roundEntry = { round: game.round };
        game.players.forEach((p, i) => {
            let roundScore = 0;
            if (p.tricks < p.bid) roundScore = -p.bid;
            else roundScore = p.bid + (p.tricks - p.bid) * 0.1;
            
            p.totalScore = parseFloat(((p.totalScore || 0) + roundScore).toFixed(1));
            roundEntry[`p${i}`] = roundScore.toFixed(1);
        });
        game.scores.push(roundEntry);
    }
}

module.exports = CallBreakGame;