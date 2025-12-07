"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/landing/ui/button"
import { motion } from "framer-motion"

export default function LoginPage() {
  const router = useRouter()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    router.push('/inbox')
  }

  return (
    <main className="min-h-screen bg-landing-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-landing-accent/20 rounded-full blur-[120px] pointer-events-none opacity-50" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] bg-purple-400/20 rounded-full blur-[100px] pointer-events-none opacity-50" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md bg-white/70 backdrop-blur-xl border border-white/40 shadow-glass rounded-3xl p-8 md:p-10 relative z-10"
      >
        <div className="text-center mb-8">
          <Link href="/" className="inline-block text-2xl font-heading font-extrabold text-landing-primary mb-2 hover:scale-105 transition-transform">
            Travel Dreams
          </Link>
          <h1 className="text-2xl font-bold text-landing-secondary">Welcome back</h1>
          <p className="text-landing-secondary/80 text-sm mt-2">Log in to continue your adventure.</p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label className="text-sm font-medium text-landing-secondary ml-1">Email</label>
            <input
              type="email"
              placeholder="you@example.com"
              className="w-full px-4 py-3 rounded-xl bg-white/50 border border-white/60 focus:outline-none focus:ring-2 focus:ring-landing-accent/50 focus:bg-white transition-all text-landing-primary placeholder:text-landing-secondary/40"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-landing-secondary ml-1">Password</label>
            <input
              type="password"
              placeholder="••••••••"
              className="w-full px-4 py-3 rounded-xl bg-white/50 border border-white/60 focus:outline-none focus:ring-2 focus:ring-landing-accent/50 focus:bg-white transition-all text-landing-primary placeholder:text-landing-secondary/40"
            />
          </div>

          <Button
            type="submit"
            className="w-full bg-landing-accent hover:bg-landing-accent/90 text-white rounded-xl h-12 font-semibold shadow-lg shadow-landing-accent/20 mt-6 text-lg"
          >
            Log In
          </Button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-sm text-landing-secondary">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="font-semibold text-landing-accent hover:underline">
              Sign up
            </Link>
          </p>
        </div>
      </motion.div>
    </main>
  )
}
