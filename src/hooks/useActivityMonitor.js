import { useEffect, useRef } from 'react';
import { db } from '../firebase';
import { doc, updateDoc, serverTimestamp, addDoc, collection } from 'firebase/firestore';

// ✅ SENSITIVITY: 20s to stay ahead of the 60s script
const IDLE_THRESHOLD = 20 * 1000; 
// ✅ WEB HEARTBEAT: Lowered to 30s to keep the session alive without bloat
const HEARTBEAT_INTERVAL = 30 * 1000; 

export function useActivityMonitor(user) {
  const timeoutRef = useRef(null);
  const heartbeatRef = useRef(null);
  const isIdle = useRef(false);
  const idleStartTime = useRef(null);

  // Helper to update status (Online only)
  const setStatusOnline = async () => {
    // 🛡️ Bypasses for Managers
    if (!user || user.id === 'master' || ['ADMIN', 'COORDINATOR', 'SUPER_ADMIN'].includes(user.role)) return;
    if (user.onlineStatus === 'Break') return;

    try {
      await updateDoc(doc(db, 'users', user.id), {
        onlineStatus: 'Online',
        lastSeen: serverTimestamp()
      });
    } catch (e) { console.error("Web Heartbeat Error:", e); }
  };

  // Helper: Log the short idle session (The Pattern Hunter)
  const logShortIdle = async () => {
    if (!idleStartTime.current || !user.id) return;
    
    const duration = Date.now() - idleStartTime.current;
    
    // ✅ CRITICAL: Only log short idles (under 5 mins). 
    // This prevents duplicates because main.js handles anything over 5 mins.
    const FIVE_MINS = 5 * 60 * 1000;

    if (duration >= IDLE_THRESHOLD && duration < FIVE_MINS) { 
        try {
            await addDoc(collection(db, 'idle_logs'), {
                userId: user.id,
                userName: user.fullname,
                startTime: idleStartTime.current,
                endTime: Date.now(),
                durationMs: duration,
                date: new Date().toISOString().split('T')[0],
                type: 'Web-Auto-Idle' // Distinct type for pattern detection
            });
            console.log(`[Web Monitor] Caught gap: ${duration/1000}s`);
        } catch(e) { console.error("Error logging idle:", e); }
    }
    idleStartTime.current = null;
  };

  useEffect(() => {
    // 🛡️ ROLE & BREAK PROTECTION
    const isManager = ['ADMIN', 'COORDINATOR', 'SUPER_ADMIN'].includes(user?.role);
    if (!user || isManager || user.onlineStatus === 'Break') {
        clearTimeout(timeoutRef.current);
        clearInterval(heartbeatRef.current);
        return; 
    }

    const handleActivity = () => {
      if (isIdle.current) {
        isIdle.current = false;
        logShortIdle(); // Save the gap record
        setStatusOnline(); // Wake up the UI
      }

      clearTimeout(timeoutRef.current);
      
      // Start the "Silent" Idle Timer
      timeoutRef.current = setTimeout(() => {
        isIdle.current = true;
        idleStartTime.current = Date.now();
        // We do NOT call setStatus('Idle') here; Desktop main.js will do it globally.
      }, IDLE_THRESHOLD);
    };

    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
    events.forEach(evt => window.addEventListener(evt, handleActivity));

    // Web Heartbeat: Only keeps user "Online" if they are actually active in this tab
    heartbeatRef.current = setInterval(() => {
        if (!isIdle.current && user.onlineStatus !== 'Break') {
             setStatusOnline();
        }
    }, HEARTBEAT_INTERVAL);

    return () => {
      events.forEach(evt => window.removeEventListener(evt, handleActivity));
      clearTimeout(timeoutRef.current);
      clearInterval(heartbeatRef.current);
    };
  }, [user?.onlineStatus, user?.id, user?.role]); 
}