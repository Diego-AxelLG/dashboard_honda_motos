"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Card, Text, Title } from "@tremor/react";
import { motion } from "framer-motion";
import api from "@/lib/api";
import { CLIENT_NAME, CLIENT_TAGLINE } from "@/lib/constants";
import ParticleField from "@/components/login/ParticleField";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { data } = await api.post<{ access_token: string }>(
        "/api/v1/auth/login",
        { email, password },
      );
      localStorage.setItem("token", data.access_token);
      router.push("/");
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Error al iniciar sesión";
      // Axios wraps the response — try to extract detail
      const axiosErr = err as { response?: { data?: { detail?: string } } };
      setError(axiosErr.response?.data?.detail ?? msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-br from-[#05080f] via-[#0a1628] to-[#0d0d1a]">
      {/* Particle field (behind everything) */}
      <ParticleField
        maxParticles={450}
        driftSpeed={0.35}
        interactive
        repulsionRadius={150}
      />

      {/* Centered card */}
      <section className="relative z-10 flex min-h-screen items-center justify-center px-4">
        {/* Fade-in + slide-up entrance */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          {/* Slow levitation loop */}
          <motion.div
            animate={{ y: [-4, 4, -4] }}
            transition={{
              duration: 7,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            <Card className="w-full max-w-md !border-white/[0.08] !bg-white/[0.04] p-8 text-center !shadow-[0_8px_40px_rgba(0,212,255,0.06)] backdrop-blur-xl !ring-0">
              <Title className="!text-2xl font-semibold tracking-tight !text-[#F5F5F7]">
                {CLIENT_NAME}
              </Title>
              <Text className="mt-2 !text-sm !text-[#F5F5F7]/50">
                {CLIENT_TAGLINE}
              </Text>

              {/* Login form */}
              <form onSubmit={handleSubmit} className="mt-8 space-y-4 text-left">
                {/* Email */}
                <div>
                  <label
                    htmlFor="email"
                    className="mb-1.5 block text-xs font-medium text-[#F5F5F7]/60"
                  >
                    Correo electrónico
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="usuario@empresa.com"
                    className="w-full rounded-lg border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm text-[#F5F5F7] placeholder-[#F5F5F7]/25 outline-none transition-colors focus:border-[#00D4FF]/40 focus:ring-1 focus:ring-[#00D4FF]/20"
                  />
                </div>

                {/* Password */}
                <div>
                  <label
                    htmlFor="password"
                    className="mb-1.5 block text-xs font-medium text-[#F5F5F7]/60"
                  >
                    Contraseña
                  </label>
                  <input
                    id="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-lg border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm text-[#F5F5F7] placeholder-[#F5F5F7]/25 outline-none transition-colors focus:border-[#00D4FF]/40 focus:ring-1 focus:ring-[#00D4FF]/20"
                  />
                </div>

                {/* Error message */}
                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400"
                  >
                    {error}
                  </motion.p>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg border border-[#00D4FF]/20 bg-[#00D4FF]/10 px-4 py-2.5 text-sm font-medium text-[#00D4FF] transition-all duration-300 hover:bg-[#00D4FF]/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg
                        className="h-4 w-4 animate-spin"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                      Iniciando sesión…
                    </span>
                  ) : (
                    "Iniciar sesión"
                  )}
                </button>
              </form>

              <Text className="mt-6 !text-xs !text-[#F5F5F7]/30">
                Acceso exclusivo para personal autorizado
              </Text>
            </Card>
          </motion.div>
        </motion.div>
      </section>
    </main>
  );
}
