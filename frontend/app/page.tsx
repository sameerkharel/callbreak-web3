'use client';
import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import Link from 'next/link';

// COMPONENTS
import Card from '@/components/Game/Card';
import Scoreboard from '@/components/UI/Scoreboard';
import DealingOverlay from '@/components/Game/DealingOverlay';

// UI CONTEXT HOOK
import { useUI } from '@/context/UIContext';

// WEB3 SERVICE
import Web3Service from '@/services/Web3Service';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';
const socket = io(SOCKET_URL, { transports: ['websocket'] });

type MenuState = 'MAIN' | 'PLAY_MODES' | 'CASINO' | 'TUTORIAL';

export default function App() {
  // Initialize UI System
  const ui = useUI();

  // --- STATE MANAGEMENT ---
  const [screen, setScreen] = useState<'HOME' | 'GAME'>('HOME');
  const [menuState, setMenuState] = useState<MenuState>('MAIN');
  const [gameState, setGameState] = useState<any>(null);
  
  const [myId, setMyId] = useState("");
  const [username, setUsername] = useState("Player 1");
  const [userProfile, setUserProfile] = useState<any>(null); 
  const [joinCode, setJoinCode] = useState("");
  
  const [isDealing, setIsDealing] = useState(false);
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false); 
  
  const [web3Status, setWeb3Status] = useState(""); 
  const [gameResultData, setGameResultData] = useState<any>(null);
  const [hasPendingFunds, setHasPendingFunds] = useState(false);

  const [isLobby, setIsLobby] = useState(false); 
  const [countdown, setCountdown] = useState<number | null>(null); 
  const [lobbyPlayers, setLobbyPlayers] = useState<string[]>([]);
  
  const [isZombieState, setIsZombieState] = useState(false);
  const [zombieData, setZombieData] = useState<any>(null);

  // Refs for Event Listeners
  const isLobbyRef = useRef(isLobby);
  const web3StatusRef = useRef(web3Status);
  const myIdRef = useRef(myId);

  useEffect(() => { isLobbyRef.current = isLobby; }, [isLobby]);
  useEffect(() => { web3StatusRef.current = web3Status; }, [web3Status]);
  useEffect(() => { myIdRef.current = myId; }, [myId]);

  // ==========================================
  // 1. INITIALIZATION & RECOVERY LOGIC
  // ==========================================
  useEffect(() => {
    // Load User ID
    let storedId = localStorage.getItem('cb_userid');
    if (!storedId) {
        storedId = "guest_" + Math.random().toString(36).substr(2, 6);
        localStorage.setItem('cb_userid', storedId);
    }
    setMyId(storedId);

    // Load Username
    const storedName = localStorage.getItem('cb_username');
    if (storedName) setUsername(storedName);

    // Auto-Connect & State Recovery
    const init = async () => {
        if (window.ethereum && window.ethereum.selectedAddress) {
             try {
                 const address = await Web3Service.connect();
                 setMyId(address);
                 
                 const profile = await Web3Service.loginUser(address);
                 if (profile) {
                     setUserProfile(profile);
                     setUsername(profile.nickname); 
                     console.log("👤 Identity Verified:", profile.nickname);
                 }

                 console.log("🔍 Checking Blockchain State for:", address);
                 
                 const [state, hasPending] = await Promise.all([
                     Web3Service.getPlayerStatus(),
                     Web3Service.checkPendingWithdrawals()
                 ]);

                 if (hasPending) {
                     console.warn("⚠️ User has pending withdrawal funds!");
                     setHasPendingFunds(true);
                 }
                 
                 if (state.status === "PLAYING") {
                     const recoveredGame = await Web3Service.getRecoverableGame(state.gameId);
                     
                     if (recoveredGame) {
                         console.log("✅ RECOVERY MODE: Found finished game pending submission.");
                         setGameState({ 
                             roomId: state.gameId, 
                             players: recoveredGame.players,
                             status: 'GAME_OVER' 
                         }); 
                         setGameResultData(recoveredGame.result);
                         setShowScoreboard(true);
                         setScreen('GAME'); 
                         return; 
                     }

                     console.log("✅ User found in Game! Restoring Table...");
                     const rejoinTimeout = setTimeout(() => {
                        console.warn("⚠️ Socket rejoin timeout. Might be zombie state.");
                        setIsZombieState(true);
                        setZombieData(state);
                     }, 5000); 
                     
                     socket.emit('rejoin_room', { roomId: state.gameId, userId: address });
                     
                     socket.once('rejoin_success', () => clearTimeout(rejoinTimeout));
                     socket.once('error', () => clearTimeout(rejoinTimeout));
                 }
                 else if (state.status === "QUEUED") {
                     console.log("✅ User found in Queue! Restoring Lobby...");
                     const matchRoomId = `TIER_${state.tier}_LOBBY`; 
                     
                     socket.emit('join_room', { 
                        roomId: matchRoomId, 
                        userId: address, 
                        userName: profile?.nickname || storedName || "Player 1" 
                     });
                     
                     setLobbyPlayers([address]);
                     setIsLobby(true); 
                 } 
             } catch (e) {
                 console.log("Auto-connect failed or wallet locked (normal for first visit)");
             }
        }
    };
    init();

    // Socket listeners...
    socket.on('LOBBY_UPDATE', (data) => {
        if (data.type === 'PLAYER_JOINED') {
            setLobbyPlayers(prev => {
                if (prev.includes(data.player)) return prev;
                return [...prev, data.player];
            });
        }
        if (data.type === 'PLAYER_LEFT') {
            setLobbyPlayers(prev => prev.filter(p => p !== data.player));
        }
    });

    socket.on('LOBBY_SYNC', (data) => {
        if (data.players && Array.isArray(data.players)) {
            setLobbyPlayers(data.players);
        } else {
            setLobbyPlayers(prev => prev.length === data.count ? prev : prev); 
        }
    });

    socket.on('update', (data) => {
        setGameState((prev: any) => {
            if((!prev || prev.status === 'WAITING' || prev.status === 'INITIALIZING_ON_CHAIN' || prev.status === 'COUNTDOWN') && data.status === 'BIDDING') {
                setIsDealing(true);
            }
            return data;
        });
        setIsProcessing(false);
        setWeb3Status("");
        
        if(data.status === 'ROUND_OVER' || data.status === 'GAME_OVER') setShowScoreboard(true);
        else if(data.status !== 'WAITING' && data.status !== 'INITIALIZING_ON_CHAIN' && data.status !== 'COUNTDOWN') setShowScoreboard(false);
        
        if (data.status !== 'COUNTDOWN') {
             setScreen('GAME');
        }
        localStorage.setItem('cb_roomid', data.roomId);
    });

    socket.on('GAME_COUNTDOWN', (data: any) => {
        console.log("⏰ Game Starting in", data.seconds);
        setIsLobby(false); 
        setScreen('GAME'); 
        setCountdown(data.seconds); 

        let timeLeft = data.seconds;
        const timer = setInterval(() => {
            timeLeft--;
            setCountdown(timeLeft);
            if(timeLeft <= 0) {
                clearInterval(timer);
                setCountdown(null);
            }
        }, 1000);
    });

    socket.on('force_game_start', (data: any) => {
        console.log("🚀 Forced switch to game:", data.gameId);
        setScreen('GAME');
        setIsLobby(false);
    });

    socket.on('rejoin_success', (data) => {
        setGameState(data);
        setScreen('GAME');
    });

    // Game Signed Event
    socket.on('GAME_RESULT_SIGNED', (data) => {
        console.log("✅ Server signed result:", data);
        setGameResultData(data);
        setShowScoreboard(true);
        ui.showSuccess(
            "✅ Game Complete", 
            "Server has verified the result.\n\nWinner can now submit to blockchain."
        );
    });

    // ✅ Game Submitted Event
    socket.on('GAME_RESULT_SUBMITTED', (data) => {
        console.log("📢 Result submitted by:", data.submittedBy);
        
        // Update local state to mark as submitted
        setGameResultData((prev: any) => {
            if (!prev) return null;
            return { ...prev, isSubmitted: true };
        });
        
        const submitter = data.submittedBy?.toLowerCase() === myIdRef.current?.toLowerCase() 
            ? "You" 
            : "Another player";

        ui.showSuccess(
            "🎉 Result Submitted!",
            `${submitter} submitted the result to blockchain.\n\n✅ You can now join new games!\n💰 Winner can claim in Activity page (5 min timer).`
        );
        
        // NOTE: We do NOT setGameState(null) here. 
        // We let the user choose to "Exit" or "Re-queue" from the scoreboard.
    });

    // ✅ Game Finalized (Optional Notification)
    socket.on('GAME_FINALIZED', (data) => {
        console.log("💰 Winner claimed:", data);
        ui.showSuccess(
            "💰 Prize Claimed",
            `Game ${data.gameId.slice(0, 8)} has been fully settled.`
        );
    });

    socket.on('error', async (msg) => {
        if ((isLobbyRef.current || web3StatusRef.current !== "") && (msg.includes('not found') || msg.includes('not in this game'))) {
             return;
        }

        if (msg.includes('Game is finished') || msg.includes('Room not found')) {
            console.log("⚠️ Game session expired. Clearing state.");
            localStorage.removeItem('cb_roomid');
            setGameState(null);
            setScreen('HOME');
            setMenuState('MAIN');
            setIsLobby(false);
            setGameResultData(null);
            setShowScoreboard(false);
            return;
        }

        if (msg.includes('not in this game')) {
            try {
                const status = await Web3Service.getPlayerStatus();
                if (status.status === 'PLAYING') {
                    console.error("⛔ ZOMBIE STATE DETECTED.");
                    setZombieData(status); 
                    setIsZombieState(true);
                    return; 
                }
                if (status.status === 'QUEUED') {
                    console.error("⛔ QUEUE ZOMBIE DETECTED.");
                    setZombieData(status);
                    setIsZombieState(true); 
                    localStorage.removeItem('cb_roomid');
                    return;
                }
            } catch (e) { console.error(e); }
            
            localStorage.removeItem('cb_roomid');
            setScreen('HOME');
            setMenuState('MAIN');
            setIsLobby(false);
        } else {
            ui.showError("Error", msg);
        }
        
        setIsProcessing(false);
        setWeb3Status("");
    });

    return () => { 
        socket.off('update'); 
        socket.off('rejoin_success');
        socket.off('error');
        socket.off('GAME_RESULT_SIGNED');
        socket.off('GAME_RESULT_SUBMITTED'); 
        socket.off('GAME_FINALIZED'); 
        socket.off('GAME_COUNTDOWN');
        socket.off('LOBBY_UPDATE');
        socket.off('LOBBY_SYNC');
        socket.off('force_game_start');
    };
  }, []);

  // [Action handlers]
  const saveAndEmit = (event: string, payload: any) => {
      localStorage.setItem('cb_username', username);
      socket.emit(event, payload);
  };

  const createRoom = () => saveAndEmit('create_room', { userId: myId, userName: username });
  const joinRoom = () => saveAndEmit('join_room', { roomId: joinCode, userId: myId, userName: username });
  const playBots = () => saveAndEmit('play_bots', { userId: myId, userName: username });

  const enterCasino = async () => {
      try {
          setWeb3Status("Connecting Wallet...");
          const address = await Web3Service.connect(false); 
          setMyId(address);

          setWeb3Status("Waiting for Signature...");
          await Web3Service.authenticateUser(address);

          setWeb3Status("Logging in...");
          const profile = await Web3Service.loginUser(address);
          
          if (profile) {
              setUserProfile(profile);
              setUsername(profile.nickname);
              console.log("✅ Authenticated as:", profile.nickname);
          }
          setMenuState('CASINO');

      } catch (error: any) {
          console.error("Login Failed:", error);
          if (!error.message.includes("User rejected") && !error.message.includes("cancelled")) {
              ui.showError("Access Denied", error.message);
          }
      } finally {
          setWeb3Status("");
      }
  };

  const handleWeb3Join = async (tierIndex: number) => {
      try {
          if(web3Status) return; 
          setWeb3Status("Checking Chain State...");
          
          const address = await Web3Service.connect();
          setMyId(address); 
          
          // ✅ PRE-JOIN CHECK (The "Trap")
          const status = await Web3Service.getPlayerStatus();
          
          if (status.status === "PLAYING") {
              const gameStatus = await Web3Service.getGameStatus(status.gameId);
              
              // If playing AND not submitted, block the join
              if (!gameStatus || !gameStatus.finalSubmitted) {
                  ui.showError(
                      "Pending Game Result", 
                      "You must submit the game result before joining a new game.\n\nGo back to game or Activity tab to submit."
                  );
                  setWeb3Status("");
                  return;
              }
              
              // If finalSubmitted is true, we proceed
              console.log("✅ Previous game submitted. Proceeding to join new game.");
          }
          
          if (!userProfile) {
             const profile = await Web3Service.loginUser(address);
             if (profile) setUserProfile(profile);
          }

          await Web3Service.joinGame(tierIndex);
          
          const matchRoomId = `TIER_${tierIndex}_LOBBY`; 
          socket.emit('join_room', { roomId: matchRoomId, userId: address, userName: username });
          
          setLobbyPlayers([address]); 
          setIsLobby(true); 
          setWeb3Status("");

      } catch (error: any) {
          console.error("Join Flow Error:", error);
          
          if (error.message.includes("Active Game Exists")) {
               ui.showError(
                   "Submit Result First", 
                   "Please submit your previous game result to unlock your account."
               );
               setWeb3Status("");
               return;
          }
          
          if (error.message.includes("Already Queued")) {
               ui.showError("Already Queued", "You are already in the queue. Entering Lobby...");
               const matchRoomId = `TIER_${tierIndex}_LOBBY`; 
               socket.emit('join_room', { roomId: matchRoomId, userId: myId, userName: username });
               setIsLobby(true);
               setWeb3Status("");
               return;
          }
          
          ui.showError("Join Failed", error.message);
          setWeb3Status("");
      }
  };

  // ✅ UPDATED: Handle Submit To Chain
  const handleSubmitToChain = async () => {
    if(!gameState || !gameResultData) {
        ui.showError("Error", "Missing game data. Please refresh.");
        return;
    }
    
    try {
        setWeb3Status("Checking status...");
        
        // Double-check if already submitted
        const status = await Web3Service.getGameStatus(gameState.roomId);
        if (status && status.finalSubmitted) {
            ui.showSuccess(
                "Already Submitted", 
                "Result is already on blockchain.\n\n✅ You can join new games!\n💰 Check Activity page to claim."
            );
            setGameResultData((prev: any) => ({ ...prev, isSubmitted: true }));
            setWeb3Status("");
            return;
        }

        setWeb3Status("Submitting to Blockchain...");
        
        // ============================================================
        // 🚨 CRITICAL FIX: PREVENT DOUBLE SCALING
        // ============================================================
        // The server sent us SCALED integers (e.g. 32). 
        // Web3Service expects to scale up by 10.
        // We must divide by 10 here to pass "3.2" to Web3Service.
        
        const payload = { 
            ...gameResultData, 
            scores: gameResultData.scores.map((s: any) => (Number(s) / 10).toString()) 
        };

        await Web3Service.submitResult(gameState.roomId, payload);
        
        // ✅ SUCCESS!
        ui.showSuccess(
            "✅ Submission Successful!", 
            "Result locked on-chain!\n\n✅ You can now join new games!\n💰 Claim in Activity tab (5 min wait)."
        );
        
        // Mark as submitted locally
        setGameResultData((prev: any) => ({ ...prev, isSubmitted: true }));
        
        // ✅ EMIT CORRECT EVENT to backend so other players get notified
        socket.emit('RESULT_SUBMITTED_BY_PLAYER', { 
            gameId: gameState.roomId, 
            submittedBy: myId 
        });
        
        setWeb3Status("");
        
    } catch (err: any) {
        console.error("Submission error:", err);
        
        // ✅ Error Handling
        if (err.code === 4001 || err.code === "ACTION_REJECTED") {
            ui.showError("❌ Transaction Rejected", "You cancelled the transaction.");
            setWeb3Status("");
            return;
        }
        
        if (err.message?.includes("Submitted") || 
            err.message?.includes("0xbaa6adbd") ||
            err.data?.message?.includes("Submitted")) {
            ui.showSuccess("Already Submitted", "Another player submitted first!\n\n✅ You can now join new games!");
            setGameResultData((prev: any) => ({ ...prev, isSubmitted: true }));
            setWeb3Status("");
            return;
        }

        if (err.message?.includes("Expired")) {
            ui.showError("⏰ Signature Expired", "The submission window has closed. Please refresh.");
            setWeb3Status("");
            return;
        }

        if (err.message?.includes("insufficient funds")) {
            ui.showError("⛽ Insufficient Gas", "You don't have enough ETH for gas fees.");
            setWeb3Status("");
            return;
        }
        
        ui.showError("Submission Failed", err.message || "Unknown error occurred.");
        setWeb3Status("");
    }
  };

  const handleRequeue = async () => {
      if (!gameState || gameState.mode !== 'WEB3') {
          ui.showError("Error", "Re-queue is only available for Web3 games.");
          return;
      }
      
      // ✅ FIX: Check if we are allowed to leave before resetting the screen
      try {
          setWeb3Status("Checking status...");
          
          const status = await Web3Service.getPlayerStatus();
          
          if (status.status === "PLAYING") {
              const gameStatus = await Web3Service.getGameStatus(status.gameId);
              
              // ⛔ BLOCK if not submitted yet
              if (!gameStatus || !gameStatus.finalSubmitted) {
                  ui.showError(
                      "Cannot Requeue Yet", 
                      "Please submit the game result first.\n\nClick 'SUBMIT RESULT TO CHAIN' button."
                  );
                  setWeb3Status("");
                  return; // Stop here! Do not reset state.
              }
          }
          
          // ✅ SAFE TO PROCEED
          const tier = gameState.tier || 0;
          
          // Now we can reset the UI
          setShowScoreboard(false);
          setGameState(null);
          setGameResultData(null);
          setScreen('HOME');
          setWeb3Status("");
          
          // Attempt to join new game
          handleWeb3Join(tier);
          
      } catch (error: any) {
          console.error("Requeue check failed:", error);
          ui.showError("Status Check Failed", error.message);
          setWeb3Status("");
      }
  };

  const handleDisconnect = async () => {
      const isSwitching = await ui.showConfirm(
          "Disconnect Wallet?", 
          "Click CONFIRM to Switch Wallet.\nClick CANCEL to just Log Out."
      );

      Web3Service.disconnect();
      localStorage.removeItem('cb_userid');
      localStorage.removeItem('cb_username');
      localStorage.removeItem('cb_roomid');
      
      setUserProfile(null);
      setUsername("Player 1");
      setMyId("guest_" + Math.random().toString(36).substr(2, 6));
      setMenuState('MAIN'); 

      if (isSwitching) { 
          try {
              await window.ethereum.request({
                  method: "wallet_requestPermissions",
                  params: [{ eth_accounts: {} }]
              });
          } catch (e) {}
      }
      ui.showSuccess("Logged Out", "You have been successfully logged out.");
  };

  const handleExit = () => {
      setShowScoreboard(false);
      setGameState(null);
      setGameResultData(null);
      setScreen('HOME');
      setMenuState('MAIN');
      localStorage.removeItem('cb_roomid');
  };

  const playCard = (idx: number) => {
      if (isProcessing || gameState.turn !== myIndex) return;
      setIsProcessing(true);
      socket.emit('action', { roomId: gameState.roomId, type: 'PLAY', payload: idx, userId: myId });
  };

  const bid = (amt: number) => {
      if (isProcessing) return;
      setIsProcessing(true);
      socket.emit('action', { roomId: gameState.roomId, type: 'BID', payload: amt, userId: myId });
  };

  const leaveGame = async () => {
      if (isLobby) {
          const confirmLeave = await ui.showConfirm("Cancel Matchmaking?", "This will withdraw your stake and leave the queue.");
          if (!confirmLeave) return;

          try {
              setWeb3Status("Processing Refund...");
              await Web3Service.leaveQueue(); 
              
              setWeb3Status("Verifying Refund...");
              let attempts = 0;
              let isFree = false;
              
              while (attempts < 10) { 
                  const state = await Web3Service.getPlayerStatus();
                  if (state.status === "IDLE") {
                      isFree = true;
                      break; 
                  }
                  await new Promise(r => setTimeout(r, 1000)); 
                  attempts++;
              }
              
              if (!isFree) console.warn("Refund confirmed, but status update is slow.");
              ui.showSuccess("Refund Confirmed", "Your ETH is back in your wallet.");

          } catch (err: any) {
              console.error(err);
              if (err === true || err.message?.includes("Not Queued")) {
                   // fall through
              } else {
                  ui.showError("Refund Failed", err.reason || err.message);
                  setWeb3Status("");
                  return; 
              }
          }
      }

      localStorage.removeItem('cb_roomid');
      if (gameState && gameState.roomId) {
          socket.emit('leave_room', { roomId: gameState.roomId, userId: myId });
      }

      setScreen('HOME');
      setMenuState('MAIN');
      setGameState(null);
      setGameResultData(null);
      setIsLobby(false);
      setLobbyPlayers([]); 
      setCountdown(null);
      setWeb3Status("");
  };
  
  // ==========================
  //    UI RENDERERS
  // ==========================

  // ZOMBIE STATE UI (Enhanced design)
  if (isZombieState && zombieData) {
    const isQueued = zombieData.status === 'QUEUED';
    const now = Math.floor(Date.now() / 1000);
    const unlockTime = zombieData.emergencyUnlocksAt || 0;
    const timeLeft = Math.max(0, unlockTime - now);
    const hoursLeft = Math.floor(timeLeft / 3600);
    const minutesLeft = Math.floor((timeLeft % 3600) / 60);
    const isGhostGame = zombieData.hasStarted === false;

    return (
        <div className="min-h-screen flex flex-col items-center justify-center text-white p-8 text-center relative overflow-hidden"
          style={{ background: 'radial-gradient(ellipse at center, #450a0a 0%, #1c0a0a 100%)' }}>
          
          <div className="absolute inset-0 opacity-10">
            <div style={{ backgroundImage: `linear-gradient(rgba(239,68,68,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(239,68,68,0.3) 1px, transparent 1px)`, backgroundSize: '40px 40px' }} className="absolute inset-0" />
          </div>

          <div className="relative z-10 max-w-2xl">
            <h1 className="text-5xl font-black mb-6 uppercase tracking-widest pb-3"
              style={{ fontFamily: 'Orbitron, monospace', background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 0 20px rgba(239,68,68,0.5))', borderBottom: '3px solid rgba(239,68,68,0.3)' }}>
              ⚠️ GAME DESYNC DETECTED
            </h1>
            
            {isQueued ? (
                <>
                    <p className="text-lg mb-8 p-6 rounded-2xl" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(239,68,68,0.2)', fontFamily: 'system-ui' }}>
                        You are in the matchmaking queue on-chain, but the server lost your connection.
                    </p>
                    <button onClick={leaveGame}
                        className="py-5 px-10 rounded-2xl font-black text-xl uppercase tracking-wider"
                        style={{ fontFamily: 'Orbitron, monospace', background: 'linear-gradient(135deg, #fef3c7 0%, #fcd34d 100%)', color: '#7c2d12', boxShadow: '0 0 40px rgba(252,211,77,0.4), 0 4px 20px rgba(0,0,0,0.5)', border: '2px solid #fbbf24' }}>
                        💰 WITHDRAW STAKE & LEAVE
                    </button>
                </>
            ) : (
                <>
                    <p className="text-lg mb-6 p-6 rounded-2xl" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(239,68,68,0.2)', fontFamily: 'system-ui' }}>
                        {isGhostGame ? "The game was created, but the server crashed before it started." : "The game started, but the server lost the session data."}
                    </p>

                    {timeLeft > 0 ? (
                        <div className="p-8 rounded-3xl mb-8" style={{ background: 'rgba(127,29,29,0.3)', border: '2px solid rgba(239,68,68,0.3)', boxShadow: 'inset 0 0 40px rgba(239,68,68,0.1)' }}>
                            <p className="text-red-300 text-sm font-bold uppercase mb-3 tracking-widest" style={{ fontFamily: 'Orbitron, monospace' }}>
                              Emergency Withdraw Unlocks In:
                            </p>
                            <div className="text-7xl font-mono font-black mb-4" style={{ fontFamily: 'Orbitron, monospace', color: '#fca5a5', textShadow: '0 0 20px rgba(239,68,68,0.5)' }}>
                                {hoursLeft}h {minutesLeft}m
                            </div>
                            <p className="text-xs opacity-60">
                                {isGhostGame ? "Ghost Game Lock (5 mins)" : "Active Game Lock (1 Hour)"}
                            </p>
                        </div>
                    ) : (
                        <button onClick={async () => {
                                try {
                                    setWeb3Status("Attempting Emergency Withdraw...");
                                    await Web3Service.emergencyWithdraw(zombieData.gameId);
                                    ui.showSuccess("Success", "Funds recovered successfully.");
                                    setIsZombieState(false);
                                    window.location.reload(); 
                                } catch (e: any) {
                                    ui.showError("Withdraw Failed", e.reason || e.message);
                                } finally { setWeb3Status(""); }
                            }}
                            className="py-5 px-10 rounded-2xl font-black text-xl uppercase tracking-wider animate-pulse"
                            style={{ fontFamily: 'Orbitron, monospace', background: 'linear-gradient(135deg, #fef3c7 0%, #fcd34d 100%)', color: '#7c2d12', boxShadow: '0 0 60px rgba(252,211,77,0.6), 0 4px 20px rgba(0,0,0,0.5)', border: '2px solid #fbbf24' }}>
                            🚨 EMERGENCY WITHDRAW FUNDS
                        </button>
                    )}
                </>
            )}
          </div>
        </div>
    );
  }

  // --- RENDERERS ---

  const renderMainMenu = () => (
    <div className="relative space-y-6 w-full max-w-md mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-6xl font-black mb-3 relative"
          style={{ fontFamily: 'Orbitron, monospace', background: 'linear-gradient(135deg, #60a5fa 0%, #a78bfa 50%, #ec4899 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundSize: '200% auto', animation: 'shimmer 3s linear infinite', filter: 'drop-shadow(0 0 20px rgba(96,165,250,0.5))' }}>
          ♠️ CALL BREAK
        </h1>
        <div className="text-3xl font-bold tracking-widest"
          style={{ fontFamily: 'Orbitron, monospace', background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 0 15px rgba(251,191,36,0.5))' }}>
          ULTIMATE
        </div>
      </div>

      {userProfile && (
          <div className="p-4 rounded-2xl mb-6 relative overflow-hidden group"
            style={{ background: 'linear-gradient(135deg, rgba(30,58,138,0.4) 0%, rgba(29,78,216,0.2) 100%)', border: '1px solid rgba(59,130,246,0.3)', boxShadow: '0 8px 32px 0 rgba(0,0,0,0.4)', backdropFilter: 'blur(10px)' }}>
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.2) 0%, transparent 100%)' }} />
            <div className="relative flex items-center justify-between gap-4">
               <div className="flex items-center gap-4">
                   <div className="text-4xl">👤</div>
                   <div>
                       <div className="text-blue-300 font-bold text-lg" style={{ fontFamily: 'Orbitron, monospace' }}>{userProfile.nickname}</div>
                       <div className="text-slate-400 text-xs font-mono">{myId.slice(0,8)}...{myId.slice(-6)}</div>
                   </div>
               </div>
               <button onClick={handleDisconnect} className="p-3 rounded-xl bg-red-500/20 hover:bg-red-500/40 border border-red-500/30 text-red-300 hover:text-white transition-all shadow-lg hover:shadow-red-900/50 group/logout" title="Disconnect Wallet">
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 group-hover/logout:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                   <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                 </svg>
               </button>
            </div>
          </div>
      )}
      
      {hasPendingFunds && (
          <button onClick={async () => {
                  try {
                      setWeb3Status("Withdrawing from Vault...");
                      await Web3Service.withdrawPendingFunds();
                      ui.showSuccess("Funds Withdrawn", "Your funds have been successfully withdrawn.");
                      setHasPendingFunds(false);
                  } catch(e: any) { ui.showError("Withdraw Failed", e.message); } 
                  finally { setWeb3Status(""); }
              }} 
              className="w-full mb-6 py-4 rounded-2xl font-black text-lg uppercase tracking-wider flex items-center justify-center gap-3 animate-pulse"
              style={{ fontFamily: 'Orbitron, monospace', background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)', border: '2px solid #f87171', boxShadow: '0 0 40px rgba(220,38,38,0.6), 0 4px 20px rgba(0,0,0,0.4)' }}>
              <span className="text-2xl">⚠️</span> CLAIM STUCK FUNDS
          </button>
      )}

      {/* Username Input */}
      <div className="relative mb-6">
        <input value={username} onChange={(e) => setUsername(e.target.value)}
            className="w-full p-4 rounded-xl text-center font-bold text-lg tracking-wide"
            placeholder="ENTER YOUR NAME"
            style={{ background: 'rgba(15,23,42,0.8)', border: '2px solid rgba(59,130,246,0.3)', color: '#e2e8f0', fontFamily: 'Orbitron, monospace', boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.5)', outline: 'none' }}
            onFocus={(e) => e.target.style.borderColor = 'rgba(59,130,246,0.8)'}
            onBlur={(e) => e.target.style.borderColor = 'rgba(59,130,246,0.3)'}
        />
      </div>

      {/* Main Play Button */}
      <button onClick={() => setMenuState('PLAY_MODES')} 
        className="w-full py-6 rounded-2xl font-black text-2xl uppercase tracking-widest group relative overflow-hidden"
        style={{ fontFamily: 'Orbitron, monospace', background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', border: '2px solid #60a5fa', boxShadow: '0 0 40px rgba(59,130,246,0.6), 0 8px 30px rgba(0,0,0,0.4)' }}>
        <span className="relative z-10 flex items-center justify-center gap-3">
          <span className="text-3xl">▶</span> PLAY GAME
        </span>
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.4) 0%, transparent 100%)' }} />
      </button>

      {/* Casino Mode */}
      <button onClick={enterCasino} 
        className="w-full p-6 rounded-2xl flex items-center gap-5 group relative overflow-hidden mt-6"
        style={{ background: 'linear-gradient(135deg, rgba(120,53,15,0.5) 0%, rgba(69,26,3,0.7) 100%)', border: '2px solid rgba(251,191,36,0.5)', boxShadow: '0 0 40px rgba(251,191,36,0.3), 0 8px 32px rgba(0,0,0,0.4)' }}>
        <div className="text-5xl animate-pulse">💎</div>
        <div className="flex-1 text-left">
          <div className="font-bold text-2xl mb-1" style={{ fontFamily: 'Orbitron, monospace', color: '#fbbf24' }}>Real Casino</div>
          <div className="text-yellow-200/60 text-sm font-medium">Login with Wallet • Stake ETH • Win Big</div>
        </div>
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: 'linear-gradient(135deg, rgba(251,191,36,0.3) 0%, transparent 100%)' }} />
      </button>

      {/* Info Buttons */}
      <div className="grid grid-cols-2 gap-4 mt-6">
        <button onClick={() => setMenuState('TUTORIAL')} 
            className="py-4 rounded-xl font-bold uppercase tracking-wide group relative overflow-hidden"
            style={{ background: 'rgba(30,41,59,0.6)', border: '1px solid rgba(71,85,105,0.4)', color: '#cbd5e1', fontFamily: 'Orbitron, monospace', fontSize: '0.8rem' }}>
            <span className="relative z-10">📚 TUTORIAL</span>
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: 'linear-gradient(135deg, rgba(71,85,105,0.4) 0%, transparent 100%)' }} />
        </button>

        <Link href="/faq" 
            className="py-4 rounded-xl font-bold uppercase tracking-wide group relative overflow-hidden flex items-center justify-center"
            style={{ background: 'rgba(30,41,59,0.6)', border: '1px solid rgba(71,85,105,0.4)', color: '#cbd5e1', fontFamily: 'Orbitron, monospace', fontSize: '0.8rem' }}>
            <span className="relative z-10">❓ FAQ</span>
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: 'linear-gradient(135deg, rgba(71,85,105,0.4) 0%, transparent 100%)' }} />
        </Link>
      </div>
      <style jsx>{`@keyframes shimmer { 0% { background-position: 0% 50%; } 100% { background-position: 200% 50%; } }`}</style>
    </div>
  );

  const renderPlayModes = () => (
    <div className="space-y-5 w-full max-w-lg mx-auto">
        <h2 className="text-4xl font-black text-center mb-8 tracking-widest"
          style={{ fontFamily: 'Orbitron, monospace', background: 'linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 0 20px rgba(96,165,250,0.4))' }}>
          SELECT MODE
        </h2>

        <button onClick={playBots} 
          className="w-full p-5 rounded-2xl flex items-center gap-5 group relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, rgba(30,41,59,0.8) 0%, rgba(15,23,42,0.9) 100%)', border: '2px solid rgba(34,197,94,0.3)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
          <div className="text-5xl">🤖</div>
          <div className="flex-1 text-left">
            <div className="font-bold text-xl mb-1" style={{ fontFamily: 'Orbitron, monospace', color: '#86efac' }}>Play vs Bots</div>
            <div className="text-slate-400 text-sm">Offline Practice Mode</div>
          </div>
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.2) 0%, transparent 100%)' }} />
        </button>

        <button onClick={createRoom}
          className="w-full p-5 rounded-2xl flex items-center gap-5 group relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, rgba(30,41,59,0.8) 0%, rgba(15,23,42,0.9) 100%)', border: '2px solid rgba(59,130,246,0.3)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
          <div className="text-5xl">👥</div>
          <div className="flex-1 text-left">
            <div className="font-bold text-xl mb-1" style={{ fontFamily: 'Orbitron, monospace', color: '#93c5fd' }}>Create Room</div>
            <div className="text-slate-400 text-sm">Web2 Multiplayer with Friends</div>
          </div>
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.2) 0%, transparent 100%)' }} />
        </button>

        <div className="flex gap-3">
            <input placeholder="ENTER CODE" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                className="flex-1 px-5 rounded-xl font-bold text-center uppercase tracking-widest"
                style={{ background: 'rgba(15,23,42,0.9)', border: '2px solid rgba(59,130,246,0.3)', color: '#e2e8f0', fontFamily: 'Orbitron, monospace', fontSize: '1.1rem', outline: 'none' }} />
            <button onClick={joinRoom} className="px-8 rounded-xl font-bold uppercase"
              style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', border: '1px solid #60a5fa', fontFamily: 'Orbitron, monospace', boxShadow: '0 4px 15px rgba(59,130,246,0.4)' }}>
                JOIN
            </button>
        </div>

        <button onClick={enterCasino} 
          className="w-full p-6 rounded-2xl flex items-center gap-5 group relative overflow-hidden mt-6"
          style={{ background: 'linear-gradient(135deg, rgba(120,53,15,0.5) 0%, rgba(69,26,3,0.7) 100%)', border: '2px solid rgba(251,191,36,0.5)', boxShadow: '0 0 40px rgba(251,191,36,0.3), 0 8px 32px rgba(0,0,0,0.4)' }}>
          <div className="text-5xl animate-pulse">💎</div>
          <div className="flex-1 text-left">
            <div className="font-bold text-2xl mb-1" style={{ fontFamily: 'Orbitron, monospace', color: '#fbbf24' }}>Real Casino</div>
            <div className="text-yellow-200/60 text-sm font-medium">Web3 • Stake ETH • Win Big</div>
          </div>
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: 'linear-gradient(135deg, rgba(251,191,36,0.3) 0%, transparent 100%)' }} />
        </button>

        <button onClick={() => setMenuState('MAIN')} className="mt-6 px-6 py-3 rounded-xl font-bold uppercase tracking-wide"
          style={{ background: 'rgba(71,85,105,0.3)', border: '1px solid rgba(100,116,139,0.3)', color: '#94a3b8', fontFamily: 'Orbitron, monospace', fontSize: '0.9rem' }}>
            ← BACK TO MAIN MENU
        </button>
    </div>
  );

  const renderCasinoMenu = () => (
    <div className="space-y-5 w-full max-w-lg mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-4xl font-black mb-2 tracking-widest"
            style={{ fontFamily: 'Orbitron, monospace', background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 0 20px rgba(251,191,36,0.5))' }}>
            REAL CASINO
          </h2>
          <p className="text-yellow-200/50 text-sm font-medium" style={{ fontFamily: 'Orbitron, monospace' }}>
            Account Connected: {myId.slice(0,6)}...{myId.slice(-4)}
          </p>
        </div>

        <Link href="/activity" className="block w-full mb-8 py-4 px-6 rounded-2xl font-bold text-lg uppercase tracking-wide group relative overflow-hidden transition-transform hover:scale-105"
            style={{ background: 'linear-gradient(90deg, rgba(16,185,129,0.1) 0%, rgba(6,95,70,0.3) 100%)', border: '1px solid #10b981', boxShadow: '0 0 20px rgba(16,185,129,0.2)', fontFamily: 'Orbitron, monospace' }}>
            <div className="flex items-center justify-between relative z-10 text-emerald-300">
              <span className="flex items-center gap-3"><span className="text-2xl">📊</span> ACTIVITY & HISTORY</span>
              <span className="text-xl">→</span>
            </div>
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: 'linear-gradient(90deg, rgba(16,185,129,0.2) 0%, transparent 100%)' }} />
        </Link>

        {web3Status ? (
             <div className="p-8 rounded-3xl animate-pulse"
               style={{ background: 'rgba(30,41,59,0.6)', border: '2px solid rgba(251,191,36,0.4)', boxShadow: 'inset 0 0 40px rgba(251,191,36,0.1)' }}>
                <div className="text-yellow-400 font-bold text-xl mb-3 tracking-wide" style={{ fontFamily: 'Orbitron, monospace' }}>{web3Status}</div>
                <div className="text-slate-400 text-sm">Check your wallet popup...</div>
            </div>
        ) : (
            <div className="space-y-4">
                <button onClick={() => handleWeb3Join(0)} className="w-full p-5 rounded-2xl flex justify-between items-center group relative overflow-hidden transition-all hover:border-slate-300"
                  style={{ background: 'linear-gradient(135deg, rgba(148,163,184,0.3) 0%, rgba(100,116,139,0.5) 100%)', border: '2px solid rgba(203,213,225,0.4)', boxShadow: '0 8px 30px rgba(0,0,0,0.4)' }}>
                    <div className="flex items-center gap-4">
                        <span className="text-4xl">🥈</span>
                        <div className="text-left">
                            <div className="text-xl font-black tracking-wide" style={{ fontFamily: 'Orbitron, monospace', color: '#cbd5e1' }}>Silver Pot</div>
                            <div className="text-xs opacity-75">Entry Level</div>
                        </div>
                    </div>
                    <div className="px-4 py-2 rounded-xl font-mono font-bold" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(203,213,225,0.2)' }}>0.00001 ETH</div>
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: 'linear-gradient(135deg, rgba(203,213,225,0.2) 0%, transparent 100%)' }} />
                </button>

                <button onClick={() => handleWeb3Join(1)} className="w-full p-5 rounded-2xl flex justify-between items-center group relative overflow-hidden transition-all hover:border-yellow-400"
                  style={{ background: 'linear-gradient(135deg, rgba(251,191,36,0.3) 0%, rgba(245,158,11,0.5) 100%)', border: '2px solid rgba(251,191,36,0.5)', boxShadow: '0 0 30px rgba(251,191,36,0.3)' }}>
                    <div className="flex items-center gap-4">
                        <span className="text-4xl">🥇</span>
                        <div className="text-left">
                            <div className="text-xl font-black tracking-wide" style={{ fontFamily: 'Orbitron, monospace', color: '#fbbf24' }}>Golden Pot</div>
                            <div className="text-xs text-amber-200/70">High Stakes</div>
                        </div>
                    </div>
                    <div className="px-4 py-2 rounded-xl font-mono font-bold" style={{ background: 'rgba(120,53,15,0.4)', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24' }}>0.0001 ETH</div>
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: 'linear-gradient(135deg, rgba(251,191,36,0.3) 0%, transparent 100%)' }} />
                </button>

                <button onClick={() => handleWeb3Join(2)} className="w-full p-5 rounded-2xl flex justify-between items-center group relative overflow-hidden transition-all hover:border-cyan-400"
                  style={{ background: 'linear-gradient(135deg, rgba(34,211,238,0.3) 0%, rgba(59,130,246,0.5) 100%)', border: '2px solid rgba(34,211,238,0.5)', boxShadow: '0 0 40px rgba(34,211,238,0.4)' }}>
                    <div className="flex items-center gap-4">
                        <span className="text-4xl">💎</span>
                        <div className="text-left">
                            <div className="text-xl font-black tracking-wide" style={{ fontFamily: 'Orbitron, monospace', color: '#22d3ee' }}>Diamond Pot</div>
                            <div className="text-xs text-cyan-200/70">Whale Only</div>
                        </div>
                    </div>
                    <div className="px-4 py-2 rounded-xl font-mono font-bold" style={{ background: 'rgba(8,47,73,0.4)', border: '1px solid rgba(34,211,238,0.3)', color: '#22d3ee' }}>0.001 ETH</div>
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: 'linear-gradient(135deg, rgba(34,211,238,0.3) 0%, transparent 100%)' }} />
                </button>
            </div>
        )}

        <button onClick={() => setMenuState('PLAY_MODES')} className="mt-8 px-6 py-3 rounded-xl font-bold uppercase tracking-wide transition-colors hover:bg-slate-700/50"
          style={{ background: 'rgba(71,85,105,0.3)', border: '1px solid rgba(100,116,139,0.3)', color: '#94a3b8', fontFamily: 'Orbitron, monospace', fontSize: '0.9rem' }}>
            ← BACK TO MODES
        </button>
    </div>
  );

  const renderInfoPage = (title: string, content: string) => (
      <div className="max-w-md w-full p-8 rounded-3xl relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, rgba(30,41,59,0.9) 0%, rgba(15,23,42,0.95) 100%)', border: '1px solid rgba(148,163,184,0.2)', boxShadow: '0 20px 60px rgba(0,0,0,0.8)' }}>
          <h2 className="text-3xl font-black mb-6 tracking-wider" style={{ fontFamily: 'Orbitron, monospace', color: '#60a5fa' }}>{title}</h2>
          <p className="text-slate-300 mb-8 leading-relaxed">{content}</p>
          <button onClick={() => setMenuState('MAIN')} className="w-full py-4 rounded-xl font-bold uppercase tracking-wide"
            style={{ background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', border: '1px solid #475569', color: '#e2e8f0', fontFamily: 'Orbitron, monospace' }}>
            BACK TO HOME
          </button>
      </div>
  );

  // --- LOBBY SCREEN (Enhanced) ---
  if (isLobby) {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center text-white p-8 text-center relative overflow-hidden"
          style={{ background: 'radial-gradient(ellipse at center, #0f172a 0%, #020617 100%)' }}>
          <div className="absolute inset-0 opacity-10">
            <div style={{ backgroundImage: `linear-gradient(rgba(59,130,246,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.2) 1px, transparent 1px)`, backgroundSize: '50px 50px', animation: 'gridMove 20s linear infinite' }} className="absolute inset-0" />
          </div>

          <div className="relative z-10">
            <h1 className="text-4xl font-black mb-12 tracking-[0.3em] uppercase"
              style={{ fontFamily: 'Orbitron, monospace', color: '#60a5fa', textShadow: '0 0 20px rgba(59,130,246,0.6)', animation: 'pulse 2s ease-in-out infinite' }}>
              SEARCHING FOR OPPONENTS...
            </h1>
            
            <div className="grid grid-cols-2 gap-8 mb-16">
                {[...Array(4)].map((_, i) => {
                    const playerAddr = lobbyPlayers[i];
                    return (
                        <div key={i} className="w-48 h-40 rounded-2xl flex flex-col items-center justify-center transition-all duration-500"
                          style={{
                            background: playerAddr ? 'linear-gradient(135deg, rgba(16,185,129,0.2) 0%, rgba(5,150,105,0.3) 100%)' : 'rgba(30,41,59,0.5)',
                            border: playerAddr ? '2px solid rgba(52,211,153,0.5)' : '2px dashed rgba(71,85,105,0.3)',
                            boxShadow: playerAddr ? '0 0 30px rgba(16,185,129,0.3), inset 0 1px 0 rgba(255,255,255,0.05)' : '0 8px 20px rgba(0,0,0,0.3)'
                          }}>
                            <div className="text-5xl mb-3">{playerAddr ? '👤' : '⏳'}</div>
                            {playerAddr ? (
                                <>
                                    <p className="text-sm font-bold mb-2" style={{ color: '#6ee7b7', fontFamily: 'Orbitron, monospace' }}>PLAYER READY</p>
                                    <p className="text-xs font-mono px-3 py-1 rounded-lg" style={{ background: 'rgba(0,0,0,0.5)', color: '#94a3b8' }}>
                                        {playerAddr.slice(0,6)}...{playerAddr.slice(-4)}
                                    </p>
                                </>
                            ) : (<p className="text-sm text-slate-500 font-medium">WAITING...</p>)}
                        </div>
                    );
                })}
            </div>

            <div className="inline-flex items-center gap-4 px-8 py-4 rounded-full mb-12"
              style={{ background: 'rgba(30,41,59,0.8)', border: '1px solid rgba(71,85,105,0.4)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                <div className="w-3 h-3 rounded-full animate-pulse" style={{ background: '#10b981', boxShadow: '0 0 10px rgba(16,185,129,0.8)' }} />
                <span className="font-mono text-lg">
                    <span className="font-black text-2xl" style={{ color: '#fbbf24', fontFamily: 'Orbitron, monospace' }}>{lobbyPlayers.length}</span>
                    <span className="text-slate-300"> / 4 Players Ready</span>
                </span>
            </div>

            <button onClick={leaveGame} className="px-10 py-4 rounded-2xl font-bold uppercase tracking-wider"
                style={{ background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)', border: '2px solid #f87171', fontFamily: 'Orbitron, monospace', boxShadow: '0 0 30px rgba(220,38,38,0.4), 0 4px 20px rgba(0,0,0,0.4)' }}>
                CANCEL MATCHMAKING
            </button>
            <p className="text-xs text-slate-500 mt-8 max-w-md">Do not close this tab. The game will launch automatically once the lobby is full.</p>
          </div>
          <style jsx>{`@keyframes gridMove { 0% { transform: translateY(0); } 100% { transform: translateY(50px); } }`}</style>
        </div>
    );
  }

  // --- SCREEN SWITCHER ---
  if (screen === 'HOME') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 text-center relative overflow-hidden"
        style={{ background: 'radial-gradient(ellipse at top, #1e293b 0%, #0f172a 50%, #020617 100%)' }}>
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(15)].map((_, i) => (
            <div key={i} className="absolute rounded-full blur-2xl"
              style={{
                width: `${50 + Math.random() * 150}px`,
                height: `${50 + Math.random() * 150}px`,
                background: `radial-gradient(circle, rgba(59,130,246,${0.05 + Math.random() * 0.1}) 0%, transparent 70%)`,
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animation: `float ${8 + Math.random() * 8}s ease-in-out infinite`,
                animationDelay: `${Math.random() * 5}s`
              }}
            />
          ))}
        </div>

        <div className="relative z-10 w-full">
          {menuState === 'MAIN' && renderMainMenu()}
          {menuState === 'PLAY_MODES' && renderPlayModes()}
          {menuState === 'CASINO' && renderCasinoMenu()}
          {menuState === 'TUTORIAL' && renderInfoPage('How to Play', 'Spades take all. Bid wisely. Do not underbid your hand!')}
        </div>
        <style jsx>{`@keyframes float { 0%, 100% { transform: translateY(0) translateX(0); } 25% { transform: translateY(-30px) translateX(20px); } 50% { transform: translateY(-10px) translateX(-20px); } 75% { transform: translateY(-40px) translateX(10px); } }`}</style>
      </div>
    );
  }

  // --- GAME SCREEN ---
  if (!gameState) {
    return (
      <div className="h-screen flex items-center justify-center text-white relative overflow-hidden"
        style={{ background: 'radial-gradient(ellipse at center, #065f46 0%, #064e3b 50%, #022c22 100%)' }}>
        <div className="relative z-10 text-center">
          <div className="w-20 h-20 border-4 rounded-full mb-6 mx-auto"
            style={{ borderColor: '#10b981', borderTopColor: 'transparent', animation: 'spin 1s linear infinite', boxShadow: '0 0 30px rgba(16,185,129,0.5)' }} />
          <h2 className="text-2xl font-bold tracking-wide" style={{ fontFamily: 'Orbitron, monospace' }}>Loading Game State...</h2>
        </div>
        <style jsx>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const myIndex = gameState.players.findIndex((p:any) => p.id === myId);
  const me = gameState.players[myIndex >= 0 ? myIndex : 0];
  const isMyTurn = gameState.turn === myIndex;

  // Waiting/Initializing State
  if(gameState.status === 'WAITING' || gameState.status === 'INITIALIZING_ON_CHAIN') {
      return (
          <div className="min-h-screen flex flex-col items-center justify-center text-white p-8 text-center relative overflow-hidden"
            style={{ background: 'radial-gradient(ellipse at center, #0f172a 0%, #020617 100%)' }}>
              <div className="w-20 h-20 border-4 rounded-full mb-8 relative"
                style={{ borderColor: '#3b82f6', borderTopColor: 'transparent', animation: 'spin 1s linear infinite', boxShadow: '0 0 40px rgba(59,130,246,0.6)' }}>
                <div className="absolute inset-0 rounded-full" style={{ border: '4px solid transparent', borderTopColor: '#60a5fa', animation: 'spin 2s linear infinite reverse' }} />
              </div>
              <h2 className="text-3xl font-bold mb-3 tracking-wide" style={{ fontFamily: 'Orbitron, monospace', color: '#60a5fa' }}>
                  {gameState.status === 'INITIALIZING_ON_CHAIN' ? '⛓️ Verifying on Blockchain...' : 'Waiting for Players...'}
              </h2>
              <p className="text-slate-400 mb-8 text-lg">{gameState.players.filter((p:any) => p.id).length}/4 Players Joined</p>
              <div className="text-xs font-mono px-4 py-2 rounded-lg" style={{ background: 'rgba(30,41,59,0.6)', border: '1px solid rgba(71,85,105,0.3)', color: '#94a3b8' }}>Room: {gameState.roomId}</div>
              <style jsx>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
      )
  }

  const getValidIndices = () => {
     if(myIndex === -1 || !me) return [];
     if(gameState.turn !== myIndex || gameState.status !== 'PLAYING') return [];
     if(gameState.table.length === 0) return me.hand.map((_:any, i:number) => i);
     const leadSuit = gameState.table[0].card.s;
     const hasLead = me.hand.some((c:any) => c.s === leadSuit);
     const hasSpade = me.hand.some((c:any) => c.s === 'S');
     if(hasLead) return me.hand.map((c:any, i:number) => c.s === leadSuit ? i : -1);
     if(hasSpade) return me.hand.map((c:any, i:number) => c.s === 'S' ? i : -1);
     return me.hand.map((_:any, i:number) => i);
  };
  const validIndices = getValidIndices();

  const safeStyle = (styleObj: any) => styleObj || {};

  return (
    <div className="min-h-screen overflow-hidden relative select-none" style={{ background: 'radial-gradient(ellipse at center, #065f46 0%, #064e3b 40%, #022c22 100%)' }}>
      
      <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width="100" height="100" xmlns="http://www.w3.org/2000/svg"%3E%3Cfilter id="noise"%3E%3CfeTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" /%3E%3C/filter%3E%3Crect width="100" height="100" filter="url(%23noise)" opacity="0.3"/%3E%3C/svg%3E")', backgroundRepeat: 'repeat' }} />

      {/* Countdown Overlay */}
      {countdown !== null && countdown > 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-50"
            style={{ background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.98) 100%)', backdropFilter: 'blur(10px)' }}>
             <h1 className="text-4xl font-bold mb-12 tracking-[0.3em] uppercase"
               style={{ fontFamily: 'Orbitron, monospace', color: '#60a5fa', textShadow: '0 0 20px rgba(59,130,246,0.8)' }}>Game Starting</h1>
             <div className="text-[14rem] font-black leading-none mb-8"
               style={{ fontFamily: 'Orbitron, monospace', background: 'linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 0 60px rgba(59,130,246,0.6))', animation: 'bounceIn 0.5s ease-out' }}>
               {countdown}
             </div>
             <p className="text-slate-400 animate-pulse font-medium">Fetching Blockchain Random Seed...</p>
             <style jsx>{`@keyframes bounceIn { 0% { transform: scale(0.3); opacity: 0; } 50% { transform: scale(1.05); } 70% { transform: scale(0.9); } 100% { transform: scale(1); opacity: 1; } }`}</style>
          </div>
      )}

      {isDealing && <DealingOverlay onComplete={() => setIsDealing(false)} />}
      
      {showScoreboard && (
          <Scoreboard 
            scores={gameState.scores} 
            players={gameState.players} 
            onClose={() => setShowScoreboard(false)} 
            gameResultData={gameResultData} 
            onSubmitToChain={handleSubmitToChain} 
            onRequeue={handleRequeue} 
            onExit={handleExit}        
            currentUserId={myId}
          />
      )}

      {/* Top HUD Bar */}
      <div className="absolute top-0 w-full p-4 flex justify-between text-white z-20"
        style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.8) 0%, transparent 100%)', backdropFilter: 'blur(10px)' }}>
         <div className="flex items-center gap-4">
             <span className="font-bold px-4 py-2 rounded-lg" style={{ fontFamily: 'Orbitron, monospace', color: '#fbbf24', background: 'rgba(120,53,15,0.4)', border: '1px solid rgba(251,191,36,0.3)' }}>{gameState.roomId}</span>
             <span className="px-3 py-1 rounded-lg text-sm font-bold" style={{ background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.3)', color: '#93c5fd', fontFamily: 'Orbitron, monospace' }}>Round {gameState.round}/{gameState.maxRounds || 3}</span>
         </div>
         <div className="flex gap-3">
             <button onClick={() => setShowScoreboard(true)} className="px-4 py-2 rounded-lg text-sm font-bold" style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', border: '1px solid #60a5fa', fontFamily: 'Orbitron, monospace', boxShadow: '0 4px 15px rgba(59,130,246,0.3)' }}>📊 SCOREBOARD</button>
             <button onClick={leaveGame} className="px-4 py-2 rounded-lg text-sm font-bold" style={{ background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)', border: '1px solid #f87171', fontFamily: 'Orbitron, monospace', boxShadow: '0 4px 15px rgba(220,38,38,0.3)' }}>EXIT</button>
             <div className="px-5 py-2 rounded-full font-bold text-sm"
               style={{ fontFamily: 'Orbitron, monospace', background: isMyTurn ? 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)' : 'rgba(30,41,59,0.8)', color: isMyTurn ? '#7c2d12' : '#cbd5e1', border: isMyTurn ? '1px solid #fcd34d' : '1px solid rgba(71,85,105,0.3)', boxShadow: isMyTurn ? '0 0 20px rgba(251,191,36,0.5)' : 'none', animation: isMyTurn ? 'pulse 2s ease-in-out infinite' : 'none' }}>
                {isMyTurn ? "YOUR TURN" : (gameState.players[gameState.turn] ? `${gameState.players[gameState.turn].name}...` : "Waiting...")}
             </div>
         </div>
      </div>

      {/* Main Table */}
      <div className="absolute inset-0 flex items-center justify-center">
         <div className="relative rounded-full"
           style={{ width: '340px', height: '340px', background: 'radial-gradient(circle, #047857 0%, #065f46 70%, #064e3b 100%)', border: '20px solid #422006', boxShadow: `0 0 0 5px #78350f, inset 0 0 80px rgba(0,0,0,0.5), 0 30px 80px rgba(0,0,0,0.7)` }}>
            {/* Inner circle glow */}
            <div className="absolute inset-0 rounded-full opacity-30" style={{ boxShadow: 'inset 0 0 60px rgba(16,185,129,0.3)' }} />

            {/* CARDS ON TABLE */}
            {gameState.table.map((move: any, i: number) => {
               const pIdx = move.pIndex ?? 0; 
               const myIdxSafe = myIndex >= 0 ? myIndex : 0;
               const relativeIndex = (pIdx - myIdxSafe + 4) % 4;

               let posStyle: any = {};
               const standardPos = [
                  { bottom: '150px', left: '50%', transform: 'translateX(-50%)' }, 
                  { right: '150px', top: '50%', transform: 'translateY(-50%)' },  
                  { top: '150px', left: '50%', transform: 'translateX(-50%)' },   
                  { left: '150px', top: '50%', transform: 'translateY(-50%)' }   
               ][relativeIndex];

               if (!standardPos) posStyle = {}; 
               else posStyle = standardPos;

               if (gameState.trickWinner !== undefined && gameState.trickWinner !== null) {
                   const winnerRelativeIndex = (gameState.trickWinner - myIdxSafe + 4) % 4;
                   const targetPos = [
                      { bottom: '0px', left: '50%', opacity: 0, transform: 'translateX(-50%) scale(0.5)' },
                      { right: '0px', top: '50%', opacity: 0, transform: 'translateY(-50%) scale(0.5)' },
                      { top: '0px', left: '50%', opacity: 0, transform: 'translateX(-50%) scale(0.5)' },
                      { left: '0px', top: '50%', opacity: 0, transform: 'translateY(-50%) scale(0.5)' }
                   ][winnerRelativeIndex] || {}; 
                   
                   posStyle = { ...targetPos, transition: 'all 0.8s ease-in' };
               }

               return (
                  <div key={i} className="absolute z-10 transition-all duration-300" style={safeStyle(posStyle)}>
                      <Card card={move.card} />
                  </div>
               );
            })}

            {/* PLAYER AVATARS */}
            {gameState.players.map((p:any, i:number) => {
               const myIdxSafe = myIndex >= 0 ? myIndex : 0;
               const relativeIndex = (i - myIdxSafe + 4) % 4;
               
               const pos = [
                  { bottom: '-70px', left: '50%', transform: 'translateX(-50%)' },
                  { right: '-70px', top: '50%', transform: 'translateY(-50%)' },
                  { top: '-70px', left: '50%', transform: 'translateX(-50%)' },
                  { left: '-70px', top: '50%', transform: 'translateY(-50%)' }
               ][relativeIndex];

               if(!p.id) return (
                   <div key={i} className="absolute flex flex-col items-center opacity-50" style={safeStyle(pos)}>
                       <div className="w-16 h-16 rounded-full border-4 border-dashed border-gray-600 flex items-center justify-center text-white text-2xl">?</div>
                   </div>
               )
               
               const isActive = gameState.turn === i;
               
               return (
                  <div key={i} className="absolute flex flex-col items-center w-28" style={safeStyle(pos)}>
                      <div className="w-16 h-16 rounded-full flex items-center justify-center text-3xl relative"
                        style={{
                          background: isActive ? 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)' : 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                          border: isActive ? '3px solid #fcd34d' : '3px solid #475569',
                          boxShadow: isActive ? '0 0 30px rgba(251,191,36,0.8), inset 0 2px 10px rgba(0,0,0,0.3)' : '0 8px 20px rgba(0,0,0,0.5), inset 0 2px 10px rgba(0,0,0,0.3)'
                        }}
                      >
                          {p.avatar}
                      </div>
                      <div className="px-3 py-1 rounded-lg mt-2 font-bold text-sm truncate w-full text-center"
                        style={{ background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(71,85,105,0.3)', color: '#e2e8f0', fontFamily: 'Orbitron, monospace', fontSize: '0.7rem' }}>
                        {p.name}
                      </div>
                      {p.bid > 0 && (
                        <div className="px-3 py-1 rounded-full font-bold text-xs mt-1"
                          style={{ background: 'linear-gradient(135deg, #fef3c7 0%, #fcd34d 100%)', color: '#7c2d12', border: '1px solid #fbbf24', boxShadow: '0 2px 10px rgba(251,191,36,0.3)', fontFamily: 'Orbitron, monospace' }}>
                          {p.tricks}/{p.bid}
                        </div>
                      )}
                  </div>
               )
            })}
         </div>
      </div>

      {/* BIDDING MODAL */}
      {gameState.status === 'BIDDING' && isMyTurn && !isDealing && (
         <div className="absolute inset-0 z-40 flex items-center justify-center"
           style={{ background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.95) 100%)', backdropFilter: 'blur(10px)' }}>
            <div className="p-10 rounded-3xl text-center relative overflow-hidden"
              style={{ background: 'linear-gradient(135deg, rgba(30,41,59,0.95) 0%, rgba(15,23,42,0.98) 100%)', border: '2px solid rgba(59,130,246,0.3)', boxShadow: '0 0 60px rgba(59,130,246,0.4), 0 20px 80px rgba(0,0,0,0.8)', animation: 'scaleIn 0.3s ease-out' }}>
               <h2 className="text-4xl font-black mb-8 tracking-wider"
                 style={{ fontFamily: 'Orbitron, monospace', background: 'linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                 YOUR BID
               </h2>
               <div className="grid grid-cols-4 gap-4">
                  {[1,2,3,4,5,6,7,8].map(n => (
                      <button key={n} onClick={() => bid(n)} 
                        className="w-20 h-20 rounded-2xl font-black text-3xl group relative overflow-hidden"
                        style={{ background: 'linear-gradient(135deg, rgba(71,85,105,0.4) 0%, rgba(51,65,85,0.6) 100%)', border: '2px solid rgba(148,163,184,0.3)', color: '#e2e8f0', fontFamily: 'Orbitron, monospace', boxShadow: '0 4px 15px rgba(0,0,0,0.4)' }}>
                          <span className="relative z-10">{n}</span>
                          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.5) 0%, rgba(147,197,253,0.3) 100%)', transform: 'scale(1.1)' }} />
                      </button>
                  ))}
               </div>
               <style jsx>{`@keyframes scaleIn { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }`}</style>
            </div>
         </div>
      )}

      {/* PLAYER HAND */}
      {!isDealing && me && (
        <div className="absolute bottom-6 left-0 right-0 flex justify-center z-30">
            <div className="flex -space-x-8 hover:space-x-[-10px] transition-all px-4 pb-4">
                {me.hand.map((card: any, i: number) => {
                const isValid = validIndices.includes(i) && !isProcessing;
                return (
                    <div key={i} className="transition-all duration-300 origin-bottom"
                      style={{ transform: isValid && isMyTurn ? 'translateY(0)' : 'translateY(0) scale(0.95)', filter: isValid && isMyTurn ? 'brightness(1)' : 'brightness(0.6) saturate(0.7)', zIndex: isValid && isMyTurn ? 20 : 10 }}>
                        <Card card={card} isPlayable={isValid && isMyTurn} onClick={() => isValid && isMyTurn && playCard(i)} />
                    </div>
                )
                })}
            </div>
        </div>
      )}
    </div>
  );
}