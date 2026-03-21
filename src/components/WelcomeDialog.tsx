import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lightbulb, Link2, MessageSquare, Sparkles, Search } from 'lucide-react';

const WELCOME_STORAGE_KEY = 'secondmind_welcomed';

export function WelcomeDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const hasBeenWelcomed = localStorage.getItem(WELCOME_STORAGE_KEY);
    if (!hasBeenWelcomed) {
      setOpen(true);
    }
  }, []);

  const handleGetStarted = () => {
    localStorage.setItem(WELCOME_STORAGE_KEY, 'true');
    setOpen(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center p-6"
        >
          {/* Dark overlay - cannot be clicked to dismiss */}
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-md bg-background border-2 border-foreground rounded-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="px-8 pt-10 pb-6 text-center">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <h1 className="text-2xl font-black tracking-tight text-foreground mb-2">
                  Welcome to SECOND MIND
                </h1>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="space-y-1"
              >
                <p className="text-base text-muted-foreground">
                  A digital extension of your brain
                </p>
                <p className="text-sm text-muted-foreground/70 italic">
                  Your brain is for creating, not remembering
                </p>
              </motion.div>
            </div>

            {/* Features */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="px-8 pb-6"
            >
              <div className="space-y-4">
                <FeatureItem
                  icon={<Lightbulb className="w-4 h-4" />}
                  title="Capture everything"
                  description="Notes, ideas, images, links, tasks — all in one place"
                  delay={0.35}
                  colorClass="bg-red-hot/10 text-red-hot"
                />
                <FeatureItem
                  icon={<Search className="w-4 h-4" />}
                  title="AI remembers for you"
                  description="Ask 'What was that idea from October?' and find it instantly"
                  delay={0.4}
                  colorClass="bg-red-crimson/10 text-red-crimson"
                />
                <FeatureItem
                  icon={<Link2 className="w-4 h-4" />}
                  title="Connections happen automatically"
                  description="Your ideas link together, surfacing when you need them"
                  delay={0.45}
                  colorClass="bg-red-berry/10 text-red-berry"
                />
                <FeatureItem
                  icon={<MessageSquare className="w-4 h-4" />}
                  title="Chat with your thoughts"
                  description="Expand ideas, get reminders, and explore your mind"
                  delay={0.5}
                  colorClass="bg-red-coral/10 text-red-coral"
                />
              </div>
            </motion.div>

            {/* CTA */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.55 }}
              className="px-8 pb-10"
            >
              <button
                onClick={handleGetStarted}
                className="w-full py-4 rounded-xl bg-destructive text-destructive-foreground font-semibold text-base
                         hover:bg-destructive/90 transition-colors flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                Get Started
              </button>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function FeatureItem({ 
  icon, 
  title, 
  description, 
  delay,
  colorClass = "bg-destructive/10 text-destructive"
}: { 
  icon: React.ReactNode; 
  title: string; 
  description: string;
  delay: number;
  colorClass?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay }}
      className="flex items-start gap-3"
    >
      <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${colorClass}`}>
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
      </div>
    </motion.div>
  );
}
