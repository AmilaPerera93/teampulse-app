import { useEffect, useRef } from 'react';
import { db } from '../firebase';
import { doc, updateDoc, serverTimestamp, addDoc, collection } from 'firebase/firestore';

// SETTINGS
const IDLE_THRESHOLD = 5 * 60 * 1000; // 5 Minutes Idle
const HEARTBEAT_INTERVAL = 60 * 1000; // 1 Minute Heartbeat (Safe)

export function useActivityMonitor(user) {
  const timeoutRef = useRef(null);
  const heartbeatRef = useRef(null);
  const isIdle = useRef(false);
  const idleStartTime = useRef(null);

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

    // 1. Initial Status
    if(user.onlineStatus !== 'Online' && user.onlineStatus !== 'Idle') setStatus('Online');

    const handleActivity = () => {
      if (user.onlineStatus === 'Break') return;

      if (isIdle.current) {
        isIdle.current = false;
        logIdleTime();
        setStatus('Online');
      }

      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        isIdle.current = true;
        idleStartTime.current = Date.now();
        setStatus('Idle');
      }, IDLE_THRESHOLD);
    };

    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
    events.forEach(evt => window.addEventListener(evt, handleActivity));

    // HEARTBEAT
    heartbeatRef.current = setInterval(() => {
        if (!isIdle.current && user.onlineStatus !== 'Break') setStatus('Online');
    }, HEARTBEAT_INTERVAL);

    return () => {
      events.forEach(evt => window.removeEventListener(evt, handleActivity));
      clearTimeout(timeoutRef.current);
      clearInterval(heartbeatRef.current);
    };
  }, [user.onlineStatus]); 
}