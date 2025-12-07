"use client";

import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { useState, useEffect } from "react";
import { Plus, LayoutTemplate, Send } from "lucide-react";

const tabs = [
    {
        id: 0,
        label: "Save Anything",
        title: "Dump the Dream",
        desc: "Links, screenshots, or random notes. Just throw them in the pile.",
        icon: Plus,
        activeIconBg: "bg-landing-accent text-white"
    },
    {
        id: 1,
        label: "Organize Visually",
        title: "Curate the Chaos",
        desc: "Drag and drop to see what fits. Watch your scattered ideas turn into a real plan.",
        icon: LayoutTemplate,
        activeIconBg: "bg-[#0d9488] text-white"
    },
    {
        id: 2,
        label: "Export Plan",
        title: "Make it Real",
        desc: "Turn your mood board into a bookable itinerary. One click to take it with you.",
        icon: Send,
        activeIconBg: "bg-primary text-white"
    }
];

// Assets to reuse
const visuals = [
    "/dest_amalfi_1765074636643.png",
    "/dest_kyoto_1765074648985.png",
    "/dest_santorini_1765075151456.png"
];

export default function HowItWorks() {
    const [activeTab, setActiveTab] = useState(0);
    const [isHovering, setIsHovering] = useState(false);

    // Auto-play logic
    useEffect(() => {
        if (isHovering) return;
        const interval = setInterval(() => {
            setActiveTab((prev) => (prev + 1) % tabs.length);
        }, 4000);
        return () => clearInterval(interval);
    }, [isHovering]);

    return (
        <section className="pt-0 pb-24 md:pt-0 md:pb-32 bg-landing-surface relative overflow-hidden">
            <div className="container mx-auto px-6">

                {/* Header */}
                <div className="text-center mb-20">
                    <h2 className="font-heading text-5xl md:text-6xl font-extrabold text-landing-primary mb-6">
                        From chaos to confirmed.
                    </h2>
                    <p className="text-landing-secondary text-2xl max-w-2xl mx-auto leading-relaxed">
                        Stop using spreadhseets for dreams. Use a tool built for the way you actually think.
                    </p>
                </div>

                <div className="flex flex-col lg:flex-row gap-16 items-center">

                    {/* LEFT: Tabs (Navigation) - BIGGER & BOLDER */}
                    <div className="w-full lg:w-5/12 flex flex-col gap-6">
                        {tabs.map((tab) => (
                            <div
                                key={tab.id}
                                className={`group p-8 rounded-[2rem] cursor-pointer transition-all duration-300 border-2 ${activeTab === tab.id ? "bg-white border-primary/10 shadow-2xl scale-[1.02]" : "bg-transparent border-transparent hover:bg-white/50"}`}
                                onMouseEnter={() => {
                                    setActiveTab(tab.id);
                                    setIsHovering(true);
                                }}
                                onMouseLeave={() => setIsHovering(false)}
                                onClick={() => setActiveTab(tab.id)}
                            >
                                <div className="flex items-center gap-6 mb-3">
                                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors shadow-sm ${activeTab === tab.id ? tab.activeIconBg : "bg-primary/5 text-landing-primary/40 group-hover:bg-white group-hover:text-landing-primary"}`}>
                                        <tab.icon size={28} />
                                    </div>
                                    <span className={`font-bold font-heading text-3xl transition-colors ${activeTab === tab.id ? "text-landing-primary" : "text-landing-primary/40 group-hover:text-landing-primary/70"}`}>
                                        {tab.label}
                                    </span>
                                </div>
                                <div className={`overflow-hidden transition-all duration-500 ease-in-out ${activeTab === tab.id ? "max-h-32 opacity-100" : "max-h-0 opacity-0"}`}>
                                    <p className="text-landing-secondary text-lg pl-20 leading-relaxed font-medium">
                                        {tab.desc}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* RIGHT: Visual Stage - DYNAMIC WORKFLOW */}
                    <div className="w-full lg:w-7/12 h-[600px] flex items-center justify-center relative">
                        <div className="relative w-full max-w-[600px] aspect-square">

                            {/* Background Circle */}
                            <motion.div
                                animate={{ scale: [1, 1.05, 1] }}
                                transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                                className="absolute inset-0 bg-gradient-to-tr from-landing-accent/5 to-landing-teal/5 rounded-full blur-3xl"
                            />

                            {/* State 1: SCATTERED (Save Anything) */}
                            {visuals.map((src, i) => (
                                <motion.div
                                    key={`scatter-${i}`}
                                    className="absolute top-1/2 left-1/2 w-48 h-64 bg-white p-2 shadow-xl rounded-lg"
                                    initial={false}
                                    animate={{
                                        x: activeTab === 0 ? (i - 1) * 120 - 100 : activeTab === 1 ? (i - 1) * 60 - 20 : 0,
                                        y: activeTab === 0 ? (i % 2 === 0 ? -40 : 40) - 150 : activeTab === 1 ? (i - 1) * 10 - 150 : -150,
                                        rotate: activeTab === 0 ? (i - 1) * 15 + ((i % 2 === 0 ? 1 : -1) * 5) : activeTab === 1 ? (i - 1) * 2 : 0,
                                        scale: activeTab === 2 ? 0 : 1,
                                        opacity: activeTab === 2 ? 0 : 1,
                                        zIndex: i
                                    }}
                                    transition={{ type: "spring", stiffness: 100, damping: 20 }}
                                >
                                    <div className="relative w-full h-full overflow-hidden rounded-md bg-gray-100">
                                        <Image src={src} alt="Dest" fill className="object-cover" />
                                    </div>
                                </motion.div>
                            ))}

                            {/* State 2: JOURNAL BASE (Appears in all) */}
                            <motion.div
                                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[650px] z-0"
                                animate={{
                                    y: activeTab === 0 ? 100 : 0,
                                    opacity: activeTab === 0 ? 0.5 : 1,
                                    scale: activeTab === 0 ? 0.9 : 1
                                }}
                                transition={{ duration: 0.5 }}
                            >

                            </motion.div>

                            {/* State 3: PACKED / STAMPED (Export Plan) */}
                            <motion.div
                                className="absolute top-1/2 left-1/2 w-64 h-80 bg-white p-4 shadow-2xl rounded-xl z-20 flex flex-col items-center justify-between"
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{
                                    scale: activeTab === 2 ? 1 : 0,
                                    opacity: activeTab === 2 ? 1 : 0,
                                    y: -150,
                                    x: -128,
                                    rotate: activeTab === 2 ? -5 : 0
                                }}
                                transition={{ type: "spring", bounce: 0.5 }}
                            >
                                <div className="w-full h-32 bg-gray-100 rounded-lg overflow-hidden relative mb-4">
                                    <Image src={visuals[0]} alt="Cover" fill className="object-cover" />
                                </div>
                                <div className="w-full space-y-2">
                                    <div className="h-2 w-3/4 bg-gray-200 rounded-full"></div>
                                    <div className="h-2 w-1/2 bg-gray-200 rounded-full"></div>
                                    <div className="h-2 w-full bg-gray-200 rounded-full"></div>
                                </div>
                                <div className="mt-4 w-full border-t border-dashed border-gray-300 pt-4 flex justify-between items-center text-xs text-landing-secondary font-mono uppercase tracking-widest">
                                    <span>ITINERARY</span>
                                    <span className="text-landing-primary font-bold">#2024</span>
                                </div>

                                {/* STAMP */}
                                <motion.div
                                    className="absolute bottom-10 -right-10 w-28 h-28 border-4 border-red-600 rounded-full flex items-center justify-center -rotate-12 opacity-80 backdrop-blur-sm bg-white/50"
                                    animate={{ scale: activeTab === 2 ? [2, 1] : 0 }}
                                    transition={{ delay: 0.2, type: "spring" }}
                                >
                                    <span className="text-red-600 font-bold text-lg uppercase tracking-widest border-t-2 border-b-2 border-red-600">Ready</span>
                                </motion.div>

                            </motion.div>

                        </div>
                    </div>

                </div>
            </div>
        </section>
    );
}
