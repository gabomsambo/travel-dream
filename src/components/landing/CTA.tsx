"use client";

import { Button } from "@/components/landing/ui/button";
import { motion } from "framer-motion";
import Link from "next/link";

export default function CTA() {
    const scrollToTop = () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    return (
        <section id="cta" className="py-32 bg-landing-surface/30">
            <div className="container mx-auto px-6 text-center max-w-2xl">
                <motion.h2
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="font-heading text-4xl md:text-5xl font-bold mb-6 text-landing-primary"
                >
                    Start with just one place.
                </motion.h2>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.1 }}
                    className="text-xl text-landing-secondary mb-10 leading-relaxed"
                >
                    <p>You don’t have to plan a whole trip today.</p>
                    <p>Just give your first idea somewhere to live.</p>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.2 }}
                    className="flex flex-col items-center gap-6"
                >
                    <Link href="/signup">
                        <Button variant="cta" size="lg" className="h-14 px-10 text-lg">
                            Start with one place
                        </Button>
                    </Link>

                    <button
                        onClick={scrollToTop}
                        className="text-landing-secondary hover:text-landing-primary transition-colors text-sm underline-offset-4 hover:underline"
                    >
                        No pressure. Just explore.
                    </button>
                </motion.div>
            </div>
        </section>
    );
}
