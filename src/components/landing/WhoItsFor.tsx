"use client";

import { motion } from "framer-motion";
import Image from "next/image";

const personas = [
    {
        title: "The Screenshot Collector",
        desc: "For the person with 5,000 photos.",
        color: "bg-[#F2EFE9]",
        img: "/comic_screenshot_collector_1765079226430.png"
    },
    {
        title: "The Gentle Planner",
        desc: "Likes things tidy, but flexible.",
        color: "bg-[#E8DCC4]",
        img: "/comic_gentle_planner_1765079239381.png"
    },
    {
        title: "The Someday Dreamer",
        desc: "Building a life list.",
        color: "bg-[#EAE4D9]",
        img: "/comic_someday_dreamer_1765079254889.png"
    },
    {
        title: "The Foodie",
        desc: "Travels for the reservations.",
        color: "bg-[#F5F5F0]",
        img: "/comic_foodie_traveler.svg"
    },
];

export default function WhoItsFor() {
    return (
        <section id="who" className="py-32 bg-white">
            <div className="container mx-auto px-6 mb-12 flex items-end justify-between">
                <div className="max-w-2xl">
                    <h2 className="font-heading text-4xl md:text-5xl font-bold text-landing-primary mb-4">
                        Made for your <br /> kind of travel.
                    </h2>
                </div>
            </div>

            {/* Horizontal Scroll Area */}
            <div className="w-full overflow-x-auto pb-12 hide-scrollbar pl-6 md:pl-[max(1rem,calc((100vw-1280px)/2))]">
                <div className="flex gap-6 w-max">
                    {personas.map((p, idx) => (
                        <motion.div
                            key={idx}
                            initial={{ opacity: 0, x: 50 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: idx * 0.1 }}
                            whileHover={{ y: -10 }}
                            className={`w-[280px] h-[400px] md:w-[340px] md:h-[480px] rounded-[2rem] p-6 flex flex-col justify-between shadow-sm hover:shadow-xl transition-all duration-300 ${p.color} relative overflow-hidden group`}
                        >
                            {/* Image Container */}
                            <div className="w-full h-[60%] relative mix-blend-multiply opacity-80 group-hover:opacity-100 transition-opacity duration-300">
                                <Image
                                    src={p.img}
                                    alt={p.title}
                                    fill
                                    className="object-contain p-4"
                                />
                            </div>

                            {/* Text Content */}
                            <div className="h-[30%] flex flex-col justify-end pb-2">
                                <h3 className="font-heading text-2xl font-bold text-landing-primary mb-2 leading-tight">{p.title}</h3>
                                <p className="text-landing-secondary/80 font-medium leading-relaxed">{p.desc}</p>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
