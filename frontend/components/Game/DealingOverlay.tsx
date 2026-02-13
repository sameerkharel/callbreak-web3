'use client';
import React, { useEffect, useState } from 'react';

const DealingOverlay = ({ onComplete }: any) => {
    const [step, setStep] = useState(0);
    const [particles, setParticles] = useState<Array<{id: number, x: number, y: number}>>([]);

    useEffect(() => {
        // Generate random particles
        const newParticles = Array.from({length: 20}, (_, i) => ({
            id: i,
            x: Math.random() * 100,
            y: Math.random() * 100
        }));
        setParticles(newParticles);

        const interval = setInterval(() => setStep(prev => prev + 1), 100);
        const timer = setTimeout(() => {
            clearInterval(interval);
            onComplete();
        }, 2000);
        return () => { clearTimeout(timer); clearInterval(interval); };
    }, []);

    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none overflow-hidden"
          style={{
            background: 'radial-gradient(circle at center, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.8) 100%)'
          }}>
          
          {/* Animated grid background */}
          <div className="absolute inset-0 opacity-20">
            <div className="absolute inset-0" style={{
              backgroundImage: `
                linear-gradient(rgba(59,130,246,0.1) 1px, transparent 1px),
                linear-gradient(90deg, rgba(59,130,246,0.1) 1px, transparent 1px)
              `,
              backgroundSize: '50px 50px',
              animation: 'gridScroll 20s linear infinite'
            }} />
          </div>

          {/* Floating particles */}
          {particles.map(p => (
            <div
              key={p.id}
              className="absolute w-1 h-1 bg-blue-400 rounded-full"
              style={{
                left: `${p.x}%`,
                top: `${p.y}%`,
                animation: `float ${3 + Math.random() * 2}s ease-in-out infinite`,
                animationDelay: `${Math.random() * 2}s`,
                opacity: 0.6,
                boxShadow: '0 0 10px rgba(59,130,246,0.8)'
              }}
            />
          ))}

          {/* Card dealing animation */}
          <div className="relative">
            {[0, 1, 2, 3].map(playerIdx => (
              [0,1,2,3,4].map(cardIdx => {
                const hasFlown = step > (playerIdx * 5 + cardIdx);
                const rotation = [0, 90, 180, 270][playerIdx]; 
                const distance = 300; 
                
                return (
                  <div 
                    key={`${playerIdx}-${cardIdx}`}
                    className="absolute w-20 h-32 rounded-xl border-2 transition-all duration-500 ease-out"
                    style={{
                      top: 0, 
                      left: 0,
                      background: 'linear-gradient(135deg, rgba(30,58,138,0.9) 0%, rgba(17,24,39,0.9) 100%)',
                      borderColor: hasFlown ? 'rgba(59,130,246,0.3)' : 'rgba(59,130,246,0.8)',
                      boxShadow: hasFlown 
                        ? '0 0 0 rgba(59,130,246,0)' 
                        : '0 0 30px rgba(59,130,246,0.6), inset 0 0 20px rgba(59,130,246,0.2)',
                      transform: hasFlown 
                        ? `rotate(${rotation}deg) translateY(${distance}px)` 
                        : `rotate(${rotation}deg) translateY(0px)`,
                      opacity: hasFlown ? 0 : 1 
                    }}
                  >
                    {/* Card back pattern */}
                    <div className="w-full h-full relative overflow-hidden rounded-lg">
                      <div className="absolute inset-0 opacity-30"
                        style={{
                          background: `repeating-conic-gradient(from 45deg, #1e3a8a 0deg 90deg, #1e293b 90deg 180deg)`
                        }}
                      />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-12 h-12 border-2 border-blue-400/50 rounded-full animate-spin" 
                          style={{ animationDuration: '3s' }} 
                        />
                      </div>
                    </div>
                  </div>
                )
              })
            ))}
          </div>

          {/* Central text with neon glow */}
          <div className="absolute flex flex-col items-center gap-4">
            <h2 
              className="text-white font-black text-4xl tracking-[0.3em] uppercase mt-40"
              style={{
                fontFamily: 'Orbitron, monospace',
                textShadow: `
                  0 0 10px rgba(59,130,246,0.8),
                  0 0 20px rgba(59,130,246,0.6),
                  0 0 30px rgba(59,130,246,0.4),
                  0 4px 10px rgba(0,0,0,0.5)
                `,
                animation: 'neonPulse 2s ease-in-out infinite'
              }}
            >
              DEALING
            </h2>
            
            {/* Loading bar */}
            <div className="w-64 h-1 bg-slate-800/50 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-500 rounded-full"
                style={{
                  width: `${(step / 20) * 100}%`,
                  transition: 'width 0.1s linear',
                  boxShadow: '0 0 20px rgba(59,130,246,0.8)'
                }}
              />
            </div>
          </div>

          <style jsx>{`
            @keyframes float {
              0%, 100% { transform: translateY(0) translateX(0); }
              50% { transform: translateY(-20px) translateX(10px); }
            }
            @keyframes gridScroll {
              0% { transform: translateY(0); }
              100% { transform: translateY(50px); }
            }
            @keyframes neonPulse {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.7; }
            }
          `}</style>
        </div>
    )
}

export default DealingOverlay;
