'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Web3Service from '@/services/Web3Service';
import { useUI } from '@/context/UIContext';

export default function ActivityPage() {
    const ui = useUI();
    const [history, setHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionId, setActionId] = useState<string | null>(null);
    const [timers, setTimers] = useState<{ [key: string]: { text: string; canClaim: boolean } }>({});
    const [myAddress, setMyAddress] = useState("");

    useEffect(() => {
        loadData();
        const interval = setInterval(updateTimers, 1000);
        return () => clearInterval(interval);
    }, []);

    const loadData = async () => {
        if (typeof window !== 'undefined' && window.ethereum) {
            try {
                const address = await Web3Service.connect();
                setMyAddress(address);
                const data = await Web3Service.fetchUserActivity(address);
                
                // Enrich with blockchain status
                const updatedData = await Promise.all(data.map(async (game: any) => {
                    if (game.roomId) {
                        try {
                            const chainStatus = await Web3Service.getGameStatus(game.roomId);
                            if (chainStatus && chainStatus.finalSubmitted) {
                                return { ...game, chainStatus, isOnChain: true };
                            }
                        } catch (error) {
                            // Not on chain yet
                        }
                    }
                    return { ...game, isOnChain: false };
                }));

                setHistory(updatedData.filter(game => game.roomId).reverse());
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        }
    };

    const updateTimers = () => {
        setHistory(prevHistory => {
            const newTimers: { [key: string]: { text: string; canClaim: boolean } } = {};
            
            prevHistory.forEach(game => {
                // Default state
                let timerText = "SYNCING...";
                let canClaim = false;

                if (!game.isOnChain) {
                    // Not submitted to blockchain yet
                    timerText = "PENDING SUBMISSION";
                    canClaim = false;
                } else if (game.chainStatus) {
                    const now = Math.floor(Date.now() / 1000);
                    const challengeEnds = Number(game.chainStatus.challengeWindowEnds);
                    
                    if (game.chainStatus.isSettled) {
                        timerText = "PAID OUT";
                        canClaim = false;
                    } else if (challengeEnds > now) {
                        // Challenge window still active
                        const diff = challengeEnds - now;
                        const m = Math.floor(diff / 60);
                        const s = diff % 60;
                        timerText = `Unlocks in ${m}m ${s}s`;
                        canClaim = false;
                    } else {
                        // Challenge window passed, ready to claim
                        timerText = "READY TO CLAIM";
                        canClaim = true;
                    }
                }

                newTimers[game.roomId] = { text: timerText, canClaim };
            });
            
            setTimers(newTimers);
            return prevHistory;
        });
    };

    const handleSubmit = async (game: any) => {
        if (!game.result || !game.result.signature) {
            ui.showError("Error", "Missing game signature.");
            return;
        }
        setActionId(game.roomId);
        try {
            // ============================================================
            // 🚨 CRITICAL FIX: PREVENT DOUBLE SCALING
            // ============================================================
            // 1. The DB stores scores as INTEGERS (e.g., 32 for 3.2)
            // 2. Web3Service.submitResult expects FLOATS/STRINGS and multiplies by 10
            // 3. We must divide by 10 here so Web3Service doesn't double-scale it to 320
            
            const payload = { ...game.result };
            
            // Convert [32, 51, -5] -> ["3.2", "5.1", "-0.5"]
            // This ensures Web3Service receives what it expects
            payload.scores = game.result.scores.map((s: any) => (Number(s) / 10).toString());

            await Web3Service.submitResult(game.roomId, payload);
            
            ui.showSuccess("Success!", "Result submitted to blockchain! Wait 5 minutes to claim.");
            setTimeout(() => loadData(), 2000);
        } catch (e: any) {
            if (e.message?.includes("Submitted") || e.message?.includes("0xbaa6adbd")) {
                ui.showSuccess("Already Submitted", "Result is already on chain!");
                setTimeout(() => loadData(), 2000);
            } else {
                ui.showError("Failed", e.message);
            }
        } finally {
            setActionId(null);
        }
    };

    const handleFinalize = async (gameId: string, type: 'CLAIM' | 'UNLOCK') => {
        setActionId(gameId);
        try {
            await Web3Service.finalizeGame(gameId);
            if (type === 'CLAIM') {
                ui.showSuccess("🎉 Success!", "Winnings transferred to your wallet!");
            } else {
                ui.showSuccess("✅ Unlocked!", "Table unlocked. You can join new games now.");
            }
            // Refresh to show "PAID OUT" status
            setTimeout(() => loadData(), 2000);
        } catch (e: any) {
            if (e.message?.includes("Wait window") || e.message?.includes("0x5bb5f22c")) {
                ui.showError("Too Early", "Challenge window not finished yet. Please wait.");
            } else if (e.message?.includes("Settled") || e.message?.includes("0x8f9195fb")) {
                ui.showSuccess("Already Claimed", "This game was already finalized!");
                setTimeout(() => loadData(), 2000);
            } else {
                ui.showError("Failed", e.message);
            }
        } finally {
            setActionId(null);
        }
    };

    // ✅ FIXED: Robust Score Formatter
    const formatScore = (score: number | undefined): string => {
        if (score === undefined || score === null) return '-';
        const numScore = Number(score);
        if (isNaN(numScore)) return '-';
        
        // Since DB stores integers (e.g. 32), we MUST divide by 10 for display
        return (numScore / 10).toFixed(1); 
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center text-white relative overflow-hidden"
              style={{ background: 'radial-gradient(ellipse at center, #0f172a 0%, #020617 100%)' }}>
                <div className="text-center">
                    <div className="w-20 h-20 border-4 rounded-full mb-6 mx-auto"
                      style={{ borderColor: '#3b82f6', borderTopColor: 'transparent', animation: 'spin 1s linear infinite', boxShadow: '0 0 40px rgba(59,130,246,0.6)' }} />
                    <p className="text-xl font-bold tracking-wide" style={{ fontFamily: 'Orbitron, monospace' }}>Loading Activity...</p>
                </div>
                <style jsx>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    return (
        <div className="min-h-screen p-4 text-white relative overflow-hidden"
          style={{ background: 'radial-gradient(ellipse at top, #0f172a 0%, #020617 100%)' }}>
          
          {/* Animated background particles */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="absolute rounded-full blur-3xl"
                style={{
                  width: `${100 + Math.random() * 200}px`,
                  height: `${100 + Math.random() * 200}px`,
                  background: `radial-gradient(circle, rgba(16,185,129,${0.05 + Math.random() * 0.1}) 0%, transparent 70%)`,
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  animation: `float ${8 + Math.random() * 8}s ease-in-out infinite`,
                  animationDelay: `${Math.random() * 5}s`
                }}
              />
            ))}
          </div>

          <div className="max-w-3xl mx-auto relative z-10">
            {/* Header */}
            <div className="flex justify-between items-center mb-10">
                <h1 className="text-5xl font-black tracking-wider"
                  style={{ 
                    fontFamily: 'Orbitron, monospace', 
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', 
                    WebkitBackgroundClip: 'text', 
                    WebkitTextFillColor: 'transparent', 
                    filter: 'drop-shadow(0 0 20px rgba(16,185,129,0.5))' 
                  }}>
                  YOUR ACTIVITY
                </h1>
                <Link href="/" className="px-6 py-3 rounded-xl font-bold uppercase tracking-wide transition-colors hover:bg-slate-700/50"
                  style={{ 
                    background: 'linear-gradient(135deg, rgba(30,41,59,0.8) 0%, rgba(15,23,42,0.9) 100%)', 
                    border: '1px solid rgba(71,85,105,0.4)', 
                    fontFamily: 'Orbitron, monospace', 
                    fontSize: '0.9rem' 
                  }}>
                  ← BACK
                </Link>
            </div>

            {/* Game List */}
            <div className="space-y-6">
                {history.length === 0 && (
                    <div className="text-center py-20">
                        <div className="text-6xl mb-4 opacity-30">🎴</div>
                        <div className="text-slate-500 text-lg">No games played yet.</div>
                        <Link href="/" className="mt-6 inline-block px-6 py-3 rounded-xl font-bold uppercase"
                          style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', fontFamily: 'Orbitron, monospace' }}>
                          PLAY YOUR FIRST GAME
                        </Link>
                    </div>
                )}
                
                {history.map((game, index) => {
                    const isWinner = game.result && game.result.winnerAddress && 
                                   (game.result.winnerAddress.toLowerCase() === myAddress.toLowerCase());
                    const timer = timers[game.roomId] || { text: "LOADING...", canClaim: false };
                    const isProcessing = actionId === game.roomId;
                    const isSettled = game.chainStatus && game.chainStatus.isSettled;

                    return (
                    <div key={game.roomId || `game-${index}`} 
                         className="p-6 rounded-3xl relative overflow-hidden group transition-all duration-300 hover:scale-[1.02]"
                         style={{ 
                           background: 'linear-gradient(135deg, rgba(30,41,59,0.8) 0%, rgba(15,23,42,0.9) 100%)', 
                           border: '1px solid rgba(71,85,105,0.3)', 
                           boxShadow: '0 8px 32px rgba(0,0,0,0.6)' 
                         }}>
                        
                        {/* Hover effect */}
                        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                          style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.1) 0%, transparent 100%)' }} />

                        {/* Status Badge */}
                        <div className="absolute top-0 right-0 p-2">
                            {isSettled ? (
                                <span className="px-4 py-2 rounded-bl-2xl font-bold text-xs uppercase tracking-wider flex items-center gap-2"
                                  style={{ 
                                    background: 'linear-gradient(135deg, rgba(16,185,129,0.3) 0%, rgba(5,150,105,0.5) 100%)', 
                                    color: '#6ee7b7', 
                                    border: '1px solid rgba(52,211,153,0.4)', 
                                    fontFamily: 'Orbitron, monospace' 
                                  }}>
                                  <span>✅</span> PAID OUT
                                </span>
                            ) : (
                                <span className="px-4 py-2 rounded-bl-2xl font-bold text-xs uppercase tracking-wider animate-pulse flex items-center gap-2"
                                  style={{ 
                                    background: game.isOnChain 
                                      ? 'linear-gradient(135deg, rgba(59,130,246,0.3) 0%, rgba(37,99,235,0.5) 100%)'
                                      : 'linear-gradient(135deg, rgba(251,191,36,0.3) 0%, rgba(245,158,11,0.5) 100%)', 
                                    color: game.isOnChain ? '#93c5fd' : '#fcd34d', 
                                    border: game.isOnChain ? '1px solid rgba(96,165,250,0.4)' : '1px solid rgba(251,191,36,0.4)', 
                                    fontFamily: 'Orbitron, monospace' 
                                  }}>
                                  <span>{game.isOnChain ? '⛓️' : '⏳'}</span>
                                  {game.isOnChain ? "ON CHAIN" : "PENDING"}
                                </span>
                            )}
                        </div>

                        {/* Game Info */}
                        <div className="relative flex justify-between items-start mb-6 mt-8">
                            <div>
                                <div className="text-xs font-mono mb-2 px-3 py-1 rounded-lg inline-block"
                                  style={{ background: 'rgba(0,0,0,0.4)', color: '#94a3b8' }}>
                                  ID: {game.roomId ? game.roomId.slice(0, 10) : 'N/A'}...
                                </div>
                                <div className="font-bold text-xl mb-1" style={{ fontFamily: 'Orbitron, monospace', color: '#e2e8f0' }}>
                                  {new Date(game.endedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} 
                                  {' • '}
                                  {new Date(game.endedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                </div>
                                <div className="flex items-center gap-3 text-sm" style={{ color: '#94a3b8' }}>
                                  <span className="flex items-center gap-1">
                                    {game.tier === 0 && '🥈'}
                                    {game.tier === 1 && '🥇'}
                                    {game.tier === 2 && '💎'}
                                    Tier {game.tier || 0}
                                  </span>
                                  <span>•</span>
                                  <span>4 Players</span>
                                </div>
                            </div>
                        </div>

                        {/* Scores Grid */}
                        <div className="p-4 rounded-2xl mb-6 grid grid-cols-4 gap-3 text-center"
                          style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(71,85,105,0.2)' }}>
                            {game.players.map((p: any, i: number) => {
                                const pWinner = game.result && p.walletAddress === game.result.winnerAddress;
                                // ✅ FIXED: Use the formatScore helper
                                const displayScore = formatScore(p.score);
                                
                                return (
                                    <div key={i} className="flex flex-col">
                                        <span className="text-xs truncate w-full mb-1"
                                          style={{ 
                                            color: pWinner ? '#fbbf24' : '#94a3b8', 
                                            fontFamily: 'Orbitron, monospace', 
                                            fontWeight: pWinner ? 'bold' : 'normal' 
                                          }}>
                                          {p.nickname || 'Player'} {pWinner && ' 👑'}
                                        </span>
                                        <span className="text-2xl font-black"
                                          style={{ 
                                            fontFamily: 'Orbitron, monospace', 
                                            color: pWinner ? '#fcd34d' : '#cbd5e1' 
                                          }}>
                                          {displayScore}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>

                        {/* ACTION AREA */}
                        {!isSettled && (
                            <div className="space-y-3">
                                {/* Case 1: Not submitted to blockchain yet */}
                                {!game.isOnChain ? (
                                    <>
                                        {isWinner ? (
                                            <button 
                                                onClick={() => handleSubmit(game)}
                                                disabled={isProcessing}
                                                className="w-full py-4 rounded-2xl font-black text-lg uppercase tracking-wider transition-all"
                                                style={{ 
                                                  fontFamily: 'Orbitron, monospace', 
                                                  background: isProcessing 
                                                    ? 'linear-gradient(135deg, #475569 0%, #334155 100%)'
                                                    : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', 
                                                  border: '2px solid #fbbf24', 
                                                  boxShadow: isProcessing ? 'none' : '0 0 40px rgba(245,158,11,0.5)',
                                                  cursor: isProcessing ? 'wait' : 'pointer',
                                                  opacity: isProcessing ? 0.7 : 1
                                                }}>
                                                {isProcessing ? '⏳ SUBMITTING...' : '🚀 SUBMIT RESULT TO CHAIN'}
                                            </button>
                                        ) : (
                                            <div className="w-full py-4 rounded-2xl text-center flex items-center justify-center gap-2" 
                                                 style={{ background: 'rgba(0,0,0,0.3)', color: '#94a3b8', border: '1px solid rgba(71,85,105,0.3)' }}>
                                                <div className="w-4 h-4 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin"></div>
                                                <span>Waiting for winner to submit...</span>
                                            </div>
                                        )}
                                        <p className="text-xs text-center text-slate-500">
                                            Result must be submitted to blockchain before claiming funds
                                        </p>
                                    </>
                                ) : (
                                    // Case 2: On blockchain - show timer or claim button
                                    <>
                                        {timer.canClaim ? (
                                            // Ready to claim/unlock
                                            <>
                                                {isWinner ? (
                                                    <button 
                                                        onClick={() => handleFinalize(game.roomId, 'CLAIM')}
                                                        disabled={isProcessing}
                                                        className="w-full py-4 rounded-2xl font-black text-lg uppercase tracking-wider transition-all"
                                                        style={{ 
                                                          fontFamily: 'Orbitron, monospace', 
                                                          background: isProcessing
                                                            ? 'linear-gradient(135deg, #475569 0%, #334155 100%)'
                                                            : 'linear-gradient(135deg, #10b981 0%, #059669 100%)', 
                                                          border: '2px solid #34d399', 
                                                          boxShadow: isProcessing ? 'none' : '0 0 40px rgba(16,185,129,0.5)',
                                                          cursor: isProcessing ? 'wait' : 'pointer',
                                                          opacity: isProcessing ? 0.7 : 1
                                                        }}>
                                                        {isProcessing ? '⏳ CLAIMING...' : '💰 CLAIM WINNINGS'}
                                                    </button>
                                                ) : (
                                                    <button 
                                                        onClick={() => handleFinalize(game.roomId, 'UNLOCK')}
                                                        disabled={isProcessing}
                                                        className="w-full py-4 rounded-2xl font-black text-lg uppercase tracking-wider transition-all"
                                                        style={{ 
                                                          fontFamily: 'Orbitron, monospace', 
                                                          background: isProcessing
                                                            ? 'linear-gradient(135deg, #374151 0%, #1f2937 100%)'
                                                            : 'linear-gradient(135deg, #475569 0%, #334155 100%)', 
                                                          border: '2px solid #94a3b8',
                                                          cursor: isProcessing ? 'wait' : 'pointer',
                                                          opacity: isProcessing ? 0.7 : 1
                                                        }}>
                                                        {isProcessing ? '⏳ UNLOCKING...' : '🔓 FORCE UNLOCK TABLE'}
                                                    </button>
                                                )}
                                                <p className="text-xs text-center text-emerald-400 font-bold">
                                                    ✅ Challenge window passed • {isWinner ? 'Ready to claim' : 'Can unlock now'}
                                                </p>
                                            </>
                                        ) : (
                                            // Still in challenge window
                                            <>
                                                <div className="w-full py-4 rounded-2xl text-center flex items-center justify-center gap-3"
                                                    style={{ 
                                                      background: 'rgba(71,85,105,0.4)', 
                                                      border: '1px solid rgba(100,116,139,0.3)', 
                                                      color: '#cbd5e1', 
                                                      fontFamily: 'Orbitron, monospace', 
                                                      fontWeight: 'bold' 
                                                    }}>
                                                    <span className="text-xl">⏳</span>
                                                    <span>{timer.text}</span>
                                                </div>
                                                <p className="text-xs text-center text-slate-500">
                                                    5-minute security window • {isWinner ? 'Funds will be available after timer' : 'Wait for timer to unlock'}
                                                </p>
                                            </>
                                        )}
                                    </>
                                )}
                            </div>
                        )}

                        {/* Already settled - show confirmation */}
                        {isSettled && (
                            <div className="p-4 rounded-2xl text-center"
                                 style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(52,211,153,0.3)' }}>
                                <p className="text-emerald-300 font-bold mb-1" style={{ fontFamily: 'Orbitron, monospace' }}>
                                    ✅ GAME SETTLED
                                </p>
                                <p className="text-xs text-emerald-400/70">
                                    {isWinner ? 'Funds transferred to your wallet' : 'Game finalized on blockchain'}
                                </p>
                            </div>
                        )}
                    </div>
                    );
                })}
            </div>
          </div>
          
          <style jsx>{`
            @keyframes float { 
              0%, 100% { transform: translateY(0) scale(1); } 
              25% { transform: translateY(-30px) scale(1.05); } 
              50% { transform: translateY(-10px) scale(0.95); } 
              75% { transform: translateY(-40px) scale(1.02); } 
            }
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>
    );
}