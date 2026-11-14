/**
 * AIOrb Component (Zone 4)
 *
 * Futuristic 3D spherical AI intelligence orb matching the Stage 1 approved
 * emerald-and-cyan aesthetic while preserving functional request-driven states.
 * Pure React + CSS with zero external dependencies.
 *
 * Visual Specifications:
 * - 120–160px responsive 3D spherical body matching Stage 1 design system
 * - Bright emerald illumination on upper-left (#76F7BF / #38EA8E)
 * - Deep, dark teal/green spherical center (#08272D / #0A3030)
 * - Cyan illumination on lower-right edge (#2EBAE5 / #2B95B2)
 * - Subtle dimensional shading with glass-like volume and depth
 *
 * Real Request-Driven States:
 * - 'idle': Soft ambient breathing and clear standby illumination.
 * - 'analyzing': Dynamic energized rotation and accelerated shimmer during active in-flight analysis.
 * - 'success': Settled harmonious emerald glow on successful completion.
 * - 'error': Alert rose/amber illumination when an analysis error occurs.
 *
 * Accessibility & Safety:
 * - Purely decorative; tagged with aria-hidden="true".
 * - Fully respects prefers-reduced-motion via CSS media query and motion-reduce: utilities.
 * - Derived strictly from actual parent component request state.
 */

import { memo } from 'react'

const SIZE_MAP = {
  sm: 'w-16 h-16',
  md: 'w-28 h-28 sm:w-32 sm:h-32 md:w-36 md:h-36',
  lg: 'w-36 h-36 md:w-40 md:h-40',
}

function AIOrb({ state = 'idle', size = 'md', className = '' }) {
  const sizeClasses = SIZE_MAP[size] || SIZE_MAP.md

  const isAnalyzing = state === 'analyzing'
  const isSuccess = state === 'success'
  const isError = state === 'error'

  // Outer ambient glow matching state
  const haloBackground = isError
    ? 'radial-gradient(circle at 35% 30%, rgba(244,63,94,0.35) 0%, rgba(245,158,11,0.2) 45%, transparent 75%)'
    : isSuccess
    ? 'radial-gradient(circle at 35% 30%, rgba(16,185,129,0.4) 0%, rgba(56,234,142,0.22) 45%, transparent 75%)'
    : isAnalyzing
    ? 'radial-gradient(circle at 35% 30%, rgba(46,186,229,0.5) 0%, rgba(118,247,191,0.35) 45%, transparent 80%)'
    : 'radial-gradient(circle at 35% 30%, rgba(118,247,191,0.32) 0%, rgba(46,186,229,0.18) 50%, transparent 75%)'

  // Spherical base gradient
  const sphereBackground = isError
    ? 'radial-gradient(circle at 45% 45%, #2a0812 0%, #1c050c 42%, #120308 75%, #080203 100%)'
    : isSuccess
    ? 'radial-gradient(circle at 45% 45%, #0d3b2e 0%, #082d23 42%, #051d16 75%, #020d0a 100%)'
    : isAnalyzing
    ? 'radial-gradient(circle at 45% 45%, #0b373d 0%, #08282e 42%, #051c20 75%, #020c0e 100%)'
    : 'radial-gradient(circle at 45% 45%, #0a3233 0%, #08272d 42%, #061e22 75%, #031214 100%)'

  // Border & shadow styling
  const orbBorder = isError
    ? 'border-rose-400/40 shadow-[0_0_24px_rgba(244,63,94,0.25)]'
    : isSuccess
    ? 'border-emerald-400/50 shadow-[0_0_28px_rgba(16,185,129,0.3)]'
    : isAnalyzing
    ? 'border-cyan-400/50 shadow-[0_0_32px_rgba(46,186,229,0.35)] ring-1 ring-emerald-400/40'
    : 'border-emerald-400/30 shadow-[0_0_24px_rgba(16,185,129,0.2)]'

  return (
    <div
      aria-hidden="true"
      data-testid="zone4-ai-orb"
      className={`relative inline-flex items-center justify-center select-none pointer-events-none shrink-0 ${sizeClasses} ${className}`}
    >
      {/* 1. Restrained Ambient Halo Glow */}
      <div
        className={`absolute -inset-2 rounded-full blur-xl pointer-events-none transition-all duration-700 ${
          isAnalyzing ? 'scale-110 opacity-75' : 'opacity-45'
        } motion-reduce:transition-none motion-reduce:scale-100`}
        style={{ background: haloBackground }}
      />

      {/* 2. Main 3D Spherical Orb Body */}
      <div
        data-testid="zone4-orb-sphere"
        className={`relative w-full h-full rounded-full overflow-hidden border backdrop-blur-md transition-all duration-500 ${orbBorder}`}
        style={{ background: sphereBackground }}
      >
        {/* Layer A: Upper-Left Illumination (Emerald in normal/success/analyzing, Rose in error) */}
        <div
          className={`absolute inset-0 rounded-full pointer-events-none transition-opacity duration-500 ${
            isAnalyzing ? 'opacity-100' : 'opacity-90'
          }`}
          style={{
            background: isError
              ? 'radial-gradient(circle at 20% 20%, rgba(251, 113, 133, 0.95) 0%, rgba(244, 63, 94, 0.75) 16%, rgba(159, 18, 57, 0.35) 32%, transparent 48%)'
              : 'radial-gradient(circle at 20% 20%, rgba(118, 247, 191, 0.98) 0%, rgba(56, 234, 142, 0.8) 16%, rgba(22, 140, 90, 0.35) 32%, transparent 48%)',
          }}
        />

        {/* Layer B: Lower-Right Illumination (Cyan in normal/analyzing, Mint in success, Amber in error) */}
        <div
          className="absolute inset-0 rounded-full mix-blend-screen pointer-events-none"
          style={{
            background: isError
              ? 'radial-gradient(circle at 82% 82%, rgba(245, 158, 11, 0.85) 0%, rgba(180, 83, 9, 0.55) 16%, rgba(120, 53, 15, 0.25) 30%, transparent 46%)'
              : isSuccess
              ? 'radial-gradient(circle at 82% 82%, rgba(52, 211, 153, 0.9) 0%, rgba(16, 185, 129, 0.6) 16%, rgba(6, 95, 70, 0.25) 30%, transparent 46%)'
              : 'radial-gradient(circle at 82% 82%, rgba(46, 186, 229, 0.95) 0%, rgba(30, 150, 195, 0.65) 16%, rgba(14, 75, 100, 0.25) 30%, transparent 46%)',
          }}
        />

        {/* Layer C: Deep Center Core Volume (Preserves rich optical depth) */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background: isError
              ? 'radial-gradient(circle at 50% 50%, rgba(40, 6, 12, 0.75) 0%, rgba(25, 4, 8, 0.5) 45%, transparent 75%)'
              : 'radial-gradient(circle at 50% 50%, rgba(8, 39, 45, 0.75) 0%, rgba(6, 30, 34, 0.5) 45%, transparent 75%)',
          }}
        />

        {/* Layer D: Dimensional Rim Sheen & Inner Shadow */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            boxShadow: isError
              ? 'inset 2.5px 2.5px 6px rgba(251, 113, 133, 0.75), inset -2.5px -2.5px 8px rgba(245, 158, 11, 0.7), inset 0 0 20px rgba(18, 3, 6, 0.85)'
              : 'inset 2.5px 2.5px 6px rgba(118, 247, 191, 0.75), inset -2.5px -2.5px 8px rgba(46, 186, 229, 0.8), inset 0 0 20px rgba(4, 18, 20, 0.85)',
          }}
        />

        {/* Layer E: Internal Energetic Swirl (Accelerates only during active analysis) */}
        <div
          className={`absolute -top-1/4 -left-1/4 w-[150%] h-[150%] rounded-full mix-blend-screen pointer-events-none transition-all duration-700 ${
            isAnalyzing
              ? 'animate-orb-swirl-fast opacity-60'
              : isSuccess
              ? 'animate-orb-swirl-slow opacity-30'
              : 'animate-orb-swirl-slow opacity-20'
          } motion-reduce:animate-none`}
          style={{
            background: isError
              ? 'radial-gradient(circle at 35% 35%, rgba(244, 63, 94, 0.45) 0%, rgba(245, 158, 11, 0.15) 25%, transparent 50%)'
              : isAnalyzing
              ? 'radial-gradient(circle at 35% 35%, rgba(46, 186, 229, 0.6) 0%, rgba(118, 247, 191, 0.25) 25%, transparent 50%)'
              : 'radial-gradient(circle at 35% 35%, rgba(118, 247, 191, 0.5) 0%, rgba(52, 211, 153, 0.15) 25%, transparent 50%)',
          }}
        />

        {/* Layer F: Specular Highlight Pinpoint on Upper-Left */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background: isError
              ? 'radial-gradient(circle at 24% 20%, rgba(255, 255, 255, 0.55) 0%, rgba(251, 113, 133, 0.2) 10%, transparent 22%)'
              : 'radial-gradient(circle at 24% 20%, rgba(255, 255, 255, 0.55) 0%, rgba(118, 247, 191, 0.2) 10%, transparent 22%)',
          }}
        />
      </div>

      {/* Scoped Keyframes for Animation & Reduced Motion Override */}
      <style>{`
        @keyframes orbSwirlSlow {
          0% { transform: rotate(0deg) scale(1); }
          50% { transform: rotate(180deg) scale(1.06); }
          100% { transform: rotate(360deg) scale(1); }
        }
        @keyframes orbSwirlFast {
          0% { transform: rotate(0deg) scale(1); }
          50% { transform: rotate(180deg) scale(1.14); }
          100% { transform: rotate(360deg) scale(1); }
        }
        .animate-orb-swirl-slow {
          animation: orbSwirlSlow 14s ease-in-out infinite;
        }
        .animate-orb-swirl-fast {
          animation: orbSwirlFast 4s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-orb-swirl-slow,
          .animate-orb-swirl-fast {
            animation: none !important;
            transform: none !important;
            transition: none !important;
          }
          [data-testid="zone4-ai-orb"],
          [data-testid="zone4-ai-orb"] * {
            animation: none !important;
            transition: none !important;
          }
        }
      `}</style>
    </div>
  )
}

export default memo(AIOrb)
