"use client";

import { motion } from "framer-motion";

export default function Feelings() {
    return (
        <section className="py-40 bg-primary text-[#FDFCF8] relative overflow-hidden">
            {/* Background noise texture or gradient could go here */}

            <div className="container mx-auto px-6 text-center">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.8 }}
                >
                    <p className="text-landing-accent font-bold tracking-widest uppercase mb-6">The Feeling</p>
                    <h2 className="font-heading text-5xl md:text-7xl lg:text-8xl font-bold leading-tight mb-12">
                        Less noise. <br />
                        <span className="text-white/50">More clarity.</span>
                    </h2>

                    <div className="max-w-2xl mx-auto space-y-6 text-lg md:text-2xl font-light text-white/80 leading-relaxed">
                        <p>It’s the relief of knowing nothing is lost.</p>
                        <p>The joy of watching your dream places slowly take shape.</p>
                    </div>
                </motion.div>
            </div>
        </section>
    );
}
