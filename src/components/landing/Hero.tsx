"use client";

import { Button } from "@/components/landing/ui/button";
import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";

// Extended vibrant assets
const baseDestinations = [
    { src: "/dest_amalfi_1765074636643.png", alt: "Amalfi Coast", label: "Amalfi" },
    { src: "/dest_tokyo_1765075165500.png", alt: "Tokyo Neon", label: "Tokyo" },
    { src: "/dest_santorini_1765075151456.png", alt: "Santorini", label: "Oia" },
    { src: "/dest_bali_1765074675659.png", alt: "Bali Jungle", label: "Ubud" },
    { src: "/dest_nyc_1765075203417.png", alt: "New York City", label: "NYC" },
    { src: "/dest_iceland_1765074661409.png", alt: "Iceland Aurora", label: "Reykjavik" },
    { src: "/dest_petra_1765075216695.png", alt: "Petra Jordan", label: "Petra" },
    { src: "/dest_alps_1765075177036.png", alt: "Swiss Alps", label: "Zermatt" },
    { src: "/dest_kyoto_1765074648985.png", alt: "Kyoto Nights", label: "Kyoto" },
    { src: "/dest_patagonia_1765075242693.png", alt: "Patagonia", label: "Fitz Roy" },
    { src: "/dest_maldives_1765075229024.png", alt: "Maldives", label: "Malé" },
    { src: "/dest_safari_1765075189019.png", alt: "African Safari", label: "Serengeti" },
];

// Duplicate 4 times for seamless infinite loop with massive buffer
// 4 sets of 12 = 48 items
// Animation moves -50% (sliding past 2 full sets), keeping 2 sets remaining.
const destinations = [
    ...baseDestinations, ...baseDestinations,
    ...baseDestinations, ...baseDestinations
];

export default function Hero() {
    return (
        <section className="relative min-h-[90vh] flex flex-col justify-center overflow-hidden bg-landing-background pt-20">

            {/* Helper gradient for text readability at top */}
            <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-landing-background to-transparent z-10 pointer-events-none" />

            <div className="container mx-auto px-6 text-center relative z-20 mb-12">


                <motion.h1
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.1 }}
                    className="font-heading text-6xl md:text-8xl font-extrabold leading-[1] tracking-tight text-landing-primary mb-8 mt-16"
                >
                    All the places <br />
                    you <span className="text-transparent bg-clip-text bg-gradient-to-r from-landing-accent to-landing-teal">want to go.</span>
                </motion.h1>

                <motion.p
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.2 }}
                    className="text-xl md:text-2xl text-landing-secondary max-w-2xl mx-auto mb-10"
                >
                    Don't let them fade in your camera roll. <br />
                    <span className="font-semibold text-landing-primary">Capture the excitement. Plan the adventure.</span>
                </motion.p>

                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, delay: 0.4 }}
                >
                    <Link href="/signup">
                        <Button className="bg-landing-accent hover:bg-landing-accent/90 text-white rounded-full px-12 h-16 text-xl font-bold shadow-neon hover:scale-105 transition-all duration-300">
                            Start Exploring
                        </Button>
                    </Link>
                </motion.div>
            </div>

            {/* Infinite Marquee */}
            <div className="relative w-full overflow-hidden py-10 rotate-[-2deg] scale-110">
                {/* 
                - animate-marquee moves to -50%.
                - Content is 4 sets of 12 items (48 total).
                - Moves past 24 items (2 sets).
                - Set 3 starts exactly where Set 1 started. Loop is seamless.
                - Slower duration (120s) because list is much longer now.
             */}
                <div className="flex gap-6 w-max animate-[marquee_120s_linear_infinite] will-change-transform">
                    {destinations.map((dest, i) => (
                        <div key={i} className="relative w-[300px] h-[450px] rounded-3xl overflow-hidden shadow-2xl shrink-0 group transform transition-transform hover:scale-[1.02] hover:rotate-0">
                            <Image
                                src={dest.src}
                                alt={dest.alt}
                                fill
                                className="object-cover group-hover:scale-110 transition-transform duration-700"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-60 group-hover:opacity-40 transition-opacity" />
                            <div className="absolute bottom-6 left-6 text-white">
                                <p className="font-heading font-bold text-3xl tracking-wide">{dest.label}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Bottom gradient fade */}
            <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-landing-background to-transparent z-10 pointer-events-none" />

        </section>
    );
}
