"use client";

import { useEffect, useRef, useCallback } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Particle {
  x: number;
  y: number;
  /** Original (rest) position */
  ox: number;
  oy: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  color: string;
  shape: "dot" | "dash";
  /** Per-particle phase offset for sinusoidal drift */
  phase: number;
  /** Drift amplitude */
  amp: number;
}

export interface ParticleFieldProps {
  maxParticles?: number;
  /** Base drift speed multiplier (0–1 range recommended) */
  driftSpeed?: number;
  /** Whether particles react to mouse with soft repulsion */
  interactive?: boolean;
  /** Repulsion radius in px */
  repulsionRadius?: number;
  /** Custom color palette */
  colors?: string[];
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_COLORS = [
  "#F5F5F7", // Zero-G White
  "#00D4FF", // Ion Glow Blue
  "#7FFFD4", // Quantum Mint
  "#FF4081", // Gravity Well Pink
];

const DEFAULT_MAX = 400;
const DEFAULT_DRIFT = 0.3;
const DEFAULT_RADIUS = 140;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hexToRgba(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function buildField(
  w: number,
  h: number,
  count: number,
  colors: string[],
): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    particles.push({
      x,
      y,
      ox: x,
      oy: y,
      vx: 0,
      vy: 0,
      size: Math.random() * 2.2 + 0.8,
      alpha: Math.random() * 0.3 + 0.12,
      color: colors[Math.floor(Math.random() * colors.length)],
      shape: Math.random() > 0.65 ? "dash" : "dot",
      phase: Math.random() * Math.PI * 2,
      amp: Math.random() * 18 + 6,
    });
  }
  return particles;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ParticleField({
  maxParticles = DEFAULT_MAX,
  driftSpeed = DEFAULT_DRIFT,
  interactive = true,
  repulsionRadius = DEFAULT_RADIUS,
  colors = DEFAULT_COLORS,
}: ParticleFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const mouseRef = useRef({ x: -9999, y: -9999 });
  const rafRef = useRef<number | null>(null);
  const viewportRef = useRef({ width: 0, height: 0 });
  const startTimeRef = useRef(Date.now());

  const handleResize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;

    viewportRef.current = { width: w, height: h };
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext("2d");
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    particlesRef.current = buildField(w, h, maxParticles, colors);
    startTimeRef.current = Date.now();
  }, [maxParticles, colors]);

  useEffect(() => {
    handleResize();

    const onMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    const onMouseLeave = () => {
      mouseRef.current = { x: -9999, y: -9999 };
    };

    window.addEventListener("resize", handleResize);
    if (interactive) {
      window.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseleave", onMouseLeave);
    }

    const animate = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const { width: w, height: h } = viewportRef.current;
      ctx.clearRect(0, 0, w, h);

      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      const particles = particlesRef.current;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // --- Sinusoidal micro-gravity drift ---
        const driftX =
          Math.sin(elapsed * driftSpeed * 0.7 + p.phase) * p.amp * 0.6;
        const driftY =
          Math.cos(elapsed * driftSpeed * 0.5 + p.phase * 1.3) * p.amp;

        // Target = original pos + drift offset
        const targetX = p.ox + driftX;
        const targetY = p.oy + driftY;

        // --- Mouse repulsion (antigravity) ---
        if (interactive) {
          const dx = p.x - mx;
          const dy = p.y - my;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < repulsionRadius && dist > 0) {
            const force =
              ((repulsionRadius - dist) / repulsionRadius) * 2.5;
            const angle = Math.atan2(dy, dx);
            p.vx += Math.cos(angle) * force;
            p.vy += Math.sin(angle) * force;
          }
        }

        // --- Spring towards target (very soft) ---
        const springK = 0.015;
        p.vx += (targetX - p.x) * springK;
        p.vy += (targetY - p.y) * springK;

        // --- Low friction (suspended feel) ---
        p.vx *= 0.94;
        p.vy *= 0.94;

        p.x += p.vx;
        p.y += p.vy;

        // --- Render ---
        const pulseAlpha =
          p.alpha *
          (0.7 + 0.3 * Math.sin(elapsed * 1.2 + p.phase));

        ctx.globalAlpha = pulseAlpha;

        if (p.shape === "dash") {
          const dashW = p.size * 3.5;
          const dashH = p.size * 0.5;
          const grad = ctx.createLinearGradient(
            p.x,
            p.y,
            p.x + dashW,
            p.y,
          );
          grad.addColorStop(0, hexToRgba(p.color, 0));
          grad.addColorStop(0.5, hexToRgba(p.color, 0.6));
          grad.addColorStop(1, hexToRgba(p.color, 0));
          ctx.fillStyle = grad;
          ctx.fillRect(p.x, p.y, dashW, dashH);
        } else {
          const cx = p.x;
          const cy = p.y;
          const r = p.size;
          const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
          grad.addColorStop(0, hexToRgba(p.color, 0.8));
          grad.addColorStop(1, hexToRgba(p.color, 0));
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.globalAlpha = 1;
      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseleave", onMouseLeave);
      particlesRef.current = [];
    };
  }, [handleResize, interactive, driftSpeed, repulsionRadius]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-0"
      aria-hidden="true"
    />
  );
}
