"use client";

import { motion, AnimatePresence } from "framer-motion";

interface ProModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Perfect for casual listeners",
    features: [
      "5 downloads per day",
      "Standard MP3 quality",
      "Basic audio modes",
      "Community support",
    ],
    cta: "Current Plan",
    highlight: false,
    gradient: "from-gray-600 to-gray-700",
    borderColor: "border-white/10",
  },
  {
    name: "Premium",
    price: "$3",
    period: "/month",
    description: "For music enthusiasts",
    features: [
      "Unlimited downloads",
      "HD Audio (320kbps)",
      "AI Vocal Removal",
      "Video downloads (1080p)",
      "Priority processing",
      "No ads",
    ],
    cta: "Upgrade to Premium",
    highlight: true,
    gradient: "from-purple-600 to-pink-600",
    borderColor: "border-purple-500/50",
  },
  {
    name: "Developer",
    price: "$10",
    period: "/month",
    description: "API access & bulk processing",
    features: [
      "Everything in Premium",
      "REST API access",
      "Bulk processing (100/batch)",
      "Webhooks & callbacks",
      "Custom integrations",
      "Dedicated support",
    ],
    cta: "Contact Sales",
    highlight: false,
    gradient: "from-cyan-600 to-blue-600",
    borderColor: "border-cyan-500/30",
  },
];

export default function ProModal({ isOpen, onClose }: ProModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", bounce: 0.3, duration: 0.5 }}
            className="fixed inset-4 z-[70] m-auto flex max-h-[90vh] max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-gray-900/95 shadow-2xl backdrop-blur-xl sm:inset-8"
          >
            {/* Header */}
            <div className="relative border-b border-white/10 px-6 py-5 sm:px-8">
              <div className="text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: "spring", bounce: 0.5 }}
                  className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 text-3xl"
                >
                  ✨
                </motion.div>
                <h2 className="text-2xl font-bold text-white sm:text-3xl">
                  Upgrade to{" "}
                  <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                    Pro
                  </span>
                </h2>
                <p className="mt-2 text-gray-400">
                  Unlock unlimited downloads and premium features
                </p>
              </div>

              {/* Close button */}
              <button
                onClick={onClose}
                className="absolute right-4 top-4 rounded-lg p-2 text-gray-400 transition hover:bg-white/10 hover:text-white"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Plans Grid */}
            <div className="flex-1 overflow-y-auto p-6 sm:p-8">
              <div className="grid gap-6 md:grid-cols-3">
                {plans.map((plan, index) => (
                  <motion.div
                    key={plan.name}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 * (index + 1) }}
                    className={`relative flex flex-col rounded-2xl border p-6 backdrop-blur-md transition-all duration-300 hover:scale-[1.02] ${
                      plan.highlight
                        ? `${plan.borderColor} bg-gradient-to-br from-purple-500/10 to-pink-500/10 shadow-lg shadow-purple-500/10`
                        : `${plan.borderColor} bg-white/5`
                    }`}
                  >
                    {/* Popular badge */}
                    {plan.highlight && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <span className="rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-3 py-1 text-xs font-semibold text-white shadow-lg">
                          Most Popular
                        </span>
                      </div>
                    )}

                    {/* Plan header */}
                    <div className="text-center">
                      <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                      <div className="mt-3 flex items-baseline justify-center gap-1">
                        <span className="text-4xl font-extrabold text-white">{plan.price}</span>
                        <span className="text-gray-400">{plan.period}</span>
                      </div>
                      <p className="mt-2 text-sm text-gray-400">{plan.description}</p>
                    </div>

                    {/* Divider */}
                    <div className="my-5 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

                    {/* Features */}
                    <ul className="flex-1 space-y-3">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-3 text-sm text-gray-300">
                          <svg
                            className={`h-5 w-5 flex-shrink-0 ${
                              plan.highlight ? "text-purple-400" : "text-green-400"
                            }`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                          {feature}
                        </li>
                      ))}
                    </ul>

                    {/* CTA Button */}
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className={`mt-6 w-full rounded-xl py-3 font-semibold transition-all ${
                        plan.highlight
                          ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40"
                          : plan.name === "Free"
                          ? "cursor-default border border-white/20 bg-white/5 text-gray-400"
                          : "border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20"
                      }`}
                      disabled={plan.name === "Free"}
                    >
                      {plan.cta}
                    </motion.button>
                  </motion.div>
                ))}
              </div>

              {/* Footer note */}
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="mt-8 text-center text-xs text-gray-500"
              >
                🔒 Secure payment via GCash/Maya. Cancel anytime. No hidden fees.
              </motion.p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
