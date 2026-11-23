'use client';

import React, { useEffect, useRef } from 'react';
import { Wind, Compass, ShieldAlert, CheckCircle2, AlertTriangle } from 'lucide-react';

interface WindDispersionVisualizerProps {
  windSpeed: number | null; // km/h
  windDirection: number | null; // degrees 0-360
  boundaryLayerHeight: number | null; // meters
  isThermalInversion: boolean;
}

export function WindDispersionVisualizer({
  windSpeed,
  windDirection,
  boundaryLayerHeight,
  isThermalInversion,
}: WindDispersionVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Check data availability: 0 km/h is valid calm air, null/undefined is unavailable
  const hasSpeed = typeof windSpeed === 'number' && Number.isFinite(windSpeed) && windSpeed >= 0;
  const hasDirection = typeof windDirection === 'number' && Number.isFinite(windDirection) && windDirection >= 0;
  const isAvailable = hasSpeed && hasDirection;

  const speed = windSpeed ?? 0;
  const direction = windDirection ?? 0;
  const blh = boundaryLayerHeight ?? null;

  // Particle simulation loop with reduced motion check
  useEffect(() => {
    if (!isAvailable) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Check prefers-reduced-motion
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let animationId: number;
    const width = (canvas.width = canvas.offsetWidth || 300);
    const height = (canvas.height = canvas.offsetHeight || 140);

    const particleCount = 40;
    const particles: Array<{ x: number; y: number; length: number; speed: number; opacity: number }> = [];

    // Wind direction represents azimuth FROM which wind blows; vector flows along (direction - 90 deg)
    const rad = ((direction - 90) * Math.PI) / 180;
    const vx = Math.cos(rad);
    const vy = Math.sin(rad);

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        length: 8 + Math.random() * 16,
        speed: Math.max(0.4, (speed / 15) * (0.8 + Math.random() * 0.6)),
        opacity: 0.15 + Math.random() * 0.45,
      });
    }

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Trapping boundary layer line when thermal inversion is active
      if (isThermalInversion) {
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(0, height * 0.35);
        ctx.lineTo(width, height * 0.35);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Draw wind stream particles
      ctx.lineWidth = 1.2;
      for (const p of particles) {
        ctx.strokeStyle = isThermalInversion
          ? `rgba(245, 158, 11, ${p.opacity})`
          : `rgba(16, 185, 129, ${p.opacity})`;

        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + vx * p.length, p.y + vy * p.length);
        ctx.stroke();

        // Advance particle if not reduced motion
        if (!prefersReducedMotion) {
          p.x += vx * p.speed;
          p.y += vy * p.speed;

          // Wrap around canvas edges
          if (p.x < -20) p.x = width + 10;
          if (p.x > width + 20) p.x = -10;
          if (p.y < -20) p.y = height + 10;
          if (p.y > height + 20) p.y = -10;
        }
      }

      if (!prefersReducedMotion) {
        animationId = requestAnimationFrame(render);
      }
    };

    render();

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [speed, direction, isThermalInversion, isAvailable]);

  // Compass cardinal direction
  const getCardinalDirection = (deg: number) => {
    const cardinals = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const idx = Math.round(deg / 22.5) % 16;
    return cardinals[idx];
  };

  if (!isAvailable) {
    return (
      <div className="relative overflow-hidden rounded-xl border border-stone-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/70 p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wind className="w-4 h-4 text-ink-muted dark:text-zinc-500" />
            <h3 className="text-xs font-bold uppercase tracking-wider font-mono text-ink dark:text-white">
              Atmospheric Dispersion &amp; Wind Stream
            </h3>
          </div>
          <span className="text-[11px] font-mono text-ink-muted dark:text-zinc-400">
            Wind Telemetry Unavailable
          </span>
        </div>
        <div className="py-8 text-center text-xs font-mono text-ink-muted dark:text-zinc-400">
          Wind speed and direction data is currently unavailable for this station. Zero synthetic velocity substituted.
        </div>
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label="Atmospheric Dispersion and Wind Stream Illustration"
      className="relative overflow-hidden rounded-xl border border-stone-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/70 p-4 shadow-sm space-y-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wind className="w-4 h-4 text-emerald-500" />
          <h3 className="text-xs font-bold uppercase tracking-wider font-mono text-ink dark:text-white">
            Atmospheric Dispersion &amp; Wind Stream
          </h3>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[11px] text-ink-muted dark:text-zinc-400">
          <Compass className="w-3.5 h-3.5" />
          <span>{getCardinalDirection(direction)} ({direction}°) • {speed} km/h</span>
        </div>
      </div>

      {/* Animated Stream Canvas */}
      <div
        role="img"
        aria-label={`Illustrative dispersion simulation showing ${speed} km/h wind from ${getCardinalDirection(direction)}${blh ? ` with a ${blh}m mixing depth` : ''}`}
        className="relative w-full h-24 rounded-lg overflow-hidden bg-stone-100 dark:bg-zinc-950 border border-stone-200/60 dark:border-zinc-800/60"
      >
        <canvas ref={canvasRef} className="w-full h-full block" />

        {/* Overlay Info Tag */}
        {blh !== null && (
          <div className="absolute bottom-2 left-2 px-2 py-1 rounded bg-black/70 backdrop-blur-sm text-[10px] font-mono text-white flex items-center gap-1.5">
            <span>Mixing Ceiling:</span>
            <strong className="text-emerald-400">{blh} m</strong>
          </div>
        )}

        {isThermalInversion && (
          <div className="absolute top-2 right-2 px-2 py-1 rounded bg-red-950/80 backdrop-blur-sm border border-red-500/50 text-[10px] font-mono text-red-300 flex items-center gap-1">
            <ShieldAlert className="w-3 h-3 text-red-400" />
            <span>Inversion Trap Active</span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1 pt-1 text-xs text-ink-muted dark:text-zinc-400">
        <div className="flex items-start gap-2 leading-relaxed">
          {isThermalInversion ? (
            <>
              <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <span>
                <strong>Stagnant Dispersion:</strong> Low wind ({speed} km/h) combined with a shallow thermal boundary layer{blh ? ` (~${blh} m)` : ''} traps particulate matter near ground level. Limit outdoor exertion.
              </span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <span>
                <strong>Active Dispersion:</strong> Boundary layer expanded{blh ? ` to ~${blh} m` : ''} with favorable {getCardinalDirection(direction)} wind flow promoting particulate vertical dilution.
              </span>
            </>
          )}
        </div>
        <p className="text-[10px] font-mono text-stone-400 dark:text-zinc-500 pt-0.5">
          *Illustrative dispersion model for qualitative visualization (not point-scale CFD).
        </p>
      </div>
    </div>
  );
}
