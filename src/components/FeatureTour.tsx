 import { useState } from 'react';
 import { motion, AnimatePresence } from 'framer-motion';
import { 
  Clock, 
  CheckCircle2, 
  BarChart3, 
  FolderOpen, 
  BookOpen,
  Sparkles,
  ArrowRight,
  X,
  Plus,
  Bell,
  Settings,
  Sunrise,
  Search,
  Asterisk,
} from 'lucide-react';
 import { Button } from '@/components/ui/button';
 
 interface FeatureTourProps {
   onComplete: () => void;
   onSkip?: () => void;
 }
 
 const FEATURES = [
   {
     id: 'second-mind-button',
     icon: Asterisk,
     title: 'The Second Mind Button',
     subtitle: 'Your Quick Access Hub',
     description: 'The floating button on your screen. Tap it to open a radial menu with shortcuts to Settings, AI Chat, Notifications, and Daily Briefing. Drag it anywhere on screen.',
     color: 'hsl(0 0% 15%)',
     bgColor: 'hsl(0 0% 15% / 0.1)',
   },
   {
     id: 'daily-plan',
     icon: Clock,
     title: 'Daily Plan',
     subtitle: 'Your Day at a Glance',
     description: 'A circular timeline showing all your scheduled events. Tap + to add events with start and end times. See your day unfold visually around the clock.',
     color: 'hsl(0 85% 50%)',
     bgColor: 'hsl(0 85% 50% / 0.1)',
   },
   {
     id: 'todos',
     icon: CheckCircle2,
     title: 'Todos',
     subtitle: 'Floating Task Bubbles',
     description: 'Your tasks appear as draggable bubbles. Tap to complete, long-press to mark as important. Drag to rearrange. Simple, visual task management.',
     color: 'hsl(0 70% 45%)',
     bgColor: 'hsl(0 70% 45% / 0.1)',
   },
   {
     id: 'habits',
     icon: BarChart3,
     title: 'Habits',
     subtitle: 'Build Daily Consistency',
     description: 'Track daily habits with a visual grid. Tap boxes to mark progress: green (done), orange (partial), red (missed). See your monthly streaks at a glance.',
     color: 'hsl(330 70% 50%)',
     bgColor: 'hsl(330 70% 50% / 0.1)',
   },
   {
     id: 'journal',
     icon: BookOpen,
     title: 'Journal',
     subtitle: 'Write Freely',
     description: 'A distraction-free writing space. One continuous document per day that auto-saves as you type. Use prompts for inspiration or just start writing.',
     color: 'hsl(15 60% 45%)',
     bgColor: 'hsl(15 60% 45% / 0.1)',
   },
   {
     id: 'archive',
     icon: FolderOpen,
     title: 'Archive',
     subtitle: 'Your Archives',
     description: 'Organize notes, links, images, and tables into archives. Tap + to create a new archive. Inside, use the freeform canvas to arrange items however you like.',
     color: 'hsl(0 50% 35%)',
     bgColor: 'hsl(0 50% 35% / 0.1)',
   },
   {
     id: 'add-archive',
     icon: Plus,
     title: 'Add to Archive',
     subtitle: 'Save Anything Instantly',
     description: 'Tap the + button inside any archive to save text notes, paste links (auto-detected), upload images, or create tables. Everything saves silently and organizes itself.',
     color: 'hsl(0 60% 40%)',
     bgColor: 'hsl(0 60% 40% / 0.1)',
   },
   {
     id: 'ai-chat',
     icon: Sparkles,
     title: 'AI Chat',
     subtitle: 'Your Personal Assistant',
     description: 'Open from the Second Mind button. Ask questions about your notes, get summaries, brainstorm ideas, or explore connections across everything you have saved.',
     color: 'hsl(260 60% 50%)',
     bgColor: 'hsl(260 60% 50% / 0.1)',
   },
   {
     id: 'daily-briefing',
     icon: Sunrise,
     title: 'Daily Briefing',
     subtitle: 'Start Your Day Informed',
     description: 'A personalized morning summary powered by AI. See your upcoming events, pending tasks, and a curated insight — all in one calm view. Access via the Second Mind button.',
     color: 'hsl(30 80% 50%)',
     bgColor: 'hsl(30 80% 50% / 0.1)',
   },
   {
     id: 'notifications',
     icon: Bell,
     title: 'Notifications',
     subtitle: 'Smart Reminders',
     description: 'Receive intelligent notifications about your tasks, habits, and items. Access your notification inbox from the Second Mind button.',
     color: 'hsl(200 70% 45%)',
     bgColor: 'hsl(200 70% 45% / 0.1)',
   },
   {
     id: 'search',
     icon: Search,
     title: 'Search',
     subtitle: 'Find Anything Instantly',
     description: 'Semantic search across all your notes, links, and archives. Just start typing — results appear in real-time. Find things by meaning, not just keywords.',
     color: 'hsl(0 0% 40%)',
     bgColor: 'hsl(0 0% 40% / 0.1)',
   },
   {
     id: 'settings',
     icon: Settings,
     title: 'Settings',
     subtitle: 'Make It Yours',
     description: 'Edit your profile, switch between Day, Night, and Blu themes, or restart the onboarding tutorial. Access via the Second Mind button.',
     color: 'hsl(0 0% 30%)',
     bgColor: 'hsl(0 0% 30% / 0.1)',
   },
   {
     id: 'navigation',
     icon: ArrowRight,
     title: 'Navigation',
     subtitle: 'Swipe Between Pages',
     description: 'Swipe left and right to move between Daily Plan, Todos, Habits, Journal, and Archive. The bottom bar shows Home, Search, and Capture. Everything syncs automatically.',
     color: 'hsl(0 85% 50%)',
     bgColor: 'hsl(0 85% 50% / 0.1)',
   },
 ];
 
 export function FeatureTour({ onComplete, onSkip }: FeatureTourProps) {
   const [currentIndex, setCurrentIndex] = useState(0);
   const currentFeature = FEATURES[currentIndex];
   const isLast = currentIndex === FEATURES.length - 1;
 
   const handleNext = () => {
     if (isLast) {
       onComplete();
     } else {
       setCurrentIndex(prev => prev + 1);
     }
   };
 
   const handlePrev = () => {
     if (currentIndex > 0) {
       setCurrentIndex(prev => prev - 1);
     }
   };
 
   return (
     <div className="fixed inset-0 z-50 bg-background flex flex-col">
       {onSkip && (
         <button
           onClick={onSkip}
           className="absolute top-4 right-4 p-2 text-muted-foreground hover:text-foreground transition-colors z-10"
         >
           <X className="w-5 h-5" />
         </button>
       )}
 
       {/* Progress dots */}
       <div className="flex justify-center gap-1.5 pt-8 pb-4 px-6 flex-wrap">
         {FEATURES.map((_, idx) => (
           <button
             key={idx}
             onClick={() => setCurrentIndex(idx)}
             className={`h-1.5 rounded-full transition-all duration-300 ${
               idx === currentIndex 
                 ? 'w-6 bg-primary' 
                 : idx < currentIndex 
                   ? 'w-3 bg-primary/50' 
                   : 'w-3 bg-secondary'
             }`}
           />
         ))}
       </div>
 
       {/* Feature content */}
       <div className="flex-1 flex items-center justify-center px-6 overflow-hidden">
         <AnimatePresence mode="wait">
           <motion.div
             key={currentFeature.id}
             initial={{ opacity: 0, x: 50 }}
             animate={{ opacity: 1, x: 0 }}
             exit={{ opacity: 0, x: -50 }}
             transition={{ duration: 0.3, ease: 'easeOut' }}
             className="w-full max-w-sm text-center"
           >
             <motion.div
               initial={{ scale: 0.8 }}
               animate={{ scale: 1 }}
               transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
               className="w-24 h-24 mx-auto mb-8 rounded-3xl flex items-center justify-center"
               style={{ backgroundColor: currentFeature.bgColor }}
             >
               <currentFeature.icon 
                 className="w-12 h-12" 
                 style={{ color: currentFeature.color }}
               />
             </motion.div>
 
             <motion.h2
               initial={{ opacity: 0, y: 10 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ delay: 0.15 }}
               className="text-2xl font-bold text-foreground mb-2"
             >
               {currentFeature.title}
             </motion.h2>
 
             <motion.p
               initial={{ opacity: 0, y: 10 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ delay: 0.2 }}
               className="text-sm font-medium mb-4"
               style={{ color: currentFeature.color }}
             >
               {currentFeature.subtitle}
             </motion.p>
 
             <motion.p
               initial={{ opacity: 0, y: 10 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ delay: 0.25 }}
               className="text-muted-foreground text-sm leading-relaxed"
             >
               {currentFeature.description}
             </motion.p>
           </motion.div>
         </AnimatePresence>
       </div>
 
       {/* Counter */}
       <div className="text-center pb-2">
         <span className="text-xs text-muted-foreground">{currentIndex + 1} / {FEATURES.length}</span>
       </div>

       {/* Navigation buttons */}
       <div className="p-6 pb-10 space-y-3">
         <Button
           onClick={handleNext}
           className="w-full h-12 text-base font-medium"
         >
           {isLast ? 'Got it' : 'Next'}
           {!isLast && <ArrowRight className="w-4 h-4 ml-2" />}
         </Button>
 
         {currentIndex > 0 && (
           <Button
             variant="ghost"
             onClick={handlePrev}
             className="w-full"
           >
             Back
           </Button>
         )}
       </div>
     </div>
   );
 }
