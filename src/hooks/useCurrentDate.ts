 import { useState, useEffect, useCallback, useRef } from 'react';
 import { format } from 'date-fns';
 
 /**
  * Hook that tracks the current date and automatically updates at midnight.
  * Also re-syncs on visibility change (user returns to app) and on mount.
  */
 export function useCurrentDate() {
   // Get today's date string in YYYY-MM-DD format (local timezone)
   const getTodayString = useCallback(() => {
     return format(new Date(), 'yyyy-MM-dd');
   }, []);
 
   // Get a Date object for today at midnight (local timezone)
   const getTodayDate = useCallback(() => {
     const now = new Date();
     return new Date(now.getFullYear(), now.getMonth(), now.getDate());
   }, []);
 
   const [currentDate, setCurrentDate] = useState<Date>(getTodayDate);
   const [todayString, setTodayString] = useState<string>(getTodayString);
   const lastCheckedRef = useRef<string>(getTodayString());
 
   // Check if we need to update the date
   const checkAndUpdateDate = useCallback(() => {
     const nowString = getTodayString();
     if (nowString !== lastCheckedRef.current) {
       lastCheckedRef.current = nowString;
       setTodayString(nowString);
       setCurrentDate(getTodayDate());
       return true; // Date changed
     }
     return false; // No change
   }, [getTodayString, getTodayDate]);
 
   // Set up midnight timer
   useEffect(() => {
     const scheduleNextMidnightCheck = () => {
       const now = new Date();
       const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
       const msUntilMidnight = tomorrow.getTime() - now.getTime();
       
       // Schedule check for just after midnight (add 1 second buffer)
       return setTimeout(() => {
         checkAndUpdateDate();
         // After checking, schedule the next midnight
         scheduleNextMidnightCheck();
       }, msUntilMidnight + 1000);
     };
 
     const timeoutId = scheduleNextMidnightCheck();
 
     return () => clearTimeout(timeoutId);
   }, [checkAndUpdateDate]);
 
   // Check on visibility change (user returns to app)
   useEffect(() => {
     const handleVisibilityChange = () => {
       if (document.visibilityState === 'visible') {
         checkAndUpdateDate();
       }
     };
 
     document.addEventListener('visibilitychange', handleVisibilityChange);
     return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
   }, [checkAndUpdateDate]);
 
   // Also check on focus (additional safety for PWA/mobile)
   useEffect(() => {
     const handleFocus = () => {
       checkAndUpdateDate();
     };
 
     window.addEventListener('focus', handleFocus);
     return () => window.removeEventListener('focus', handleFocus);
   }, [checkAndUpdateDate]);
 
   // Check periodically (every minute) as a fallback
   useEffect(() => {
     const intervalId = setInterval(() => {
       checkAndUpdateDate();
     }, 60000); // Check every minute
 
     return () => clearInterval(intervalId);
   }, [checkAndUpdateDate]);
 
   // Function to reset to today (useful when user navigates away and back)
   const resetToToday = useCallback(() => {
     checkAndUpdateDate();
     setCurrentDate(getTodayDate());
   }, [checkAndUpdateDate, getTodayDate]);
 
   return {
     /** Today's date at midnight (local timezone) */
     today: currentDate,
     /** Today's date as YYYY-MM-DD string (local timezone) */
     todayString,
     /** Manually refresh the current date */
     refresh: checkAndUpdateDate,
     /** Reset viewed date to today */
     resetToToday,
     /** Get today's date string */
     getTodayString,
   };
 }