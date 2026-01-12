import { useEffect, useRef } from 'react';
import { db } from '../firebase';
import { doc, updateDoc, serverTimestamp, addDoc, collection } from 'firebase/firestore';

// 5 Minutes Idle Threshold (Normal usage)
const IDLE_THRESHOLD = 2 * 1000; 
const HEARTBEAT_INTERVAL = 2 * 60 * 1000;

export function useActivityMonitor(user) {
  const timeoutRef = useRef(null);
  const heartbeatRef = useRef(null);
  const isIdle = useRef(false);
  const idleStartTime = useRef(null); // Track when idle began

  // Helper to update status
  const setStatus = async (status) => {
    if (!user || !user.id) return;
    
    // 1. If we are currently on a "Break", DO NOT overwrite it with "Online" or "Idle"
    // We check the local storage or a ref to see if we are in break mode?
    // Actually, we can check the user object passed in if it syncs real-time, 
    // but simpler is to let the component handle the "Break" logic manually.
    // For this hook, we strictly handle "Active" vs "Idle".
    
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
    if (duration > 1000) { // Only log if > 1 second
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
        // If on break, clear all timers and stop tracking
        clearTimeout(timeoutRef.current);
        clearInterval(heartbeatRef.current);
        return; 
    }

    // 1. Initial Setup
    if(user.onlineStatus !== 'Online' && user.onlineStatus !== 'Idle') setStatus('Online');

    const handleActivity = () => {
      if (user.onlineStatus === 'Break') return;

      // If waking up from Idle
      if (isIdle.current) {
        isIdle.current = false;
        logIdleTime(); // <--- Save the idle duration to DB
        setStatus('Online');
      }

      // Reset Timer
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        isIdle.current = true;
        idleStartTime.current = Date.now(); // <--- Start the stopwatch
        setStatus('Idle');
      }, IDLE_THRESHOLD);
    };

    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
    events.forEach(evt => window.addEventListener(evt, handleActivity));

    heartbeatRef.current = setInterval(() => {
        if (!isIdle.current && user.onlineStatus !== 'Break') setStatus('Online');
    }, HEARTBEAT_INTERVAL);

    return () => {
      events.forEach(evt => window.removeEventListener(evt, handleActivity));
      clearTimeout(timeoutRef.current);
      clearInterval(heartbeatRef.current);
    };
  }, [user.onlineStatus]); // Re-run if status changes (e.g. they enter/exit Break)
}