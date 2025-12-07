import Navbar from "@/components/landing/Navbar"
import Hero from "@/components/landing/Hero"
import Problem from "@/components/landing/Problem"
import TravelCloset from "@/components/landing/TravelCloset"
import HowItWorks from "@/components/landing/HowItWorks"
import Freedom from "@/components/landing/Freedom"
import WhoItsFor from "@/components/landing/WhoItsFor"
import Feelings from "@/components/landing/Feelings"
import CTA from "@/components/landing/CTA"
import FAQ from "@/components/landing/FAQ"
import Footer from "@/components/landing/Footer"

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-landing-background">
      <Navbar />
      <Hero />
      <Problem />
      <TravelCloset />
      <HowItWorks />
      <Freedom />
      <WhoItsFor />
      <Feelings />
      <CTA />
      <FAQ />
      <Footer />
    </main>
  )
}
