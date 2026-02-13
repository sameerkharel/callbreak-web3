'use client';
import React from 'react';

const Card = ({ card, onClick, isPlayable }: any) => {
  const isRed = card.s === 'H' || card.s === 'D';
  const label = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[card.r] || card.r;
  const suit = { 'S':'♠', 'H':'♥', 'D':'♦', 'C':'♣' }[card.s as string];
  
  return (
    <div 
      onClick={isPlayable ? onClick : undefined}
      className={`
        relative w-20 h-32 md:w-24 md:h-36 rounded-xl select-none transition-all duration-300
        ${isPlayable ? 'cursor-pointer' : 'opacity-60 saturate-50'}
      `}
      style={{
        transformStyle: 'preserve-3d',
        transform: isPlayable ? 'translateZ(0)' : 'translateZ(0) scale(0.95)',
      }}
    >
      {/* Holographic glow effect */}
      {isPlayable && (
        <div className="absolute inset-0 rounded-xl blur-xl opacity-75 animate-pulse"
          style={{
            background: isRed 
              ? 'radial-gradient(circle, rgba(239,68,68,0.6) 0%, transparent 70%)'
              : 'radial-gradient(circle, rgba(59,130,246,0.6) 0%, transparent 70%)'
          }}
        />
      )}
      
      {/* Main card body */}
      <div className={`
        relative w-full h-full rounded-xl border-2 backdrop-blur-sm
        flex flex-col justify-between p-2 overflow-hidden
        shadow-[0_8px_32px_0_rgba(0,0,0,0.8)]
        ${isRed 
          ? 'bg-gradient-to-br from-red-950/90 via-red-900/80 to-rose-950/90 border-red-500/50' 
          : 'bg-gradient-to-br from-slate-950/90 via-blue-950/80 to-indigo-950/90 border-blue-500/50'}
        ${isPlayable ? 'hover:scale-110 hover:-translate-y-6 hover:rotate-2 hover:shadow-2xl hover:border-opacity-100' : ''}
      `}>
        
        {/* Chromatic aberration effect overlay */}
        <div className="absolute inset-0 opacity-20 mix-blend-overlay pointer-events-none"
          style={{
            background: `repeating-linear-gradient(
              0deg,
              transparent,
              transparent 2px,
              ${isRed ? 'rgba(239,68,68,0.1)' : 'rgba(59,130,246,0.1)'} 2px,
              ${isRed ? 'rgba(239,68,68,0.1)' : 'rgba(59,130,246,0.1)'} 4px
            )`
          }}
        />
        
        {/* Geometric pattern */}
        <div className="absolute top-0 right-0 w-16 h-16 opacity-10">
          <svg viewBox="0 0 100 100" className={isRed ? 'text-red-400' : 'text-blue-400'}>
            <path d="M0,0 L100,0 L100,100 Z" fill="currentColor" />
            <circle cx="50" cy="50" r="30" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
        </div>
        
        {/* Top value */}
        <div className={`
          font-black text-xl leading-none z-10 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]
          ${isRed ? 'text-red-400' : 'text-blue-300'}
        `} style={{ fontFamily: 'Orbitron, monospace' }}>
          {label}
          <span className="ml-1 text-2xl">{suit}</span>
        </div>
        
        {/* Center suit watermark */}
        <div className={`
          absolute inset-0 flex items-center justify-center pointer-events-none
          ${isRed ? 'text-red-500/20' : 'text-blue-500/20'}
        `}>
          <span className="text-7xl font-bold" style={{ 
            textShadow: isRed 
              ? '0 0 20px rgba(239,68,68,0.5)' 
              : '0 0 20px rgba(59,130,246,0.5)'
          }}>
            {suit}
          </span>
        </div>
        
        {/* Bottom value (rotated) */}
        <div className={`
          font-black text-xl leading-none rotate-180 text-right z-10 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]
          ${isRed ? 'text-red-400' : 'text-blue-300'}
        `} style={{ fontFamily: 'Orbitron, monospace' }}>
          {label}
          <span className="ml-1 text-2xl">{suit}</span>
        </div>
        
        {/* Neon edge glow */}
        {isPlayable && (
          <div className={`
            absolute inset-0 rounded-xl pointer-events-none
            ${isRed ? 'shadow-[inset_0_0_20px_rgba(239,68,68,0.3)]' : 'shadow-[inset_0_0_20px_rgba(59,130,246,0.3)]'}
          `} />
        )}
      </div>
      
      {/* Corner accent lights */}
      {isPlayable && (
        <>
          <div className={`absolute top-0 left-0 w-2 h-2 rounded-full ${isRed ? 'bg-red-500' : 'bg-blue-500'} blur-sm`} />
          <div className={`absolute bottom-0 right-0 w-2 h-2 rounded-full ${isRed ? 'bg-red-500' : 'bg-blue-500'} blur-sm`} />
        </>
      )}
    </div>
  );
};

export default Card;
