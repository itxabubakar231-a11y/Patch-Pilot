/**
 * GlowCard Component
 *
 * SmoothUI-inspired cursor-following spotlight glow card for cybersecurity dashboards.
 * Creates an elegant radial-gradient spotlight on both the card border and surface
 * using vanilla React, CSS custom properties, and Tailwind CSS.
 *
 * Features & Guardrails:
 * - Tracks cursor (x, y) coordinates relative to card bounds.
 * - Dual-layer spotlight:
 *   1. Outer 1px perimeter illuminating border with accent glow (cyan/emerald/amber/rose).
 *   2. Inner surface radial gradient for deep-navy cybersecurity atmosphere.
 * - Smooth 200–300ms transition on hover enter/leave.
 * - Purely decorative overlays use pointer-events-none (never block clicks or selections).
 * - Disables cursor tracking on touch devices (pointer: coarse) or when prefers-reduced-motion is active.
 * - Zero external animation libraries required (100% standard React & Tailwind).
 */

import { useState, useRef, useEffect, useCallback } from 'react'

const COLOR_MAP = {
  cyan: {
    border: 'rgba(56, 189, 248, 0.45)', // Sky / Cyan (#38BDF8)
    surface: 'rgba(56, 189, 248, 0.08)',
    shadow: 'rgba(56, 189, 248, 0.15)',
  },
  emerald: {
    border: 'rgba(52, 211, 153, 0.45)', // Emerald (#34D399)
    surface: 'rgba(52, 211, 153, 0.08)',
    shadow: 'rgba(52, 211, 153, 0.15)',
  },
  amber: {
    border: 'rgba(251, 191, 36, 0.45)', // Amber (#FBBF24)
    surface: 'rgba(251, 191, 36, 0.08)',
    shadow: 'rgba(251, 191, 36, 0.15)',
  },
  rose: {
    border: 'rgba(251, 113, 133, 0.45)', // Rose (#FB7185)
    surface: 'rgba(251, 113, 133, 0.08)',
    shadow: 'rgba(251, 113, 133, 0.15)',
  },
  slate: {
    border: 'rgba(148, 163, 184, 0.35)', // Slate (#94A3B8)
    surface: 'rgba(148, 163, 184, 0.05)',
    shadow: 'rgba(148, 163, 184, 0.10)',
  },
}

export default function GlowCard({
  children,
  color = 'cyan',
  className = '',
  innerClassName = '',
  ...props
}) {
  const containerRef = useRef(null)
  const [isHovered, setIsHovered] = useState(false)
  const [isDisabled, setIsDisabled] = useState(false)

  // Detect touch devices and reduced-motion preferences
  useEffect(() => {
    if (typeof window === 'undefined') return

    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const pointerQuery = window.matchMedia('(pointer: coarse)')

    const checkCapabilities = () => {
      const isTouch = pointerQuery.matches
      const isReduced = reducedMotionQuery.matches
      setIsDisabled(isTouch || isReduced)
    }

    checkCapabilities()

    if (reducedMotionQuery.addEventListener) {
      reducedMotionQuery.addEventListener('change', checkCapabilities)
      pointerQuery.addEventListener('change', checkCapabilities)
      return () => {
        reducedMotionQuery.removeEventListener('change', checkCapabilities)
        pointerQuery.removeEventListener('change', checkCapabilities)
      }
    }
  }, [])

  const handleMouseMove = useCallback(
    (e) => {
      if (isDisabled || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top

      // High-performance CSS variable update: avoids React component re-rendering
      containerRef.current.style.setProperty('--mouse-x', `${x}px`)
      containerRef.current.style.setProperty('--mouse-y', `${y}px`)
    },
    [isDisabled]
  )

  const handleMouseEnter = useCallback(() => {
    if (!isDisabled) {
      setIsHovered(true)
    }
  }, [isDisabled])

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false)
  }, [])

  const colorConfig = COLOR_MAP[color] || COLOR_MAP.cyan

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`group relative rounded-xl p-[1px] transition-all duration-300 ${className}`}
      {...props}
    >
      {/* 1. Border Glow Layer (visible through 1px wrapper perimeter) */}
      <div
        className="pointer-events-none absolute inset-0 rounded-xl transition-opacity duration-300 ease-out"
        style={{
          opacity: isHovered && !isDisabled ? 1 : 0,
          background: `radial-gradient(280px circle at var(--mouse-x, -999px) var(--mouse-y, -999px), ${colorConfig.border}, transparent 70%)`,
        }}
        aria-hidden="true"
      />

      {/* 2. Static Base Border & Ambient Drop Shadow */}
      <div
        className="pointer-events-none absolute inset-0 rounded-xl border border-slate-800/80 transition-colors duration-200 group-hover:border-slate-700/60 group-focus-within:border-slate-600/80"
        style={{
          boxShadow: isHovered && !isDisabled ? `0 0 20px -5px ${colorConfig.shadow}` : 'none',
          transition: 'box-shadow 300ms ease, border-color 200ms ease',
        }}
        aria-hidden="true"
      />

      {/* 3. Inner Card Surface with Radial Spotlight Glow */}
      <div
        className={`relative h-full rounded-[11px] bg-slate-900/40 p-5 backdrop-blur-sm overflow-hidden flex flex-col justify-between ${innerClassName}`}
      >
        {/* Surface Glow Layer */}
        <div
          className="pointer-events-none absolute inset-0 rounded-[11px] transition-opacity duration-300 ease-out"
          style={{
            opacity: isHovered && !isDisabled ? 1 : 0,
            background: `radial-gradient(350px circle at var(--mouse-x, -999px) var(--mouse-y, -999px), ${colorConfig.surface}, transparent 65%)`,
          }}
          aria-hidden="true"
        />

        {/* 4. Interactive Content Layer (strictly in foreground) */}
        <div className="relative z-10 flex flex-col justify-between h-full">
          {children}
        </div>
      </div>
    </div>
  )
}

