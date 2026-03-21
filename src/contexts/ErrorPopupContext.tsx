 import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
 
 interface ErrorPopupState {
   isOpen: boolean;
   message: string;
   onRetry?: () => void;
 }
 
 interface ErrorPopupContextType {
   showError: (message: string, onRetry?: () => void) => void;
   hideError: () => void;
   errorState: ErrorPopupState;
 }
 
 const ErrorPopupContext = createContext<ErrorPopupContextType | undefined>(undefined);
 
// Global error handler for use outside of React components
let globalShowError: ((message: string, onRetry?: () => void) => void) | null = null;

export function showErrorPopup(message: string, onRetry?: () => void) {
  if (globalShowError) {
    globalShowError(message, onRetry);
  } else {
    // Fallback to console if provider not mounted yet
    console.error('Error popup not ready:', message);
  }
}

 export function ErrorPopupProvider({ children }: { children: ReactNode }) {
   const [errorState, setErrorState] = useState<ErrorPopupState>({
     isOpen: false,
     message: '',
     onRetry: undefined,
   });
 
   const showError = useCallback((message: string, onRetry?: () => void) => {
     setErrorState({
       isOpen: true,
       message,
       onRetry,
     });
   }, []);
  
  // Register global handler
  globalShowError = showError;
 
   const hideError = useCallback(() => {
     setErrorState(prev => ({ ...prev, isOpen: false }));
   }, []);
 
   return (
     <ErrorPopupContext.Provider value={{ showError, hideError, errorState }}>
       {children}
     </ErrorPopupContext.Provider>
   );
 }
 
 export function useErrorPopup() {
   const context = useContext(ErrorPopupContext);
   if (context === undefined) {
     throw new Error('useErrorPopup must be used within an ErrorPopupProvider');
   }
   return context;
 }