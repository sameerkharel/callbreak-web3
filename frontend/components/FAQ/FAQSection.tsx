'use client';
import { useState } from 'react';
import Link from 'next/link';

// --- DATA ---
interface FAQItem {
  question: string;
  answer: string;
  category: 'GAMEPLAY' | 'WEB3' | 'SECURITY' | 'GENERAL';
}

const faqData: FAQItem[] = [
  // ============================================
  // GAMEPLAY FAQS
  // ============================================
  {
    category: 'GAMEPLAY',
    question: 'How do I play Call Break?',
    answer: `**Call Break is a 4-player trick-taking card game.**

**Basic Rules:**
• Each player gets 13 cards
• Players bid how many tricks they think they'll win
• Spades are TRUMP cards (they beat all other suits)
• You must follow the lead suit if you have it
• If you can't follow suit, you can play a Spade to win
• If you can't follow suit and have no Spades, play any card

**Scoring:**
• Win your exact bid: +bid points (bid 3, win 3 = +3 points)
• Win more than bid: +bid + 0.1 per extra trick (bid 3, win 5 = +3.2 points)
• Fail to meet bid: Lose bid amount (bid 4, win 2 = -4 points)

**Example Round:**
Player bids 3 tricks, wins 5 tricks → Score: 3 + 0.2 = +3.2 points
Player bids 4 tricks, wins 2 tricks → Score: -4 points`
  },
  {
    category: 'GAMEPLAY',
    question: 'What are the game modes?',
    answer: `**We offer 3 different ways to play:**

**1. 🤖 Practice vs Bots**
• Free to play
• Offline mode
• Perfect for learning
• No real money

**2. 👥 Private Room (Web2)**
• Create rooms with friends
• Share room codes
• Free casual play
• No blockchain required

**3. 💎 Real Casino (Web3)**
• Stake real ETH on Base Network
• Provably fair gameplay
• On-chain results
• Win cryptocurrency
• Multiple tier levels: Silver (0.00001 ETH), Gold (0.0001 ETH), Diamond (0.001 ETH)`
  },
  {
    category: 'GAMEPLAY',
    question: 'How does bidding work?',
    answer: `**Bidding is your prediction of how many tricks you'll win.**

**Rules:**
• Bid range: 1-8 tricks
• You bid after seeing your cards
• Higher bids = higher risk/reward
• Consider your Spades (trump cards) carefully

**Strategy Tips:**
• Count your high Spades (Ace, King, Queen)
• Look for long suits (5+ cards of same suit)
• Don't overbid - it's safer to underbid slightly
• Each high Spade is usually worth 1 trick

**Example:**
Hand: A♠ K♠ Q♠ 5♠ 2♠ A♥ K♥ 10♦ 8♦ 6♣ 4♣ 3♣ 2♣
Good bid: 4-5 tricks (you have 3 strong Spades + 2 high cards)`
  },
  {
    category: 'GAMEPLAY',
    question: 'What happens if multiple people play Spades?',
    answer: `**When multiple players play Spades (trump cards), the HIGHEST Spade wins.**

**Example Hand:**
• Player 1: Leads with 10♥ (Heart)
• Player 2: Plays 5♠ (Spade - winning so far)
• Player 3: Plays K♠ (Higher Spade - now winning!)
• Player 4: Plays 2♠ (Still a Spade, but King is higher)

**Winner: Player 3 with K♠**

**Card Ranking (Highest to Lowest):**
Ace > King > Queen > Jack > 10 > 9 > 8 > 7 > 6 > 5 > 4 > 3 > 2

**Remember:**
• A♠ (Ace of Spades) is the strongest card in the game
• 2♠ (Two of Spades) beats any non-Spade card
• If no Spades are played, highest card of lead suit wins`
  },
  {
    category: 'GAMEPLAY',
    question: 'Can I play the same card as someone else?',
    answer: `**No, each card is unique in the deck.**

**The Deck:**
• 52 cards total (standard deck)
• 13 cards per suit (Spades ♠, Hearts ♥, Diamonds ♦, Clubs ♣)
• 4 players each get 13 cards
• No duplicates exist

**Example:**
If Player 1 plays A♠, no one else can play A♠ because there's only one in the deck.

**This means:**
• Once a high card is played, it's gone for that round
• Track which Spades have been played
• Adapt your strategy based on cards already seen`
  },

  // ============================================
  // WEB3 / CASINO FAQS
  // ============================================
  {
    category: 'WEB3',
    question: 'What is the Base Network and why do I need it?',
    answer: `**Base is a Layer 2 blockchain built by Coinbase.**

**Why Base?**
• ⚡ Lightning fast transactions (2-3 seconds)
• 💰 Super cheap gas fees (~$0.01 per transaction)
• 🔒 Secure and reliable (built on Ethereum)
• 🌍 Growing ecosystem with millions of users

**How to Switch:**
When you click "Real Casino", the app will automatically:
1. Detect you're on the wrong network
2. Ask to switch to Base Mainnet
3. Add Base to your wallet if needed
4. You just click "Approve"!

**Network Details:**
• Network Name: Base Mainnet
• Chain ID: 8453
• RPC URL: https://mainnet.base.org
• Explorer: https://basescan.org

**You MUST be on Base Mainnet to play Web3 games.** Games on other networks (Ethereum, Polygon, etc.) will not work.`
  },
  {
    category: 'WEB3',
    question: 'How much does it cost to play?',
    answer: `**Entry fees vary by tier:**

**💰 Tier Levels:**
• 🥈 Silver Pot: 0.00001 ETH (~$0.03)
• 🥇 Gold Pot: 0.0001 ETH (~$0.30)
• 💎 Diamond Pot: 0.001 ETH (~$3.00)

**Prize Pool:**
• Total Pot = Entry Fee × 4 players
• Winner gets: 90% of pot
• Platform fee: 10%

**Example (Gold Pot):**
4 players × 0.0001 ETH = 0.0004 ETH total
Winner receives: 0.00036 ETH
Platform fee: 0.00004 ETH

**Gas Fees:**
• Entry: ~$0.01
• Submit Result: ~$0.01
• Claim Prize: ~$0.01

**Total Cost to Play (Gold Pot):**
Entry (0.0001 ETH) + Gas (~$0.03) = ~$0.33 total`
  },
  {
    category: 'WEB3',
    question: 'What does "provably fair" mean?',
    answer: `**Provably fair means you can verify the game wasn't rigged.**

**How it Works:**
1. **Server Commits a Secret**
   • Before game starts, server generates a random secret
   • Server creates a "hash" of the secret (think: locked box)
   • Hash is stored on blockchain (tamper-proof)

2. **Blockchain Adds Randomness**
   • When 4 players join, a blockchain transaction triggers
   • Transaction includes unpredictable data (block hash, timestamp)
   • This gets mixed with the server's secret

3. **Cards are Dealt**
   • Combined randomness determines card shuffle
   • Same seed = same shuffle (deterministic)
   • Neither server nor players can predict it beforehand

**Why This is Fair:**
• Server can't see future block data
• Players can't influence block data
• Anyone can verify the shuffle after the game
• Code is open-source (you can audit it!)

**Verification:**
After game ends, you can:
1. Get the revealed secret from blockchain
2. Get the block hash from blockchain
3. Run the shuffle algorithm yourself
4. Confirm you got the exact same cards!`
  },
  {
    category: 'WEB3',
    question: 'Do I need a crypto wallet?',
    answer: `**Yes, you need a Web3 wallet to play Real Casino mode.**

**Recommended Wallets:**
• **MetaMask** (Most popular - Browser & Mobile)
• **Coinbase Wallet** (Easiest for beginners)
• **Rainbow Wallet** (Beautiful mobile app)
• **Rabby Wallet** (Advanced users)

**How to Get Started:**
1. Install MetaMask from https://metamask.io
2. Create a new wallet (save your seed phrase safely!)
3. Add some ETH to your wallet
4. Our app will auto-configure Base Network for you

**Security Tips:**
• NEVER share your seed phrase with anyone
• Save seed phrase offline (write it down)
• Use a hardware wallet for large amounts
• Always verify transaction details before signing

**Don't have crypto?**
You can buy ETH directly in MetaMask or Coinbase Wallet using a credit card!`
  },
  {
    category: 'WEB3',
    question: 'How do I get ETH on Base Network?',
    answer: `**3 ways to get ETH on Base:**

**Option 1: Bridge from Ethereum (Cheapest)**
1. Go to https://bridge.base.org
2. Connect your wallet
3. Enter amount of ETH to bridge
4. Confirm transaction
5. Wait 5-10 minutes
• Cost: ~$5-10 in Ethereum gas fees

**Option 2: Buy Directly on Base**
1. Use Coinbase Wallet or MetaMask
2. Click "Buy" → Select "ETH on Base"
3. Pay with credit/debit card
4. ETH arrives instantly
• Cost: ~3-5% fee

**Option 3: Transfer from Coinbase Exchange**
1. Buy ETH on Coinbase.com
2. Withdraw to Base Network
3. Paste your wallet address
4. Confirm withdrawal
• Cost: Free (Coinbase covers gas)

**How Much Do I Need?**
• Minimum: $5 worth of ETH
• Recommended: $20-50 for multiple games
• Remember: Most goes to entry fees, not gas!

**Pro Tip:** Base gas fees are ~$0.01, so $5 of ETH lasts for 100+ transactions!`
  },

  // ============================================
  // SECURITY FAQS
  // ============================================
  {
    category: 'SECURITY',
    question: 'Is my money safe?',
    answer: `**Yes! Your funds are protected by smart contracts.**

**Security Features:**
1. **Non-Custodial**
   • We NEVER hold your funds
   • Money goes directly to smart contract
   • Only you control your wallet

2. **Smart Contract Protection**
   • Code is audited and open-source
   • Funds locked in escrow during game
   • Automated payouts (no human intervention)

3. **Dispute Resolution**
   • 5-minute challenge window after each game
   • Multi-signature admin system for disputes
   • Emergency withdraw if server crashes

4. **Your Private Keys**
   • Only you have access to your wallet
   • We can't move your funds
   • Always verify transactions before signing

**What if the server goes down?**
After 1 hour of inactivity, anyone can trigger "Emergency Withdraw" to get their entry fee back.

**What if there's a dispute?**
Players can challenge results within 5 minutes. If challenged, admins review and resolve fairly.

**Bottom Line:** Your ETH is safer in our smart contract than in most centralized casinos!`
  },
  {
    category: 'SECURITY',
    question: 'What happens if the server crashes during my game?',
    answer: `**We have multiple safety nets:**

**Scenario 1: Server Crashes Before Game Starts**
• 5-minute timer activates
• Any player can trigger "Emergency Withdraw"
• Everyone gets their entry fee back automatically
• No losers, no winners

**Scenario 2: Server Crashes During Game**
• Game state is saved to database every move
• When you reload, "Recovery Mode" activates
• You can view the final score and submit result
• Other players can also submit if you don't

**Scenario 3: Server Crashes After Game Ends**
• Result is already signed and saved
• You can submit to blockchain from Activity page
• Anyone can submit (not just winner)
• Funds unlock as normal

**Emergency Withdraw:**
If game is stuck for 1 hour, ANYONE can call:
\`emergencyWithdraw(gameId)\`

This returns entry fees to all 4 players.

**You Are Never Stuck:**
• Maximum wait: 1 hour (emergency withdraw)
• Minimum wait: 5 minutes (ghost games)
• Recovery mode: Works even if server is offline
• Multiple submission: Any player can submit result

**Technical Details:**
• Game data stored on-chain AND in database
• Signatures are deterministic (server can recreate)
• Frontend polls blockchain every 3 seconds
• Automatic failover to backup RPC if primary fails`
  },
  {
    category: 'SECURITY',
    question: 'Can the game be rigged?',
    answer: `**No! Here's why it's impossible to rig:**

**1. Blockchain Randomness**
• Card shuffle uses future block data
• No one knows block hashes in advance
• Server commits BEFORE seeing randomness
• Changing the commit changes the hash (detected immediately)

**2. On-Chain Verification**
• All game results submitted to blockchain
• Signatures can't be forged (cryptographic proof)
• Anyone can verify the shuffle was correct
• Code is open-source (audit it yourself!)

**3. Multi-Player Validation**
• Any of the 4 players can submit result
• If server tries to cheat, players can challenge
• 5-minute dispute window per game
• Multi-sig admins resolve disputes (3+ required to act)

**4. Server Has No Incentive**
• Server earns 10% fee regardless of outcome
• Rigging would destroy reputation
• Server's bond can be slashed for cheating
• We want long-term success, not short-term scams

**How to Verify (Advanced Users):**
1. Get \`gameId\` from blockchain
2. Get \`randomSeed\` from blockchain  
3. Get \`serverSecret\` (revealed after game)
4. Run: \`shuffle(deck, hash(secret + seed))\`
5. Compare with cards you received

**If shuffle doesn't match → Server cheated → Report to admins → Server's bond gets slashed!**

But this has never happened because the cryptography makes cheating impossible without detection.`
  },
  {
    category: 'SECURITY',
    question: 'What is the 5-minute challenge window?',
    answer: `**A security feature to prevent fraud.**

**How It Works:**
1. Game ends → Winner (or anyone) submits result
2. Result is locked on blockchain
3. 5-minute timer starts
4. Other players can challenge if they disagree
5. If no challenge → Winner can claim after 5 mins

**Why This Exists:**
• Prevents false result submissions
• Gives players time to verify scores
• Protects against server manipulation
• Ensures fair play

**What Can You Challenge?**
• "Winner is wrong"
• "Scores are incorrect"  
• "Server signed wrong data"

**What Happens After Challenge?**
1. Game is frozen (no one can claim)
2. Admins review game transcript
3. Multi-sig vote determines real winner
4. Correct winner gets paid
5. False challenger loses their challenge bond

**Challenge Bond:**
• Cost: 0.001 ETH to challenge
• Protects against spam challenges
• Refunded if you're right
• Lost if you're wrong

**Example Timeline:**
• 2:00 PM - Game ends
• 2:01 PM - Winner submits result
• 2:01 PM - 5-minute timer starts
• 2:06 PM - Timer expires, winner can claim
• 2:07 PM - Winner clicks "Claim", receives funds

**Note:** If you submit correctly, no one will challenge. The 5-minute wait is just a safety buffer.`
  },

  // ============================================
  // GENERAL FAQS
  // ============================================
  {
    category: 'GENERAL',
    question: 'Is this legal?',
    answer: `**Our game operates in a legal gray area that varies by jurisdiction.**

**Key Points:**
• We are a skill-based game (not pure luck)
• Players compete against each other (not the house)
• Built on public blockchain (decentralized)
• No gambling license required in most jurisdictions

**Skill vs. Luck:**
Call Break involves:
• Strategic bidding
• Card counting
• Reading opponents
• Long-term skill advantage

This is why poker is legal in many places but slots are not.

**Our Stance:**
• We don't give legal advice
• Check your local laws
• You're responsible for compliance in your country
• We don't operate in restricted jurisdictions (US, UK, etc.)

**Age Requirement:**
• Must be 18+ everywhere
• Must be 21+ in some countries
• We verify age via wallet ownership (adults only)

**Disclaimer:** This is not legal advice. We're a technology platform, not a gambling operator.`
  },
  {
    category: 'GENERAL',
    question: 'Can I play on mobile?',
    answer: `**Yes! Both web and app versions work on mobile.**

**Web Version (All Devices):**
• Works in mobile browsers (Safari, Chrome, Brave)
• Responsive design (adapts to screen size)
• Works with MetaMask Mobile or Coinbase Wallet app
• No download required

**How to Play on Mobile:**
1. Open MetaMask or Coinbase Wallet app
2. Tap "Browser" tab
3. Navigate to our website
4. Connect wallet
5. Play!

**Native App (Coming Soon):**
• iOS App Store
• Google Play Store
• Push notifications
• Faster performance
• Offline practice mode

**Mobile Tips:**
• Use landscape mode for better view
• Close other apps to free RAM
• Strong WiFi recommended (not cellular)
• Card dragging works with finger swipes

**Supported Browsers:**
• ✅ Safari (iOS 14+)
• ✅ Chrome (Android 10+)
• ✅ Brave Browser
• ✅ MetaMask Browser
• ✅ Coinbase Wallet Browser
• ❌ Samsung Internet (Web3 limited)

**Performance:**
Works smoothly on:
• iPhone X and newer
• Android flagships (2020+)
• Tablets (iPad, Samsung Tab)

Budget phones may lag during card animations.`
  },
  {
    category: 'GENERAL',
    question: 'How do I contact support?',
    answer: `**We offer multiple support channels:**

**1. Discord Community (Fastest)**
• Join: https://discord.gg/callbreak
• Live chat with other players
• Staff online 12+ hours/day
• Share game IDs for help

**2. Email Support**
• Email: support@callbreakultimate.com
• Response time: 24-48 hours
• Include: Game ID, wallet address, screenshot

**3. Twitter/X**
• @CallBreakGame
• DM for urgent issues
• Follow for updates and announcements

**4. In-App Chat (Coming Soon)**
• Direct support tickets
• Attach game transcripts
• Track ticket status

**What to Include in Support Requests:**
• Your wallet address
• Game ID (if applicable)
• Transaction hash (if relevant)
• Screenshot of error
• What you were trying to do

**Common Issues We Can Help With:**
• Stuck transactions
• Disputed game results
• Lost funds due to bugs
• Account recovery
• Feature requests

**What We CAN'T Help With:**
• Lost seed phrases (we don't have access)
• Reversed transactions (blockchain is final)
• Bypassing age verification
• Legal advice

**Emergency Issues:**
If your funds are stuck and it's urgent, ping @admin in Discord with your game ID. We monitor for critical issues 24/7.`
  },
  {
    category: 'GENERAL',
    question: 'Are there tournaments or leaderboards?',
    answer: `**Coming soon! Here's what we're building:**

**What's Currently Available:**
• Track your own stats in Activity page
• See win/loss record
• Total earnings displayed
• Personal game history

Stay tuned! We're building the most competitive card game on Base! 🏆`
  },
  {
    category: 'GENERAL',
    question: 'What are the transaction fees (gas costs)?',
    answer: `**Gas fees on Base are VERY low:**

**Typical Costs:**
• Join Queue: $0.01 - $0.02
• Submit Result: $0.01 - $0.02  
• Claim Winnings: $0.01 - $0.02
• Emergency Withdraw: $0.02 - $0.03

**Total per Game: ~$0.03 - $0.06**

**Why So Cheap?**
Base is a Layer 2 scaling solution:
• 100x cheaper than Ethereum mainnet
• Transactions finalize in 2-3 seconds
• No congestion (fast even during peak times)

**When Are Fees Higher?**
• Network congestion (rare on Base)
• Complex transactions (multi-sig)
• During high market volatility

**Gas Price Tips:**
• Play during off-peak hours (midnight-6am UTC) for lowest fees
• MetaMask shows estimated fee before signing
• You can set custom gas limits (advanced)

**Can I Pay Fees in Tokens?**
No, gas must be paid in ETH on Base Network.

**How Much ETH Do I Need for Gas?**
• $5 of ETH = 100-150 games worth of gas
• $20 of ETH = 400-600 games worth of gas

**Compared to Other Chains:**
• Ethereum Mainnet: $5-50 per transaction ❌
• Polygon: $0.10-0.50 per transaction
• Base: $0.01-0.02 per transaction ✅
• Optimism: $0.05-0.10 per transaction

Base is one of the cheapest L2s available!`
  },
  {
    category: 'GENERAL',
    question: 'What happens if I disconnect during a game?',
    answer: `**Don't worry, we have auto-recovery systems!**

**Scenario 1: Disconnect During Gameplay**
• Game continues without you
• Server auto-plays your turn after 30 seconds
• Plays a random valid card
• You can rejoin anytime by refreshing

**Scenario 2: Disconnect After Game Ends**
• Game result is saved in database
• When you return, "Recovery Mode" activates
• Scoreboard shows automatically
• You can submit result to blockchain

**Scenario 3: Disconnect in Matchmaking**
• If disconnected during lobby, you're removed
• Entry fee is auto-refunded after 5 minutes
• You're free to rejoin queue

**How to Rejoin:**
1. Refresh the page
2. Click "Connect Wallet"
3. App detects your active game
4. You're automatically taken back to game

**What Gets Saved:**
• Your cards
• Current score
• Bids
• Game progress
• Final result (after game ends)

**What Doesn't Work After Disconnect:**
• Real-time updates (you'll see a static state)
• Turn timer (server auto-plays after 30s)
• Chat (if we add it)

**Best Practices:**
• Use stable WiFi
• Close other bandwidth-heavy apps
• Don't switch browser tabs during your turn
• Keep wallet unlocked

**Penalties for Disconnecting:**
• None! We understand internet issues happen
• Your cards are auto-played (might not be optimal)
• You can still win if your hand is strong

**If You're Having Connection Issues:**
Try these fixes:
1. Refresh the page
2. Switch to wired connection
3. Restart your browser
4. Clear cache and cookies
5. Try a different browser
6. Check if your VPN is interfering`
  }
];

// --- COMPONENT ---
interface FAQSectionProps {
  embedded?: boolean; // If true, hides the "Back to Game" header link
}

export default function FAQSection({ embedded = false }: FAQSectionProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const categories = [
    { id: 'ALL', label: 'All Topics', icon: '📚', color: 'blue' },
    { id: 'GAMEPLAY', label: 'How to Play', icon: '🎮', color: 'green' },
    { id: 'WEB3', label: 'Blockchain & Crypto', icon: '⛓️', color: 'purple' },
    { id: 'SECURITY', label: 'Safety & Security', icon: '🔒', color: 'yellow' },
    { id: 'GENERAL', label: 'General Info', icon: 'ℹ️', color: 'slate' }
  ];

  const filteredFAQs = faqData.filter(faq => {
    const matchesCategory = selectedCategory === 'ALL' || faq.category === selectedCategory;
    const matchesSearch = searchQuery === '' || 
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const renderAnswer = (text: string) => {
    return text.split('\n').map((line, i) => {
        if (line.trim().startsWith('**') && line.trim().endsWith('**')) {
            return <h4 key={i} className="font-bold text-white mt-4 mb-2 text-lg">{line.replace(/\*\*/g, '')}</h4>
        }
        const parts = line.split(/(\*\*.*?\*\*)/g);
        return (
            <div key={i} className={`mb-1 ${line.trim().startsWith('•') || line.trim().match(/^\d+\./) ? 'pl-4' : ''}`}>
                {parts.map((part, j) => {
                    if (part.startsWith('**') && part.endsWith('**')) {
                        return <strong key={j} className="text-white">{part.replace(/\*\*/g, '')}</strong>
                    }
                    return part;
                })}
            </div>
        )
    });
  };

  return (
    <div className={`text-white relative overflow-hidden ${!embedded ? 'min-h-screen' : 'w-full'}`}
      style={!embedded ? { background: 'radial-gradient(ellipse at top, #1e293b 0%, #0f172a 50%, #020617 100%)' } : {}}>
      
      {/* Background Particles (Only if full page) */}
      {!embedded && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(20)].map((_, i) => (
            <div key={i} className="absolute rounded-full blur-xl"
              style={{
                width: `${30 + Math.random() * 80}px`,
                height: `${30 + Math.random() * 80}px`,
                background: `radial-gradient(circle, rgba(59,130,246,${0.1 + Math.random() * 0.1}) 0%, transparent 70%)`,
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animation: `float ${10 + Math.random() * 20}s ease-in-out infinite`,
                animationDelay: `${Math.random() * 5}s`
              }}
            />
          ))}
        </div>
      )}

      {/* Header Section */}
      <div className="relative z-10 border-b border-white/10"
        style={!embedded ? { background: 'linear-gradient(180deg, rgba(0,0,0,0.5) 0%, transparent 100%)', backdropFilter: 'blur(10px)' } : { border: 'none' }}>
        <div className={`max-w-6xl mx-auto px-6 ${embedded ? 'py-0 mb-6' : 'py-8'}`}>
          {!embedded && (
            <Link href="/" className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 mb-6 transition-colors group">
                <svg className="w-5 h-5 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                <span className="font-bold">Back to Game</span>
            </Link>
          )}
          
          <h1 className="text-5xl md:text-6xl font-black mb-4 tracking-wider"
            style={{
              fontFamily: 'Orbitron, monospace',
              background: 'linear-gradient(135deg, #60a5fa 0%, #a78bfa 50%, #ec4899 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 0 30px rgba(96,165,250,0.5))'
            }}>
            📚 HELP CENTER
          </h1>
          {!embedded && (
            <p className="text-slate-400 text-lg max-w-2xl">
                Everything you need to know about Call Break Ultimate.
            </p>
          )}
        </div>
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-6 pb-12">
        {/* Search Bar with Clear Button */}
        <div className="mb-8">
          <div className="relative max-w-2xl mx-auto">
            <input
              type="text"
              placeholder="Search topics..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-6 py-4 pl-14 rounded-2xl text-lg transition-all focus:scale-[1.02]"
              style={{
                background: 'rgba(30,41,59,0.8)',
                border: '2px solid rgba(59,130,246,0.3)',
                color: '#e2e8f0',
                fontFamily: 'system-ui',
                outline: 'none',
                backdropFilter: 'blur(10px)'
              }}
            />
            
            {/* Search Icon */}
            <svg className="absolute left-5 top-1/2 -translate-y-1/2 w-6 h-6 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            
            {/* Clear Button (Issue #2 Fixed) */}
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                aria-label="Clear search"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Category Filters */}
        <div className="flex flex-wrap gap-3 justify-center mb-12">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className="px-6 py-3 rounded-xl font-bold transition-all transform hover:scale-105 flex items-center gap-2"
              style={{
                background: selectedCategory === cat.id 
                  ? `linear-gradient(135deg, rgba(59,130,246,0.4) 0%, rgba(147,197,253,0.2) 100%)`
                  : 'rgba(30,41,59,0.6)',
                border: selectedCategory === cat.id 
                  ? '2px solid rgba(59,130,246,0.8)'
                  : '1px solid rgba(71,85,105,0.3)',
                color: selectedCategory === cat.id ? '#93c5fd' : '#cbd5e1',
                fontFamily: 'Orbitron, monospace',
                fontSize: '0.9rem',
                boxShadow: selectedCategory === cat.id ? '0 0 20px rgba(59,130,246,0.3)' : 'none'
              }}
            >
              <span className="text-xl">{cat.icon}</span>
              <span>{cat.label}</span>
            </button>
          ))}
        </div>

        {/* FAQ Accordion with No Results State (Issue #3 Fixed) */}
        {filteredFAQs.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4 opacity-30">🔍</div>
            <h3 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: 'Orbitron, monospace' }}>
              No Results Found
            </h3>
            <p className="text-slate-400 mb-6">
              Try a different search term or browse by category.
            </p>
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('ALL');
              }}
              className="px-6 py-3 rounded-xl font-bold bg-blue-600 hover:bg-blue-500 transition-colors"
              style={{ fontFamily: 'Orbitron, monospace' }}
            >
              Clear Filters
            </button>
          </div>
        ) : (
          <div className="space-y-4 max-w-4xl mx-auto">
            {filteredFAQs.map((faq, index) => {
              const isExpanded = expandedIndex === index;
              return (
                <div key={index} className="rounded-2xl overflow-hidden transition-all duration-300"
                  style={{
                    background: isExpanded ? 'linear-gradient(135deg, rgba(30,41,59,0.95) 0%, rgba(15,23,42,0.98) 100%)' : 'rgba(30,41,59,0.6)',
                    border: isExpanded ? '2px solid rgba(59,130,246,0.5)' : '1px solid rgba(71,85,105,0.3)'
                  }}>
                  <button onClick={() => setExpandedIndex(isExpanded ? null : index)}
                    className="w-full px-6 py-5 flex items-center justify-between gap-4 text-left group">
                    <div className="flex-1">
                        <h3 className="text-lg md:text-xl font-bold text-white group-hover:text-blue-300 transition-colors"
                          style={{ fontFamily: 'Orbitron, monospace' }}>
                          {faq.question}
                        </h3>
                    </div>
                    <div className="flex-shrink-0">
                      <svg className={`w-6 h-6 text-blue-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>

                  <div className="overflow-hidden transition-all duration-300"
                    style={{ maxHeight: isExpanded ? '2000px' : '0', opacity: isExpanded ? 1 : 0 }}>
                    <div className="px-6 pb-6 pt-2">
                      <div className="pl-14 pr-10">
                        <div className="text-slate-300 leading-relaxed text-lg">
                          {renderAnswer(faq.answer)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      
      {!embedded && <style jsx>{`@keyframes float { 0%, 100% { transform: translateY(0) translateX(0); } 50% { transform: translateY(-10px) translateX(-10px); } }`}</style>}
    </div>
  );
}