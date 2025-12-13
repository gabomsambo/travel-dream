"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { signIn } from "next-auth/react"
import { useState, Suspense } from "react"
import { Button } from "@/components/landing/ui/button"
import { motion } from "framer-motion"

function SignupForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') || '/inbox'
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    const formData = new FormData(e.currentTarget)
    const name = formData.get("name") as string
    const email = formData.get("email") as string
    const password = formData.get("password") as string

    try {
      const registerResponse = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      })

      const registerData = await registerResponse.json()

      if (!registerResponse.ok) {
        setError(registerData.error || "Registration failed")
        setLoading(false)
        return
      }

      const signInResult = await signIn("credentials", {
        email,
        password,
        redirect: false,
      })

      if (signInResult?.error) {
        setError("Account created but sign-in failed. Please log in manually.")
        setLoading(false)
        router.push("/login")
      } else {
        router.push(callbackUrl)
      }
    } catch {
      setError("Something went wrong. Please try again.")
      setLoading(false)
    }
  }

  const handleGoogleSignUp = async () => {
    setLoading(true)
    await signIn("google", { callbackUrl })
  }

  return (
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
        <h1 className="text-2xl font-bold text-landing-secondary">Start your journey</h1>
        <p className="text-landing-secondary/80 text-sm mt-2">Create an account to start collecting places.</p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-200 text-red-700 rounded-xl text-sm">
          {error}
        </div>
      )}

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <label className="text-sm font-medium text-landing-secondary ml-1">Full Name</label>
          <input
            name="name"
            type="text"
            required
            placeholder="Your Name"
            className="w-full px-4 py-3 rounded-xl bg-white/50 border border-white/60 focus:outline-none focus:ring-2 focus:ring-landing-accent/50 focus:bg-white transition-all text-landing-primary placeholder:text-landing-secondary/40"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-landing-secondary ml-1">Email</label>
          <input
            name="email"
            type="email"
            required
            placeholder="you@example.com"
            className="w-full px-4 py-3 rounded-xl bg-white/50 border border-white/60 focus:outline-none focus:ring-2 focus:ring-landing-accent/50 focus:bg-white transition-all text-landing-primary placeholder:text-landing-secondary/40"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-landing-secondary ml-1">Password</label>
          <input
            name="password"
            type="password"
            required
            minLength={8}
            placeholder="At least 8 characters"
            className="w-full px-4 py-3 rounded-xl bg-white/50 border border-white/60 focus:outline-none focus:ring-2 focus:ring-landing-accent/50 focus:bg-white transition-all text-landing-primary placeholder:text-landing-secondary/40"
          />
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="w-full bg-landing-accent hover:bg-landing-accent/90 text-white rounded-xl h-12 font-semibold shadow-lg shadow-landing-accent/20 mt-6 text-lg disabled:opacity-50"
        >
          {loading ? "Creating account..." : "Create Account"}
        </Button>
      </form>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-landing-secondary/20"></div>
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-2 bg-white/70 text-landing-secondary/60">Or continue with</span>
        </div>
      </div>

      <Button
        type="button"
        onClick={handleGoogleSignUp}
        disabled={loading}
        variant="outline"
        className="w-full rounded-xl h-12 font-semibold bg-white/50 border border-white/60 hover:bg-white/80 text-landing-secondary disabled:opacity-50"
      >
        <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
          <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Continue with Google
      </Button>

      <div className="mt-8 text-center">
        <p className="text-sm text-landing-secondary">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-landing-accent hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </motion.div>
  )
}

export default function SignupPage() {
  return (
    <main className="min-h-screen bg-landing-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-landing-accent/20 rounded-full blur-[120px] pointer-events-none opacity-50" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-landing-teal/20 rounded-full blur-[100px] pointer-events-none opacity-50" />
      <Suspense fallback={<div className="text-landing-secondary">Loading...</div>}>
        <SignupForm />
      </Suspense>
    </main>
  )
}
