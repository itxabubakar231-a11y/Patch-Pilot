/**
 * GlowCard Component
 *
 * Minimal, high-performance cursor spotlight card for cybersecurity SaaS.
 * Provides subtle interactive spotlight on hover with zero external libraries.
 * Features restrained borders and surfaces adhering to Linear/Cloudflare design discipline.
 */

import { useState, useRef, useEffect, useCallback } from 'react'

const COLOR_MAP = {
  cyan: {
    border: 'rgba(56, 189, 248, 0.25)',
    surface: 'rgba(56, 189, 248, 0.03)',
  },
  teal: {
    border: 'rgba(20, 184, 166, 0.25)',
    surface: 'rgba(20, 184, 166, 0.03)',
  },
  emerald: {
    border: 'rgba(16, 185, 129, 0.25)',
    surface: 'rgba(16, 185, 129, 0.03)',
  },
  amber: {
    border: 'rgba(245, 158, 11, 0.25)',
    surface: 'rgba(245, 158, 11, 0.03)',
  },
  rose: {
    border: 'rgba(244, 63, 94, 0.25)',
    surface: 'rgba(244, 63, 94, 0.03)',
  },
  slate: {
    border: 'rgba(148, 163, 184, 0.15)',
    surface: 'rgba(148, 163, 184, 0.02)',
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
      className={`group relative rounded-xl p-[1px] transition-colors duration-200 ${className}`}
      {...props}
    >
      {/* 1. Subtle Spotlight Perimeter Border */}
      <div
        className="pointer-events-none absolute inset-0 rounded-xl transition-opacity duration-200 ease-out"
        style={{
          opacity: isHovered && !isDisabled ? 1 : 0,
          background: `radial-gradient(220px circle at var(--mouse-x, -999px) var(--mouse-y, -999px), ${colorConfig.border}, transparent 70%)`,
        }}
        aria-hidden="true"
      />

      {/* 2. Static Perimeter Border */}
      <div
        className="pointer-events-none absolute inset-0 rounded-xl border border-white/[0.08] transition-colors duration-150 group-hover:border-white/[0.14]"
        aria-hidden="true"
      />

      {/* 3. Inner Card Surface with Restrained Spotlight */}
      <div
        className={`relative h-full rounded-[11px] bg-[#121A2B]/60 p-4 backdrop-blur-xl overflow-hidden flex flex-col justify-between ${innerClassName}`}
      >
        {/* Surface Spotlight */}
        <div
          className="pointer-events-none absolute inset-0 rounded-[11px] transition-opacity duration-200 ease-out"
          style={{
            opacity: isHovered && !isDisabled ? 1 : 0,
            background: `radial-gradient(300px circle at var(--mouse-x, -999px) var(--mouse-y, -999px), ${colorConfig.surface}, transparent 65%)`,
          }}
          aria-hidden="true"
        />

        {/* 4. Interactive Content Layer */}
        <div className="relative z-10 flex flex-col justify-between h-full">
          {children}
        </div>
      </div>
    </div>
  )
}
