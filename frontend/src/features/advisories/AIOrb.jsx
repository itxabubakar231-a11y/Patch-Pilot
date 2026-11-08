/**
 * AIOrb Component (Zone 4)
 *
 * Futuristic glowing cyan & violet AI sphere inspired by SmoothUI Siri Orb.
 * Pure React + CSS with zero external dependencies.
 *
 * States:
 * - 'idle': Subtle ambient breathing and soft halo pulse.
 * - 'analyzing': Dynamic energized rotation with accelerated shimmer during in-flight analysis.
 * - 'success': Harmonious emerald-cyan settling aura on successful completion.
 * - 'error': Alert rose-amber glow when analysis fails or backend is unreachable.
 *
 * Accessibility & Safety:
 * - Purely decorative; tagged with aria-hidden="true".
 * - Fully respects prefers-reduced-motion via CSS media query and Tailwind motion-reduce:.
 * - Derived strictly from actual parent component request state.
 */

import { memo } from 'react'

const SIZE_MAP = {
  sm: 'w-10 h-10 md:w-12 md:h-12',
  md: 'w-16 h-16 md:w-20 md:h-20',
  lg: 'w-24 h-24 md:w-28 md:h-28',
}

function AIOrb({ state = 'idle', size = 'md', className = '' }) {
  const sizeClasses = SIZE_MAP[size] || SIZE_MAP.md

  const isAnalyzing = state === 'analyzing'
  const isSuccess = state === 'success'
  const isError = state === 'error'

  const haloGlow = isAnalyzing
    ? 'from-sky-500/40 via-purple-500/35 to-transparent scale-125'
    : isSuccess
    ? 'from-emerald-500/30 via-sky-500/25 to-transparent scale-110'
    : isError
    ? 'from-rose-500/35 via-amber-500/25 to-transparent scale-110'
    : 'from-sky-500/25 via-purple-600/20 to-transparent scale-100'

  const orbBorder = isAnalyzing
    ? 'border-sky-400/60 ring-2 ring-purple-500/40 shadow-sky-500/20'
    : isSuccess
    ? 'border-emerald-400/50 ring-1 ring-emerald-500/30 shadow-emerald-500/20'
    : isError
    ? 'border-rose-400/50 ring-1 ring-amber-500/30 shadow-rose-500/20'
    : 'border-sky-500/30 shadow-sky-950/40'

  return (
    <div
      aria-hidden="true"
      className={`relative inline-flex items-center justify-center select-none pointer-events-none shrink-0 ${sizeClasses} ${className}`}
    >
      {/* Outer ambient blur halo */}
      <div
        className={`absolute inset-0 rounded-full transition-all duration-700 blur-xl ${haloGlow} motion-reduce:transition-none motion-reduce:scale-100`}
        style={{
          background: isError
            ? 'radial-gradient(circle, rgba(244,63,94,0.35) 0%, rgba(245,158,11,0.2) 50%, transparent 75%)'
            : isSuccess
            ? 'radial-gradient(circle, rgba(16,185,129,0.35) 0%, rgba(56,189,248,0.2) 50%, transparent 75%)'
            : isAnalyzing
            ? 'radial-gradient(circle, rgba(56,189,248,0.45) 0%, rgba(168,85,247,0.35) 50%, transparent 75%)'
            : 'radial-gradient(circle, rgba(56,189,248,0.25) 0%, rgba(147,51,234,0.2) 50%, transparent 75%)',
        }}
      />

      {/* Outer subtle orbital ring */}
      <div
        className={`absolute -inset-1.5 rounded-full border border-sky-400/20 border-dashed transition-all duration-500 ${
          isAnalyzing ? 'animate-spin-slow opacity-80' : 'opacity-40'
        } motion-reduce:animate-none`}
      />

      {/* Main glass sphere */}
      <div
        className={`relative w-full h-full rounded-full border shadow-2xl overflow-hidden backdrop-blur-md transition-all duration-500 ${orbBorder}`}
        style={{
          background: isError
            ? 'radial-gradient(circle at 35% 35%, #4c0519 0%, #1e1b4b 60%, #030712 100%)'
            : isSuccess
            ? 'radial-gradient(circle at 35% 35%, #064e3b 0%, #0c4a6e 60%, #030712 100%)'
            : 'radial-gradient(circle at 35% 35%, #0369a1 0%, #312e81 60%, #030712 100%)',
        }}
      >
        {/* Layer 1: Animated gradient mesh blob 1 (Primary energy) */}
        <div
          className={`absolute -top-1/4 -left-1/4 w-[150%] h-[150%] rounded-full opacity-70 mix-blend-screen transition-all duration-700 ${
            isAnalyzing ? 'animate-orb-swirl-fast' : 'animate-orb-swirl-slow'
          } motion-reduce:animate-none`}
          style={{
            background: isError
              ? 'radial-gradient(circle at 50% 50%, #f43f5e 0%, rgba(244,63,94,0) 65%)'
              : isSuccess
              ? 'radial-gradient(circle at 50% 50%, #10b981 0%, rgba(16,185,129,0) 65%)'
              : 'radial-gradient(circle at 50% 50%, #38bdf8 0%, rgba(56,189,248,0) 65%)',
          }}
        />

        {/* Layer 2: Animated gradient mesh blob 2 (Counter balance violet) */}
        <div
          className={`absolute -bottom-1/4 -right-1/4 w-[150%] h-[150%] rounded-full opacity-65 mix-blend-screen transition-all duration-700 ${
            isAnalyzing ? 'animate-orb-counter-fast' : 'animate-orb-counter-slow'
          } motion-reduce:animate-none`}
          style={{
            background: isError
              ? 'radial-gradient(circle at 50% 50%, #f59e0b 0%, rgba(245,158,11,0) 65%)'
              : isSuccess
              ? 'radial-gradient(circle at 50% 50%, #06b6d4 0%, rgba(6,182,212,0) 65%)'
              : 'radial-gradient(circle at 50% 50%, #a855f7 0%, rgba(168,85,247,0) 65%)',
          }}
        />

        {/* Layer 3: Dynamic center pulse core */}
        <div
          className={`absolute inset-2 rounded-full opacity-50 mix-blend-overlay ${
            isAnalyzing ? 'animate-pulse' : 'animate-orb-breathe'
          } motion-reduce:animate-none`}
          style={{
            background: isError
              ? 'radial-gradient(circle, #fda4af 0%, transparent 70%)'
              : isSuccess
              ? 'radial-gradient(circle, #6ee7b7 0%, transparent 70%)'
              : 'radial-gradient(circle, #7dd3fc 0%, transparent 70%)',
          }}
        />

        {/* Layer 4: Glass specular reflection highlight */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background:
              'radial-gradient(circle at 32% 28%, rgba(255,255,255,0.65) 0%, rgba(255,255,255,0.15) 25%, rgba(255,255,255,0) 55%)',
          }}
        />
      </div>

      {/* Embedded scoped keyframes */}
      <style>{`
        @keyframes orbSwirlSlow {
          0% { transform: rotate(0deg) scale(1); }
          50% { transform: rotate(180deg) scale(1.08); }
          100% { transform: rotate(360deg) scale(1); }
        }
        @keyframes orbSwirlFast {
          0% { transform: rotate(0deg) scale(1); }
          50% { transform: rotate(180deg) scale(1.18); }
          100% { transform: rotate(360deg) scale(1); }
        }
        @keyframes orbCounterSlow {
          0% { transform: rotate(360deg) scale(1.05); }
          50% { transform: rotate(180deg) scale(0.95); }
          100% { transform: rotate(0deg) scale(1.05); }
        }
        @keyframes orbCounterFast {
          0% { transform: rotate(360deg) scale(1.15); }
          50% { transform: rotate(180deg) scale(0.9); }
          100% { transform: rotate(0deg) scale(1.15); }
        }
        @keyframes orbBreathe {
          0%, 100% { transform: scale(0.96); opacity: 0.45; }
          50% { transform: scale(1.04); opacity: 0.7; }
        }
        @keyframes spinSlow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-orb-swirl-slow { animation: orbSwirlSlow 6s ease-in-out infinite; }
        .animate-orb-swirl-fast { animation: orbSwirlFast 1.8s ease-in-out infinite; }
        .animate-orb-counter-slow { animation: orbCounterSlow 7s ease-in-out infinite; }
        .animate-orb-counter-fast { animation: orbCounterFast 2s ease-in-out infinite; }
        .animate-orb-breathe { animation: orbBreathe 4s ease-in-out infinite; }
        .animate-spin-slow { animation: spinSlow 12s linear infinite; }

        @media (prefers-reduced-motion: reduce) {
          .animate-orb-swirl-slow,
          .animate-orb-swirl-fast,
          .animate-orb-counter-slow,
          .animate-orb-counter-fast,
          .animate-orb-breathe,
          .animate-spin-slow {
            animation: none !important;
            transform: none !important;
          }
        }
      `}</style>
    </div>
  )
}

export default memo(AIOrb)

