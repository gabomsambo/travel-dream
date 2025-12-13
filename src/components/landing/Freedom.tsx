"use client";

import { motion } from "framer-motion";
import { FileText, Map, Table, Database, Youtube, Instagram, FileSpreadsheet, Globe } from "lucide-react";

// Input Sources (Left side)
const inputs = [
    { label: "Notion", icon: Database, color: "bg-black text-white", delay: 0, y: -80 },
    { label: "Google Sheets", icon: FileSpreadsheet, color: "bg-green-100 text-green-600", delay: 2, y: 40 },
    { label: "TikTok", icon: Globe, color: "bg-black text-pink-500", delay: 4, y: -40 }, // Using Globe as placeholder for social
    { label: "Instagram", icon: Instagram, color: "bg-pink-100 text-pink-600", delay: 1, y: 80 },
    { label: "Excel", icon: Table, color: "bg-green-50 text-green-700", delay: 3, y: 0 },
];

// Output Formats (Right side)
const outputs = [
    { label: "PDF Itinerary", icon: FileText, color: "bg-red-100 text-red-600", delay: 0.5, y: -60 },
    { label: "Google Maps", icon: Map, color: "bg-blue-100 text-blue-600", delay: 2.5, y: 50 },
    { label: "KML File", icon: Globe, color: "bg-blue-50 text-blue-500", delay: 4.5, y: 0 },
    { label: "Excel Export", icon: FileSpreadsheet, color: "bg-green-100 text-green-600", delay: 1.5, y: -90 },
];

export default function Freedom() {
    return (
        <section id="freedom" className="py-32 bg-landing-background relative overflow-hidden">

            {/* Background Gradients */}
            <div className="absolute inset-0 opacity-30 pointer-events-none">
                <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-surface to-transparent" />
            </div>

            <div className="container mx-auto px-6 relative z-10">

                <div className="text-center mb-24">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="inline-block px-4 py-1.5 rounded-full border border-teal/20 bg-landing-teal/5 text-teal text-sm font-bold tracking-widest uppercase mb-6"
                    >
                        Universal Adapter
                    </motion.div>
                    <motion.h2
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.1 }}
                        className="font-heading text-5xl md:text-6xl font-extrabold text-landing-primary mb-6"
                    >
                        Import from anywhere. <br className="hidden md:block" />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-landing-teal to-landing-accent">Export to everywhere.</span>
                    </motion.h2>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2 }}
                        className="text-xl text-landing-secondary max-w-2xl mx-auto leading-relaxed"
                    >
                        We play nice with the tools you already use. Tabi Dreams is the glue that holds your scattered plans together.
                    </motion.p>
                </div>

                {/* The Pipeline Visual */}
                <div className="relative h-[400px] w-full max-w-6xl mx-auto flex items-center justify-center">

                    {/* LEFT: Inputs Flowing In */}
                    <div className="absolute left-0 top-0 bottom-0 w-1/2 overflow-hidden pointer-events-none fade-mask-left">
                        {inputs.map((item, i) => (
                            <motion.div
                                key={item.label}
                                className={`absolute left-0 p-3 pr-6 rounded-r-full shadow-lg flex items-center gap-3 border border-black/5 ${item.color} bg-white`}
                                style={{ top: `50%`, marginTop: item.y }}
                                initial={{ x: -200, opacity: 0 }}
                                animate={{
                                    x: ["-100%", "300%"], // Move across towards center
                                    opacity: [0, 1, 1, 0],
                                    scale: [0.8, 1, 1, 0.5]
                                }}
                                transition={{
                                    duration: 8,
                                    repeat: Infinity,
                                    delay: item.delay,
                                    ease: "linear"
                                }}
                            >
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center bg-white/50 backdrop-blur-sm`}>
                                    <item.icon size={16} />
                                </div>
                                <span className="font-bold whitespace-nowrap text-sm">{item.label}</span>
                            </motion.div>
                        ))}
                    </div>

                    {/* CENTER: The Hub */}
                    <div className="relative z-20 w-32 h-32 md:w-40 md:h-40">
                        {/* Pulsing Rings */}
                        <motion.div
                            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
                            transition={{ duration: 3, repeat: Infinity }}
                            className="absolute inset-0 bg-landing-teal/20 rounded-full blur-xl"
                        />
                        <motion.div
                            animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0, 0.3] }}
                            transition={{ duration: 3, repeat: Infinity, delay: 0.5 }}
                            className="absolute inset-0 bg-landing-accent/20 rounded-full blur-xl"
                        />

                        {/* Core */}
                        <div className="relative w-full h-full bg-white rounded-full shadow-2xl border-4 border-white flex items-center justify-center z-10">
                            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-landing-teal to-landing-accent flex items-center justify-center">
                                <span className="font-heading text-white font-bold text-3xl">TD</span>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT: Outputs Flowing Out */}
                    <div className="absolute right-0 top-0 bottom-0 w-1/2 overflow-hidden pointer-events-none fade-mask-right">
                        {outputs.map((item, i) => (
                            <motion.div
                                key={item.label}
                                className={`absolute left-0 p-3 pl-6 rounded-l-full shadow-lg flex flex-row-reverse items-center gap-3 border border-black/5 ${item.color} bg-white`}
                                style={{ top: `50%`, marginTop: item.y }}
                                initial={{ x: 0, opacity: 0 }}
                                animate={{
                                    x: ["-50%", "350%"], // Move outwards from center
                                    opacity: [0, 1, 1, 0],
                                    scale: [0.5, 1, 1, 0.8]
                                }}
                                transition={{
                                    duration: 7,
                                    repeat: Infinity,
                                    delay: item.delay,
                                    ease: "linear"
                                }}
                            >
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center bg-white/50 backdrop-blur-sm`}>
                                    <item.icon size={16} />
                                </div>
                                <span className="font-bold whitespace-nowrap text-sm">{item.label}</span>
                            </motion.div>
                        ))}
                    </div>

                </div>

            </div>
        </section>
    );
}
