"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { Camera, Map, PenTool, Compass } from "lucide-react";

const getColorClasses = (color: 'accent' | 'highlight' | 'teal' | 'primary') => {
    switch (color) {
        case 'accent':
            return { text: 'text-landing-accent', bg: 'bg-landing-accent/10' };
        case 'highlight':
            return { text: 'text-landing-highlight', bg: 'bg-landing-highlight/10' };
        case 'teal':
            return { text: 'text-landing-teal', bg: 'bg-landing-teal/10' };
        case 'primary':
            return { text: 'text-landing-primary', bg: 'bg-landing-primary/10' };
    }
};

const items: Array<{
    id: number;
    title: string;
    desc: string;
    icon: typeof Camera;
    color: 'accent' | 'highlight' | 'teal' | 'primary';
    image: string;
    rotate: number;
}> = [
    {
        id: 1,
        title: "Capture",
        desc: "Don't let that screenshot die in your camera roll. Give it a home.",
        icon: Camera,
        color: "accent",
        image: "/item_camera_1765075637131.png",
        rotate: 12
    },
    {
        id: 2,
        title: "Scribble",
        desc: "Raw ideas, half-baked plans, and 'maybe someday' notes.",
        icon: PenTool,
        color: "highlight",
        image: "/item_journal_1765075649849.png",
        rotate: -6
    },
    {
        id: 3,
        title: "Visualize",
        desc: "See your scattered pins connect into a real journey.",
        icon: Map,
        color: "teal",
        image: "/item_map_1765075664417.png",
        rotate: 3
    },
    {
        id: 4,
        title: "Embark",
        desc: "When you're ready, turn your closet into a suitcase.",
        icon: Compass,
        color: "primary",
        image: "/item_essentials_1765075677140.png",
        rotate: 12
    }
];

export default function TravelCloset() {
    return (
        <section id="closet" className="relative py-20 md:py-28 bg-landing-surface">
            {/* Background Ambience */}
            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-landing-accent/5 rounded-full blur-[100px] pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-landing-highlight/5 rounded-full blur-[80px] pointer-events-none" />

            <div className="container mx-auto px-6 relative z-10">
                {/* Header */}
                <div className="max-w-2xl mb-16 md:mb-20">
                    <div className="flex items-center gap-2 mb-4">
                        <span className="w-8 h-[2px] bg-landing-accent"></span>
                        <span className="text-landing-accent font-bold tracking-widest uppercase text-sm">The Experience</span>
                    </div>
                    <h2 className="font-heading text-5xl md:text-7xl font-extrabold text-landing-primary leading-[1.1]">
                        A walk-in closet <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-landing-teal to-landing-accent">for your dreams.</span>
                    </h2>
                </div>

                {/* 2x2 Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16">
                    {items.map((item) => {
                        const colorClasses = getColorClasses(item.color);
                        return (
                            <div key={item.id} className="relative group pt-20 md:pt-24">
                                {/* Floating Product Image */}
                                <div
                                    className="absolute -top-4 md:-top-6 right-4 md:right-8 w-[180px] h-[180px] md:w-[220px] md:h-[220px] z-10 drop-shadow-2xl transition-all duration-700 group-hover:scale-110 group-hover:rotate-0"
                                    style={{ transform: `rotate(${item.rotate}deg)` }}
                                >
                                    <Image src={item.image} alt={item.title} fill className="object-contain" />
                                </div>

                                {/* Card */}
                                <motion.div
                                    className="bg-white p-10 md:p-12 rounded-[2.5rem] shadow-xl border border-white/60 relative z-20 backdrop-blur-sm"
                                    whileHover={{ y: -16 }}
                                    transition={{ duration: 0.5 }}
                                >
                                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${colorClasses.text} ${colorClasses.bg} mb-8`}>
                                        <item.icon size={36} />
                                    </div>
                                    <h3 className="font-heading text-4xl font-bold text-landing-primary mb-4">{item.title}</h3>
                                    <p className="text-landing-secondary text-xl leading-relaxed">{item.desc}</p>
                                </motion.div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}
