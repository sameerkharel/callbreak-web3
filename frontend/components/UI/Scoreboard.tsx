'use client';
import React, { useState, useEffect } from 'react';

interface ScoreboardProps {
    scores: any[];
    players: any[];
    onClose: () => void;
    gameResultData?: any;
    onSubmitToChain?: () => void;
    onRequeue: () => void;
    onExit: () => void;
    currentUserId: string;
}

const Scoreboard = ({ 
    scores, 
    players, 
    onClose, 
    gameResultData, 
    onSubmitToChain,
    onRequeue,
    onExit,
    currentUserId
}: ScoreboardProps) => {
    const [isProcessing, setIsProcessing] = useState(false);
    
    // ✅ NEW LOGIC: Timer to allow non-winners to submit after 10s
    const [canAnyoneSubmit, setCanAnyoneSubmit] = useState(false);
    const [timeUntilOpen, setTimeUntilOpen] = useState(10);

    // Check if game is technically over (data present OR max rounds reached)
    const isGameOver = !!gameResultData || (scores.length >= 3); // Assuming 3 is max rounds, adjusted logic
    
    const winnerIndex = players.reduce((iMax, x, i, arr) => x.totalScore > arr[iMax].totalScore ? i : iMax, 0);
    const winner = players[winnerIndex];
    const isMeWinner = winner.id === currentUserId;

    // Is this a Web3 game that requires submission?
    const isWeb3Game = !!gameResultData && !!gameResultData.signature;
    
    // Has the result been submitted to blockchain yet?
    const isSubmitted = gameResultData?.isSubmitted;

    // ✅ TIMER LOGIC: Count down 10s for non-winners
    useEffect(() => {
        if (!isWeb3Game || isSubmitted || !isGameOver) return;
        
        // If I am the winner, I can submit immediately (no timer needed)
        if (isMeWinner) {
             setCanAnyoneSubmit(true);
             return;
        }

        const interval = setInterval(() => {
            setTimeUntilOpen((prev) => {
                if (prev <= 1) {
                    setCanAnyoneSubmit(true);
                    clearInterval(interval);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        
        return () => clearInterval(interval);
    }, [isWeb3Game, isSubmitted, isMeWinner, isGameOver]);

    const handleSubmit = async () => {
        if (!onSubmitToChain) return;
        setIsProcessing(true);
        try {
            await onSubmitToChain();
        } catch (e) {
            console.error(e);
        } finally {
            setIsProcessing(false);
        }
    };

    // Determine if THIS user can see the submit button
    const showSubmitButton = !isSubmitted && (isMeWinner || canAnyoneSubmit);
    const formatScore = (score: number | string | undefined): string => {
        if (score === undefined || score === null) return '-';
        const numScore = Number(score);
        if (isNaN(numScore)) return '-';
        return numScore.toFixed(1);
    };

    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.98) 100%)',
            backdropFilter: 'blur(10px)'
          }}>
          
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="absolute rounded-full blur-3xl"
                style={{
                  width: `${100 + Math.random() * 200}px`,
                  height: `${100 + Math.random() * 200}px`,
                  background: isGameOver && isMeWinner 
                    ? `radial-gradient(circle, rgba(234,179,8,${0.1 + Math.random() * 0.1}) 0%, transparent 70%)`
                    : `radial-gradient(circle, rgba(59,130,246,${0.1 + Math.random() * 0.1}) 0%, transparent 70%)`,
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  animation: `float ${5 + Math.random() * 5}s ease-in-out infinite`,
                  animationDelay: `${Math.random() * 3}s`
                }}
              />
            ))}
          </div>

          <div className="relative w-full max-w-4xl animate-scale-in">
            <div className="relative rounded-3xl overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, rgba(15,23,42,0.9) 0%, rgba(30,41,59,0.8) 100%)',
                border: '1px solid rgba(148,163,184,0.1)',
                boxShadow: `
                  0 0 0 1px rgba(148,163,184,0.05), 
                  0 20px 60px rgba(0,0,0,0.8),
                  inset 0 1px 0 rgba(255,255,255,0.05)
                `
              }}>
              
              {/* LOCK STATUS BADGE (Only content changed, style matches your theme) */}
              {isWeb3Game && (
                  <div className={`absolute top-0 left-0 right-0 py-1 z-20 border-b ${isSubmitted ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-blue-500/10 border-blue-500/20'}`}>
                    <p className={`text-[10px] font-mono tracking-[0.2em] uppercase flex items-center justify-center gap-2 ${isSubmitted ? 'text-emerald-300' : 'text-blue-200'}`}>
                      {isSubmitted ? (
                          <><span>✅</span> RESULT ON CHAIN • TABLE UNLOCKED</>
                      ) : (
                          <><span>🔒</span> VERIFICATION REQUIRED • SUBMIT TO UNLOCK</>
                      )}
                    </p>
                  </div>
              )}

              <div className="absolute top-0 left-0 w-32 h-32 opacity-20">
                <svg viewBox="0 0 100 100" className="text-blue-500">
                  <path d="M0,0 L100,0 L0,100 Z" fill="currentColor" opacity="0.3" />
                  <circle cx="0" cy="0" r="50" fill="none" stroke="currentColor" strokeWidth="0.5" />
                </svg>
              </div>
              <div className="absolute bottom-0 right-0 w-32 h-32 opacity-20 rotate-180">
                <svg viewBox="0 0 100 100" className="text-yellow-500">
                  <path d="M0,0 L100,0 L0,100 Z" fill="currentColor" opacity="0.3" />
                  <circle cx="0" cy="0" r="50" fill="none" stroke="currentColor" strokeWidth="0.5" />
                </svg>
              </div>

              {/* HEADER */}
              <div className="relative p-8 text-center border-b border-white/5 mt-4"
                style={{
                    background: isGameOver 
                      ? 'linear-gradient(135deg, rgba(30,41,59,0.8) 0%, rgba(15,23,42,0.9) 100%)'
                      : 'linear-gradient(135deg, rgba(30,58,138,0.5) 0%, rgba(29,78,216,0.3) 100%)'
                }}>
                
                {isGameOver && isMeWinner && (
                  <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full"
                      style={{ background: 'radial-gradient(ellipse at top, rgba(234,179,8,0.2) 0%, transparent 60%)' }} />
                  </div>
                )}

                <h2 className="relative text-5xl font-black tracking-wider uppercase mb-2 mt-2"
                  style={{
                    fontFamily: 'Orbitron, monospace',
                    background: isGameOver && isMeWinner
                      ? 'linear-gradient(135deg, #fbbf24 0%, #fcd34d 50%, #fbbf24 100%)'
                      : 'linear-gradient(135deg, #60a5fa 0%, #93c5fd 50%, #60a5fa 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    textShadow: isGameOver && isMeWinner
                      ? '0 0 40px rgba(234,179,8,0.5)'
                      : '0 0 40px rgba(59,130,246,0.5)',
                    filter: `drop-shadow(0 4px 12px ${isGameOver && isMeWinner ? 'rgba(234,179,8,0.3)' : 'rgba(59,130,246,0.3)'})`
                  }}>
                  {isGameOver ? (
                    <>
                      {isMeWinner && <span className="mr-3 animate-bounce inline-block">🏆</span>}
                      {isMeWinner ? "VICTORY" : "GAME OVER"}
                      {isMeWinner && <span className="ml-3 animate-bounce inline-block">🏆</span>}
                    </>
                  ) : ( "SCOREBOARD" )}
                </h2>
                
                {isGameOver && (
                  <p className="text-slate-300 text-sm font-medium tracking-wide" style={{ fontFamily: 'system-ui' }}>
                    {isMeWinner ? "You dominated the table." : `${winner.name} takes the pot.`}
                  </p>
                )}
              </div>

              {/* TABLE */}
              <div className="p-8 overflow-x-auto">
                <table className="w-full text-center border-separate" style={{ borderSpacing: '0 8px' }}>
                  <thead>
                    <tr className="text-slate-400 text-xs uppercase tracking-widest">
                      <th className="p-4 text-left font-bold">Round</th>
                      {players.map((p, i) => (
                        <th key={i} className={`p-4 ${i === winnerIndex && isGameOver ? 'text-yellow-400' : ''}`}>
                          <div className="flex flex-col items-center gap-2">
                            <div className="relative text-3xl">
                                {p.avatar}
                                {isGameOver && i === winnerIndex && (
                                    <span className="absolute -top-2 -right-2 text-2xl animate-bounce"
                                      style={{ filter: 'drop-shadow(0 0 10px rgba(234,179,8,0.8))' }}>
                                      👑
                                    </span>
                                )}
                            </div>
                            <span className="font-bold" style={{ fontFamily: 'Orbitron, monospace' }}>{p.name}</span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="font-bold">
                    {scores.map((s, i) => (
                      <tr key={i} className="group">
                        <td className="p-4 text-left">
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg"
                                style={{
                                    background: 'linear-gradient(135deg, rgba(30,58,138,0.2) 0%, rgba(29,78,216,0.1) 100%)',
                                    border: '1px solid rgba(59,130,246,0.2)'
                                }}>
                                <span className="text-blue-400 font-mono">#{s.round}</span>
                            </div>
                        </td>
                        {players.map((_, pIndex) => (
                            <td key={pIndex} className="p-4">
                                <span className="inline-block px-4 py-2 rounded-lg text-white"
                                    style={{ background: 'rgba(30,41,59,0.5)', fontFamily: 'Orbitron, monospace' }}>
                                    {formatScore(s[`p${pIndex}`])}
                                </span>
                            </td>
                        ))}
                      </tr>
                    ))}
                    
                    {/* TOTALS */}
                    <tr className="text-xl">
                      <td className="p-4 text-left">
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg"
                            style={{
                                background: 'linear-gradient(135deg, rgba(30,58,138,0.4) 0%, rgba(29,78,216,0.2) 100%)',
                                border: '1px solid rgba(59,130,246,0.3)'
                            }}>
                            <span className="text-blue-300 font-black uppercase tracking-wider" style={{ fontFamily: 'Orbitron, monospace' }}>TOTAL</span>
                        </div>
                      </td>
                      {players.map((p, i) => (
                        <td key={i} className="p-4">
                          <span className={`inline-block px-5 py-3 rounded-xl font-black text-2xl ${i === winnerIndex && isGameOver ? 'text-yellow-400' : 'text-white'}`}
                            style={{
                              fontFamily: 'Orbitron, monospace',
                              background: i === winnerIndex && isGameOver
                                ? 'linear-gradient(135deg, rgba(234,179,8,0.3) 0%, rgba(234,179,8,0.1) 100%)'
                                : 'rgba(30,41,59,0.6)',
                              border: i === winnerIndex && isGameOver ? '2px solid rgba(234,179,8,0.5)' : '1px solid rgba(71,85,105,0.3)',
                              boxShadow: i === winnerIndex && isGameOver ? '0 0 30px rgba(234,179,8,0.3)' : 'none'
                            }}
                          >
                            {formatScore(p.totalScore)}
                          </span>
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* FOOTER ACTIONS */}
              <div className="p-8 border-t border-white/5" 
                style={{ background: 'linear-gradient(135deg, rgba(15,23,42,0.5) 0%, rgba(30,41,59,0.3) 100%)' }}>
                
                {isGameOver ? (
                    // === GAME OVER STATE ===
                    isWeb3Game ? (
                        // WEB3 FOOTER (Submit Logic)
                        <div className="space-y-4">
                            {!isSubmitted && (
                                <>
                                    {showSubmitButton ? (
                                        <div className="animate-fade-in">
                                            <button 
                                                onClick={handleSubmit} 
                                                disabled={isProcessing}
                                                className="w-full py-5 rounded-2xl font-black text-xl tracking-wider uppercase relative overflow-hidden group"
                                                style={{
                                                    fontFamily: 'Orbitron, monospace',
                                                    background: isProcessing 
                                                    ? 'linear-gradient(135deg, #475569 0%, #334155 100%)'
                                                    : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', // Gold/Orange for Submit
                                                    border: '2px solid',
                                                    borderColor: isProcessing ? '#64748b' : '#fbbf24',
                                                    boxShadow: isProcessing ? 'none' : '0 0 40px rgba(245,158,11,0.4)',
                                                    cursor: isProcessing ? 'wait' : 'pointer'
                                                }}
                                            >
                                                <span className="relative z-10 flex items-center justify-center gap-3 text-white">
                                                    {isProcessing ? '⏳ PROCESSING...' : '🚀 SUBMIT RESULT TO CHAIN'}
                                                </span>
                                            </button>
                                            <p className="text-slate-500 text-xs mt-3 text-center">
                                                * Submit to unlock matchmaking. Winners claim funds in Activity tab.
                                            </p>
                                        </div>
                                    ) : (
                                        /* WAITING STATE */
                                        <div className="w-full py-4 rounded-2xl bg-slate-800/50 border border-slate-700 text-center">
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-center gap-3">
                                                    <div className="w-5 h-5 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin"></div>
                                                    <span className="text-yellow-200 font-bold tracking-wide uppercase">Waiting for Winner...</span>
                                                </div>
                                                <p className="text-slate-500 text-xs font-mono">
                                                    Any player can submit in <span className="text-white font-bold">{timeUntilOpen}s</span>
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}

                            {/* REQUEUE / EXIT BUTTONS */}
                            <div className="flex gap-3 mt-4">
                                <button 
                                    onClick={onRequeue}
                                    disabled={!isSubmitted} // ✅ BLOCKED UNTIL SUBMITTED
                                    className="flex-1 py-4 rounded-xl font-bold tracking-wide uppercase group relative overflow-hidden text-white transition-all"
                                    style={{
                                        fontFamily: 'Orbitron, monospace',
                                        background: isSubmitted 
                                            ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' // Blue (Active)
                                            : 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', // Dark (Disabled)
                                        border: isSubmitted ? '1px solid #60a5fa' : '1px solid #334155',
                                        opacity: isSubmitted ? 1 : 0.5,
                                        cursor: isSubmitted ? 'pointer' : 'not-allowed',
                                        boxShadow: isSubmitted ? '0 0 30px rgba(59,130,246,0.3)' : 'none'
                                    }}
                                >
                                    <span className="relative z-10 flex items-center justify-center gap-2">
                                        <span className="text-xl">🔥</span> FIND NEXT MATCH
                                    </span>
                                </button>

                                <button 
                                    onClick={onExit}
                                    className="px-8 py-4 rounded-xl font-bold uppercase tracking-wide text-[#cbd5e1]"
                                    style={{
                                        fontFamily: 'Orbitron, monospace',
                                        background: 'rgba(71,85,105,0.3)',
                                        border: '1px solid rgba(100,116,139,0.3)',
                                    }}
                                >
                                    EXIT
                                </button>
                            </div>
                        </div>
                    ) : (
                        // ✅ STANDARD WEB2 GAME OVER FOOTER
                        <div className="flex gap-4">
                            <button 
                                onClick={onRequeue} 
                                className="flex-1 py-5 rounded-2xl font-black text-lg uppercase tracking-widest relative overflow-hidden group text-white hover:scale-[1.02] transition-transform"
                                style={{
                                    fontFamily: 'Orbitron, monospace',
                                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                    border: '2px solid #34d399',
                                    boxShadow: '0 0 30px rgba(16,185,129,0.3)',
                                }}
                            >
                                <span className="relative z-10">PLAY NEXT GAME →</span>
                            </button>
                            
                            <button 
                                onClick={onExit} 
                                className="px-8 py-5 rounded-2xl font-black text-lg uppercase tracking-widest relative overflow-hidden group text-red-200 hover:text-white transition-colors"
                                style={{
                                    fontFamily: 'Orbitron, monospace',
                                    background: 'rgba(127,29,29,0.4)',
                                    border: '2px solid rgba(239,68,68,0.3)',
                                }}
                            >
                                <span className="relative z-10">EXIT</span>
                            </button>
                        </div>
                    )
                ) : (
                  // === ROUND OVER STATE (CONTINUE) ===
                  <button onClick={onClose} 
                    className="w-full py-5 rounded-2xl font-black text-lg uppercase tracking-widest relative overflow-hidden group text-[#e2e8f0] hover:bg-slate-800 transition-colors"
                    style={{
                      fontFamily: 'Orbitron, monospace',
                      background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                      border: '2px solid #475569',
                      boxShadow: '0 0 30px rgba(59,130,246,0.2)',
                    }}
                  >
                    <span className="relative z-10">CONTINUE TO NEXT ROUND →</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          <style jsx>{`
            @keyframes float {
              0%, 100% { transform: translateY(0) scale(1); }
              50% { transform: translateY(-20px) scale(1.05); }
            }
            @keyframes scale-in {
              from { opacity: 0; transform: scale(0.9); }
              to { opacity: 1; transform: scale(1); }
            }
            .animate-scale-in {
              animation: scale-in 0.4s cubic-bezier(0.16, 1, 0.3, 1);
            }
            .animate-fade-in {
              animation: fadeIn 0.5s ease-out forwards;
            }
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
          `}</style>
        </div>
    );
};

export default Scoreboard;