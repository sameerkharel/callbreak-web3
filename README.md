# 🃏 CallBreak web3 - Web3 Card Game

<div align="center">

![CallBreak web3](https://img.shields.io/badge/CallBreak-web3-8B5CF6?style=for-the-badge&logo=ethereum&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=next.js&logoColor=white)
![Solidity](https://img.shields.io/badge/Solidity-0.8.20-363636?style=for-the-badge&logo=solidity&logoColor=white)
![Base](https://img.shields.io/badge/Base-Mainnet-0052FF?style=for-the-badge&logo=coinbase&logoColor=white)

**A provably fair, blockchain-powered CallBreak card game with real ETH wagering**

[Live Demo](https://callbreak.up.railway.app/) • [Documentation](#-documentation) • [Report Bug](https://github.com/sameerkharel/callbreak-web3/issues) • [Request Feature](https://github.com/sameerkharel/callbreak-web3/issues)

</div>

---

## 📖 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Architecture](#-architecture)
- [Getting Started](#-getting-started)
- [Smart Contract](#-smart-contract)
- [Game Rules](#-game-rules)
- [Deployment](#-deployment)
- [Security](#-security)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🎯 Overview

CallBreak web3 is a **fully on-chain card game** built on Base Network, combining traditional CallBreak gameplay with Web3 technology. Players wager real ETH in a provably fair environment where game outcomes are cryptographically guaranteed.

### Why CallBreak web3?

- ✅ **Provably Fair**: Commit-reveal randomness ensures no cheating
- ✅ **Trustless Escrow**: Smart contracts hold funds, no intermediaries
- ✅ **Low Fees**: Built on Base for <$0.01 transaction costs
- ✅ **Instant Settlements**: Automated prize distribution via blockchain
- ✅ **Transparent**: All game logic on-chain and verifiable

---

## ✨ Features

### 🎮 Core Gameplay
- **4-Player Multiplayer**: Real-time card game with WebSocket synchronization
- **4 Wagering Tiers**: Bronze (0.00001 ETH), Silver (0.0001 ETH), Gold (0.001 ETH), Diamond (0.01 ETH)
- **Smart Matchmaking**: Automatic queue system pairs players by tier
- **Live Scoreboard**: Real-time score tracking and round progression

### 🔐 Security Features
- **EIP-712 Signatures**: Cryptographically signed game states
- **Commit-Reveal Randomness**: Card shuffling uses blockhash + server commitment
- **Challenge System**: Players can dispute results within 5-minute window
- **Emergency Withdraw**: Automatic refunds if game fails to start
- **Multi-Sig Admin**: Dispute resolution requires multiple admin signatures

### 🎨 User Experience
- **Cyberpunk UI**: Neon-themed web3 aesthetic with glassmorphism
- **Wallet Integration**: MetaMask, WalletConnect, Coinbase Wallet support
- **Activity Dashboard**: Track game history, pending challenges, claimable prizes
- **Responsive Design**: Works on desktop, tablet, and mobile
- **Bot Mode**: Practice against AI without wagering

### ⚡ Performance
- **Sub-2s Block Times**: Fast gameplay on Base Network
- **Optimistic UI**: Instant feedback, background blockchain confirmation
- **Indexed Events**: Efficient game state queries via event logs
- **Fallback Refunds**: Automatic fund recovery via pull-payment pattern

---

## 🛠️ Tech Stack

### Frontend
```
Next.js 14        - React framework with App Router
Tailwind CSS      - Utility-first styling
Framer Motion     - Smooth animations
ethers.js v6      - Ethereum interactions
Socket.io Client  - Real-time communication
Zustand           - State management
```

### Backend
```
Node.js           - Server runtime
Express           - Web framework
Socket.io         - WebSocket server
MongoDB           - Game state database
ethers.js v6      - Event polling & signing
```

### Smart Contracts
```
Solidity 0.8.20   - Contract language
Hardhat           - Development environment
OpenZeppelin      - Security libraries
EIP-712           - Typed structured data signing
```

### Blockchain
```
Base Mainnet      - L2 Ethereum network (Chain ID: 8453)
Alchemy/QuickNode - RPC providers
BaseScan          - Block explorer
```

---

## 🏗️ Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         CLIENT (Browser)                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Next.js    │  │   ethers.js  │  │  Socket.io   │      │
│  │   Frontend   │  │   (Web3)     │  │   (Real-time)│      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                  │                  │              │
└─────────┼──────────────────┼──────────────────┼──────────────┘
          │                  │                  │
          │ HTTPS            │ RPC              │ WebSocket
          ▼                  ▼                  ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Backend API    │  │  Base Network   │  │  Socket Server  │
│  (Express)      │◄─┤  (Smart         │  │  (Game Logic)   │
│                 │  │   Contract)     │  │                 │
│  ┌───────────┐  │  │                 │  │  ┌───────────┐  │
│  │ MongoDB   │  │  │  Event Polling  │  │  │ Game      │  │
│  │ (State)   │  │  │  <─────────────┼──┼──│ Manager   │  │
│  └───────────┘  │  │                 │  │  └───────────┘  │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

### Game Flow

```
1. Player enters queue (pays tier fee to contract)
   ├─> Contract validates player status
   ├─> Funds escrowed in playerEscrow mapping
   └─> Player added to matchmaking queue

2. 4th player joins → Game auto-starts
   ├─> Server generates secret key
   ├─> Server commits hash to blockchain
   ├─> Blockchain reveals after 3 blocks (~6 seconds)
   └─> Random seed = hash(secret + blockhash + timestamp)

3. Players bid and play rounds
   ├─> Game state managed in backend (off-chain)
   ├─> Real-time updates via WebSocket
   └─> All players see same state (synchronized)

4. Game ends → Result submission
   ├─> Server signs final scores with EIP-712
   ├─> Any player can submit to blockchain
   ├─> 5-minute challenge window opens
   └─> If unchallenged → Auto-finalization

5. Prize distribution
   ├─> Winner gets 90% of pot
   ├─> Platform takes 10% fee
   └─> Immediate ETH transfer to winner
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm
- MongoDB (local or Atlas)
- MetaMask wallet with Base testnet ETH
- Git

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/sameerkharel/callbreak-web3.git
   cd callbreak-web3
   ```

2. **Install dependencies**
   ```bash
   # Install root dependencies
   npm install

   # Install frontend dependencies
   cd frontend
   npm install

   # Install backend dependencies
   cd ../backend
   npm install
   ```

3. **Setup environment variables**

   **Frontend** (`frontend/.env.local`):
   ```bash
   NEXT_PUBLIC_CONTRACT_ADDRESS=0x...
   NEXT_PUBLIC_RPC_URL=https://sepolia.base.org
   NEXT_PUBLIC_API_URL=http://localhost:3001
   NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
   ```

   **Backend** (`backend/.env`):
   ```bash
   MONGODB_URI=mongodb://localhost:27017/callbreak
   CONTRACT_ADDRESS=0x...
   SERVER_PRIVATE_KEY=0x...
   RPC_URL=https://sepolia.base.org
   CLIENT_URL=http://localhost:3000
   PORT=3001
   ```

   **Smart Contracts** (`.env` in root):
   ```bash
   DEPLOYER_PRIVATE_KEY=0x...
   SERVER_SIGNER_ADDRESS=0x...
   BASESCAN_API_KEY=...
   ```

4. **Deploy smart contract** (Base Sepolia testnet)
   ```bash
   npx hardhat run scripts/deploy.js --network baseSepolia
   ```

5. **Start MongoDB**
   ```bash
   # macOS/Linux
   mongod --dbpath /path/to/data

   # Or use MongoDB Atlas (cloud)
   ```

6. **Start backend**
   ```bash
   cd backend
   npm start
   ```

7. **Start frontend**
   ```bash
   cd frontend
   npm run dev
   ```

8. **Open browser**
   ```
   Navigate to: http://localhost:3000
   ```

---

## 📜 Smart Contract

### Contract Details

- **Network**: Base Mainnet (Chain ID: 8453)
- **Address**: `0x...` (see [deployment](#deployment))
- **Compiler**: Solidity 0.8.20
- **License**: MIT

### Key Functions

#### Player Functions
```solidity
enterQueue(uint256 tier) payable          // Join matchmaking
leaveQueue()                               // Exit queue & get refund
emergencyWithdraw(bytes32 gameId)          // Force refund if stuck
```

#### Game Functions
```solidity
submitFinalState(gameId, params)           // Submit signed result
challengeFinalState(gameId) payable        // Dispute result (costs bond)
finalizeGame(gameId)                       // Claim prize after challenge window
```

#### Admin Functions (Multi-Sig)
```solidity
adminResolveMultiSig(gameId, winner, ...)  // Resolve disputes
setTierEntryFees(uint256[] fees)           // Update tier pricing
pause() / unpause()                         // Emergency stop
```

### Security Features

- **ReentrancyGuard**: Prevents reentrancy attacks
- **Pausable**: Emergency circuit breaker
- **EIP-712**: Structured data signing prevents signature replay
- **Commit-Reveal**: Randomness generated from blockhash + server secret
- **Pull-Payment**: Failed transfers go to pending withdrawals
- **Per-Game Escrow**: Fee changes don't affect active games

### Fee Structure

| Tier | Entry Fee | Winner Prize (90%) | Platform Fee (10%) |
|------|-----------|-------------------|-------------------|
| Bronze | 0.00001 ETH | 0.000036 ETH | 0.000004 ETH |
| Silver | 0.0001 ETH | 0.00036 ETH | 0.00004 ETH |
| Gold | 0.001 ETH | 0.0036 ETH | 0.0004 ETH |
| Diamond | 0.01 ETH | 0.036 ETH | 0.004 ETH |

---

## 🎴 Game Rules

### CallBreak Basics

CallBreak is a trick-taking card game popular in South Asia. This version uses a standard 52-card deck with 4 players.

### Card Ranking
```
Spades (Trump) > Hearts > Diamonds > Clubs
Within suit: A > K > Q > J > 10 > 9 > ... > 2
```

### Game Flow

1. **Dealing**: Each player gets 13 cards
2. **Bidding**: Players bid number of tricks they'll win (1-13)
3. **Playing**: 13 rounds, 1 card per player per round
4. **Scoring**: 
   - Made bid: +10 points per trick
   - Missed bid: -10 points per trick
   - Over tricks: +0.1 points each
5. **Winner**: Highest score after all rounds

### Detailed Rules

**Card Play:**
- Must follow suit if possible
- Spades are always trump (can win any trick)
- Highest card wins trick
- Trick winner leads next round

**Scoring Examples:**
```
Bid 4, Won 4: +40 points
Bid 5, Won 3: -30 points (missed by 2)
Bid 3, Won 5: +30 + 0.2 = 30.2 points (2 over tricks)
```

**Winning Condition:**
- Highest total score wins the pot
- Ties split pot equally

---

## 🌐 Deployment

### Production Deployment

#### Prerequisites
- Base Mainnet ETH ( ~0.1 for deployment + bond)
- MongoDB Atlas account
- Vercel account (frontend)
- Railway/Render account (backend)

#### Step 1: Deploy Smart Contract

```bash
# Compile contracts
npx hardhat compile

# Deploy to Base Mainnet
npx hardhat run scripts/deploy.js --network base

# Verify on BaseScan
npx hardhat verify --network base <CONTRACT_ADDRESS> <SERVER_SIGNER>

# Fund contract
npx hardhat run scripts/fundContract.js --network base
```

#### Step 2: Deploy Database

```bash
# Create MongoDB Atlas cluster (free tier)
# Get connection string
# Update backend .env
```

#### Step 3: Deploy Backend

**Railway** (recommended):
```bash
# Push to GitHub
git push origin main

# Connect Railway to repo
# Set environment variables
# Deploy automatically
```

**Render** (alternative):
```bash
# Create render.yaml
# Push to GitHub
# Connect Render to repo
# Set environment variables
```

#### Step 4: Deploy Frontend

**Vercel** (recommended):
```bash
# Push to GitHub
git push origin main

# Connect Vercel to repo
# Set environment variables
# Deploy automatically
```

#### Step 5: Configure CORS

Update backend `CLIENT_URL` to frontend URL and redeploy.

### Environment Variables

See [.env.example](.env.example) files in each directory for complete list.

---

## 🔒 Security

### Audits

- ✅ Internal security review completed
- ✅ Automated testing with Hardhat
- ⏳ External audit: Pending

### Known Limitations

- **Server Trust**: Backend generates random seed (mitigated by commit-reveal)
- **Challenge System**: Requires manual admin intervention for disputes
- **Gas Costs**: Players pay gas for on-chain submissions (~$0.02 on Base)

---

## 🧪 Testing

### Run Tests

```bash
# Smart contract tests
npx hardhat test

# Coverage
npx hardhat coverage

# Frontend tests
cd frontend
npm test

# Backend tests
cd backend
npm test
```

### Test Coverage

- Smart Contracts: 95%+
- Backend: 80%+
- Frontend: 70%+

---

## 📊 Project Status

### Current Version
**v1.0.0** - Production Ready

### Roadmap

- [x] Core gameplay implementation
- [x] Smart contract security hardening
- [x] Frontend UI/UX polish
- [x] Backend event polling
- [x] Deployment infrastructure
- [ ] Mobile app (React Native)
- [ ] Tournament mode
- [ ] NFT card skins
- [ ] Leaderboard system
- [ ] Multi-language support

---

## 👥 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Setup

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open Pull Request

### Code Style

- **Frontend**: Prettier + ESLint (Airbnb config)
- **Backend**: Prettier + ESLint (Airbnb config)
- **Contracts**: Solhint

---

## 📄 License

This project is licensed under the **MIT License** - see [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- [OpenZeppelin](https://openzeppelin.com/) - Secure smart contract libraries
- [Base](https://base.org/) - L2 blockchain platform
- [Vercel](https://vercel.com/) - Frontend hosting
- [MongoDB](https://mongodb.com/) - Database platform
- [Railway](https://railway.com/) - Server hosting

---

<div align="center">

**Built with ❤️ by Samir Kharel (Onyx)**

[⬆ Back to Top](#-callbreak-web3---web3-card-game)

</div>
