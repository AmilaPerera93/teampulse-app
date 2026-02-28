import { useEffect, useRef } from 'react';
import { db } from '../firebase';
import { doc, updateDoc, serverTimestamp, addDoc, collection } from 'firebase/firestore';

// 5 Minutes Idle Threshold (Normal usage)
const IDLE_THRESHOLD = 5 * 60 * 1000;
const HEARTBEAT_INTERVAL = 10 * 60 * 1000;

export function useActivityMonitor(user) {
  const timeoutRef = useRef(null);
  const heartbeatRef = useRef(null);
  const isIdle = useRef(false);
  const idleStartTime = useRef(null); // Track when idle began

  // Helper to update status
  const setStatus = async (status) => {
    if (!user || !user.id) return;
    if (user.onlineStatus === 'Break') return; 

    try {
      await updateDoc(doc(db, 'users', user.id), {
        onlineStatus: status,
        lastSeen: serverTimestamp()
      });
    } catch (e) { console.error(e); }
  };

  // Helper: Log the idle session when they come back
  const logIdleTime = async () => {
    if (!idleStartTime.current || !user.id) return;
    
    const duration = Date.now() - idleStartTime.current;
    if (duration > 1000) { 
        try {
            await addDoc(collection(db, 'idle_logs'), {
                userId: user.id,
                userName: user.fullname,
                startTime: idleStartTime.current,
                endTime: Date.now(),
                durationMs: duration,
                date: new Date().toISOString().split('T')[0],
                type: 'Auto-Idle'
            });
        } catch(e) { console.error("Error logging idle:", e); }
    }
    idleStartTime.current = null;
  };

  useEffect(() => {
    if (!user || user.onlineStatus === 'Break') {
        clearTimeout(timeoutRef.current);
        clearInterval(heartbeatRef.current);
        return; 
    }

    // 1. Initial Setup
    // if(user.onlineStatus !== 'Online' && user.onlineStatus !== 'Idle') setStatus('Online');

    const handleActivity = () => {
      if (user.onlineStatus === 'Break') return;

      if (isIdle.current) {
        isIdle.current = false;
        logIdleTime(); 
        // We still call setStatus('Online') here to "wake up" the UI when they return to the tab
        setStatus('Online');
      }

      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        isIdle.current = true;
        idleStartTime.current = Date.now(); 

        // COMMENTED OUT TO FIX TAB-SWITCH ISSUE
        // We stop the browser from writing "Idle" to the user document.
        // The Desktop Tracker will handle this via hardware monitoring instead.
        
        // setStatus('Idle'); 
        
        console.log("Web app detected inactivity, but deferring to Desktop Tracker for status update.");
      }, IDLE_THRESHOLD);
    };

    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
    events.forEach(evt => window.addEventListener(evt, handleActivity));

    // Heartbeat for web app - we can keep this for lastSeen updates, or disable it 
    // to give Desktop Tracker full authority.
    heartbeatRef.current = setInterval(() => {
        if (!isIdle.current && user.onlineStatus !== 'Break') {
             // setStatus('Online'); // Also optional to comment this out
        }
    }, HEARTBEAT_INTERVAL);

    return () => {
      events.forEach(evt => window.removeEventListener(evt, handleActivity));
      clearTimeout(timeoutRef.current);
      clearInterval(heartbeatRef.current);
    };
  }, [user.onlineStatus, user.id]); 
}