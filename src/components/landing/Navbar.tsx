"use client";

import Link from "next/link";
import { Button } from "@/components/landing/ui/button";
import { motion, useScroll, useMotionValueEvent } from "framer-motion";
import { useState } from "react";

export default function Navbar() {
    const { scrollY } = useScroll();
    const [visible, setVisible] = useState(true);
    const [lastScrollY, setLastScrollY] = useState(0);

    useMotionValueEvent(scrollY, "change", (latest) => {
        // Hide navbar on scroll down, show on scroll up
        if (latest > lastScrollY && latest > 100) {
            setVisible(false);
        } else {
            setVisible(true);
        }
        setLastScrollY(latest);
    });

    const scrollToSection = (id: string) => {
        const element = document.getElementById(id);
        if (element) {
            element.scrollIntoView({ behavior: "smooth" });
        }
    };

    return (
        <motion.div
            className="fixed top-6 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none"
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: visible ? 0 : -100, opacity: visible ? 1 : 0 }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
        >
            <nav className="pointer-events-auto bg-white/70 backdrop-blur-xl border border-white/40 shadow-glass rounded-full px-6 py-3 flex items-center gap-8 max-w-4xl w-full justify-between">
                <Link href="/" className="text-lg font-heading font-extrabold text-landing-primary tracking-tight">
                    Tabi Dreams
                </Link>

                <div className="hidden md:flex items-center space-x-6">
                    <button onClick={() => scrollToSection("how-it-works")} className="text-sm font-medium text-landing-secondary hover:text-landing-primary transition-colors">
                        How it works
                    </button>
                    <button onClick={() => scrollToSection("freedom")} className="text-sm font-medium text-landing-secondary hover:text-landing-primary transition-colors">
                        Freedom
                    </button>
                    <button onClick={() => scrollToSection("who")} className="text-sm font-medium text-landing-secondary hover:text-landing-primary transition-colors">
                        Who is it for?
                    </button>
                </div>

                <div className="flex items-center space-x-3">
                    <Button variant="ghost" className="hidden sm:inline-flex text-landing-secondary hover:text-landing-primary" onClick={() => scrollToSection("faq")}>
                        FAQ
                    </Button>
                    <Link href="/login">
                        <Button variant="ghost" className="text-landing-secondary hover:text-landing-primary font-medium">
                            Log in
                        </Button>
                    </Link>
                    <Link href="/signup">
                        <Button
                            className="bg-landing-accent hover:bg-landing-accent/90 text-white rounded-full px-6 h-10 font-semibold shadow-lg shadow-accent/20 transition-all hover:scale-105"
                        >
                            Start collecting
                        </Button>
                    </Link>
                </div>
            </nav>
        </motion.div>
    );
}
