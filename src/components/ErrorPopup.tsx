 import { useErrorPopup } from '@/contexts/ErrorPopupContext';
 import { AlertTriangle, X } from 'lucide-react';
 import { Button } from '@/components/ui/button';
 import { motion, AnimatePresence } from 'framer-motion';
 
 export function ErrorPopup() {
   const { errorState, hideError } = useErrorPopup();
   const { isOpen, message, onRetry } = errorState;
 
   const handleRetry = () => {
     hideError();
     if (onRetry) {
       onRetry();
     }
   };
 
   return (
     <AnimatePresence>
       {isOpen && (
         <>
           {/* Backdrop */}
           <motion.div
             initial={{ opacity: 0 }}
             animate={{ opacity: 1 }}
             exit={{ opacity: 0 }}
             transition={{ duration: 0.15 }}
             className="fixed inset-0 bg-black/50 z-[100]"
             onClick={hideError}
           />
           
            {/* Popup */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none"
            >
              <div className="pointer-events-auto w-full max-w-sm">
             <div className="bg-background border border-border rounded-2xl shadow-2xl overflow-hidden">
               {/* Header */}
               <div className="flex items-center justify-between p-4 border-b border-border">
                 <div className="flex items-center gap-3">
                   <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                     <AlertTriangle className="w-5 h-5 text-destructive" />
                   </div>
                   <h2 className="text-lg font-semibold text-foreground">
                     Something went wrong
                   </h2>
                 </div>
                 <button
                   onClick={hideError}
                   className="p-2 rounded-full hover:bg-muted transition-colors"
                 >
                   <X className="w-4 h-4 text-muted-foreground" />
                 </button>
               </div>
               
               {/* Content */}
               <div className="p-4">
                 <p className="text-sm text-muted-foreground leading-relaxed">
                   {message}
                 </p>
               </div>
               
               {/* Actions */}
               <div className="flex gap-3 p-4 pt-0">
                 <Button
                   variant="outline"
                   className="flex-1"
                   onClick={hideError}
                 >
                   Close
                 </Button>
                 {onRetry && (
                   <Button
                     className="flex-1"
                     onClick={handleRetry}
                   >
                     Try again
                   </Button>
                 )}
                </div>
              </div>
              </div>
            </motion.div>
         </>
       )}
     </AnimatePresence>
   );
 }