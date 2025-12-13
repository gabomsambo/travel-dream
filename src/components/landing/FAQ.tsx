"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { ChevronDown } from "lucide-react";

const faqs = [
    {
        q: "Is this another social network?",
        a: "No. Tabi Dreams is for you, not for posting. It's a quiet, personal space.",
    },
    {
        q: "Can I export my data?",
        a: "Yes. That's the point. Your plans can always leave Tabi Dreams.",
    },
    {
        q: "Do I have to organize everything perfectly?",
        a: "No. You can start messy. Organize over time.",
    },
    {
        q: "Is Tabi Dreams a booking site?",
        a: "No. It's where you think, collect, and plan — not where you buy.",
    },
];

export default function FAQ() {
    return (
        <section id="faq" className="py-24 bg-landing-background">
            <div className="container mx-auto px-6 max-w-3xl">
                <div className="text-center mb-12">
                    <h2 className="font-heading text-3xl font-bold text-landing-primary">Questions you might have.</h2>
                </div>

                <div className="space-y-4">
                    {faqs.map((item, idx) => (
                        <FAQItem key={idx} question={item.q} answer={item.a} />
                    ))}
                </div>
            </div>
        </section>
    );
}

function FAQItem({ question, answer }: { question: string, answer: string }) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="border border-black/5 rounded-xl bg-landing-surface/20 overflow-hidden">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-6 text-left hover:bg-landing-surface/40 transition-colors"
            >
                <span className="font-heading font-semibold text-landing-primary">{question}</span>
                <ChevronDown
                    className={`text-landing-secondary transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}
                    size={20}
                />
            </button>
            <AnimatePresence initial={false}>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                    >
                        <div className="px-6 pb-6 text-landing-secondary leading-relaxed">
                            {answer}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
