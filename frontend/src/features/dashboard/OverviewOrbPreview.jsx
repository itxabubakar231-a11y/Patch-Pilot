/**
 * OverviewOrbPreview Component (Zone 1)
 *
 * Dedicated visual recreation of the approved Zone 1 decorative AI Orb.
 * Distinct from Zone 4's functional AIOrb component.
 *
 * Exact specifications matching authentic 1672x941 reference:
 * - 125px diameter 3D spherical body
 * - Bright emerald illumination on upper-left (#76F7BF / #38EA8E)
 * - Deep, dark teal/green spherical center (#08272D / #0A3030)
 * - Cyan illumination on lower-right edge (#2EBAE5 / #2B95B2)
 * - Subtle dimensional shading without center blackout or over-illumination
 * - Purely decorative with aria-hidden="true" and motion-reduce safety
 */

import { memo } from 'react'

function OverviewOrbPreview({ className = '' }) {
  return (
    <div
      aria-hidden="true"
      data-testid="overview-orb-preview"
      className={`relative inline-flex items-center justify-center select-none pointer-events-none shrink-0 w-[125px] h-[125px] ${className}`}
    >
      {/* 1. Restrained Ambient Halo Glow (Hugs the 125px perimeter) */}
      <div
        className="absolute -inset-1.5 rounded-full blur-lg opacity-45 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 35% 30%, rgba(118, 247, 191, 0.4) 0%, rgba(52, 211, 153, 0.2) 30%, rgba(46, 186, 229, 0.18) 60%, transparent 78%)',
        }}
      />

      {/* 2. Main 125px 3D Spherical Orb Body */}
      <div
        data-testid="overview-orb-sphere"
        className="relative w-[125px] h-[125px] rounded-full overflow-hidden shadow-[0_0_24px_rgba(16,185,129,0.25)] border border-emerald-400/30"
        style={{
          // Deep, dark teal/green spherical base core matching authentic reference samples (#08272d / #0a3030)
          background:
            'radial-gradient(circle at 45% 45%, #0a3233 0%, #08272d 42%, #061e22 75%, #031214 100%)',
        }}
      >
        {/* Layer A: Bright Emerald Illumination on Upper-Left (Confined to upper-left crest) */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background:
              'radial-gradient(circle at 20% 20%, rgba(118, 247, 191, 0.98) 0%, rgba(56, 234, 142, 0.8) 16%, rgba(22, 140, 90, 0.35) 32%, transparent 48%)',
          }}
        />

        {/* Layer B: Cyan Illumination on Lower-Right Edge (Confined to lower-right rim) */}
        <div
          className="absolute inset-0 rounded-full mix-blend-screen pointer-events-none"
          style={{
            background:
              'radial-gradient(circle at 82% 82%, rgba(46, 186, 229, 0.95) 0%, rgba(30, 150, 195, 0.65) 16%, rgba(14, 75, 100, 0.25) 30%, transparent 46%)',
          }}
        />

        {/* Layer C: Deep Dark Teal/Green Core Volume (Keeps center deep without blacking out) */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background:
              'radial-gradient(circle at 50% 50%, rgba(8, 39, 45, 0.75) 0%, rgba(6, 30, 34, 0.5) 45%, transparent 75%)',
          }}
        />

        {/* Layer D: Subtle Dimensional Shading & Edge Rim Sheen */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            boxShadow:
              'inset 2.5px 2.5px 6px rgba(118, 247, 191, 0.75), inset -2.5px -2.5px 8px rgba(46, 186, 229, 0.8), inset 0 0 20px rgba(4, 18, 20, 0.85)',
          }}
        />

        {/* Layer E: Gentle Ambient Swirl (Organic crystalline life, motion-reduce safe) */}
        <div
          className="absolute -top-1/4 -left-1/4 w-[150%] h-[150%] rounded-full opacity-20 mix-blend-screen animate-orb-swirl-slow motion-reduce:animate-none pointer-events-none"
          style={{
            background:
              'radial-gradient(circle at 35% 35%, rgba(118, 247, 191, 0.5) 0%, rgba(52, 211, 153, 0.15) 25%, transparent 50%)',
          }}
        />

        {/* Layer F: Soft Specular Crest Pinpoint on Upper-Left */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background:
              'radial-gradient(circle at 24% 20%, rgba(255, 255, 255, 0.55) 0%, rgba(118, 247, 191, 0.2) 10%, transparent 22%)',
          }}
        />
      </div>
    </div>
  )
}

export default memo(OverviewOrbPreview)
