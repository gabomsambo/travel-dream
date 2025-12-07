"use client";

import { motion } from "framer-motion";
import { Copy, MapPin, MessageCircle, StickyNote, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
    {
        title: "Screenshots",
        desc: "That beach you meant to remember, lost in your camera roll.",
        icon: ImageIcon,
        className: "md:col-span-2 bg-[#EAE4D9]", // Larger cell
        color: "text-blue-600",
    },
    {
        title: "Notes App",
        desc: "A disconnected list titled 'Trip ideas'.",
        icon: StickyNote,
        className: "md:col-span-1 bg-[#F5F5F0]",
        color: "text-yellow-600",
    },
    {
        title: "Map Pins",
        desc: "Starred locations with zero context.",
        icon: MapPin,
        className: "md:col-span-1 bg-[#F0F2F5]",
        color: "text-red-600",
    },
    {
        title: "Group Chats",
        desc: "Links buried in months of messages.",
        icon: MessageCircle,
        className: "md:col-span-2 bg-[#E8DCC4]", // Larger cell
        color: "text-green-600",
    },
];

export default function Problem() {
    return (
        <section id="problem" className="py-32 bg-landing-background">
            <div className="container mx-auto px-6">

                <div className="max-w-3xl mx-auto text-center mb-20">
                    <motion.h2
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="font-heading text-4xl md:text-5xl font-bold mb-6 text-landing-primary tracking-tight"
                    >
                        Your travel ideas are <span className="text-landing-accent italic">scattered.</span>
                    </motion.h2>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.1 }}
                        className="text-xl text-landing-secondary leading-relaxed"
                    >
                        Fragmented across apps, lost in chats, and buried in screenshots. <br />
                        It’s hard to dream when you can’t find the pieces.
                    </motion.p>
                </div>

                {/* Bento Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-5xl mx-auto">
                    {items.map((item, idx) => (
                        <motion.div
                            key={idx}
                            initial={{ opacity: 0, scale: 0.9 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            viewport={{ once: true }}
                            transition={{ delay: idx * 0.1 }}
                            whileHover={{ scale: 1.02 }}
                            className={cn(
                                "rounded-3xl p-8 flex flex-col justify-between min-h-[240px] transition-all duration-300 hover:shadow-xl hover:shadow-black/5 cursor-default relative overflow-hidden group",
                                item.className
                            )}
                        >
                            <div className="absolute top- right-0 p-32 bg-white/10 rounded-full blur-3xl group-hover:bg-white/20 transition-all"></div>

                            <div className={cn("w-12 h-12 rounded-xl bg-white flex items-center justify-center mb-4 shadow-sm text-lg", item.color)}>
                                <item.icon size={24} />
                            </div>

                            <div>
                                <h3 className="font-heading text-2xl font-bold text-landing-primary mb-2">{item.title}</h3>
                                <p className="text-landing-primary/70 font-medium">{item.desc}</p>
                            </div>
                        </motion.div>
                    ))}
                </div>

            </div>
        </section>
    );
}
