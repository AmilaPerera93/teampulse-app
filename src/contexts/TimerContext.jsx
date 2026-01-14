import React, { createContext, useContext, useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, updateDoc, onSnapshot, collection, query, where, addDoc, deleteDoc } from 'firebase/firestore';
import { useAuth } from './AuthContext';

const TimerContext = createContext();

export function useTimer() {
  return useContext(TimerContext);
}

export function TimerProvider({ children }) {
  const { currentUser } = useAuth();
  const [activeTask, setActiveTask] = useState(null);
  const [activeInterruption, setActiveInterruption] = useState(null);

  useEffect(() => {
    if (!currentUser) return;

    // 1. Listen for MY active task
    const qTask = query(collection(db, 'tasks'), where('assignedTo', '==', currentUser.fullname), where('isRunning', '==', true));
    const unsubTask = onSnapshot(qTask, (snap) => {
      if (!snap.empty) {
        setActiveTask({ id: snap.docs[0].id, ...snap.docs[0].data() });
      } else {
        setActiveTask(null);
      }
    });

    // 2. Listen for Power Cuts
    const qInt = query(collection(db, 'interruptions'), where('userId', '==', currentUser.id), where('active', '==', true));
    const unsubInt = onSnapshot(qInt, (snap) => {
        if(!snap.empty) setActiveInterruption({ id: snap.docs[0].id, ...snap.docs[0].data() });
        else setActiveInterruption(null);
    });

    return () => { unsubTask(); unsubInt(); };
    
    // ✅ FIX: Only restart if the User ID or Name changes (e.g. logout/login)
    // We IGNORE timestamp updates here.
  }, [currentUser?.id, currentUser?.fullname]);

  const startTask = async (task) => {
    if (activeInterruption) return alert("Cannot start work during a Power Cut!");
    if (activeTask) {
       const dur = Date.now() - activeTask.lastStartTime;
       await updateDoc(doc(db, 'tasks', activeTask.id), { isRunning: false, elapsedMs: (activeTask.elapsedMs||0) + dur, lastStartTime: null });
    }
    await updateDoc(doc(db, 'tasks', task.id), { isRunning: true, lastStartTime: Date.now(), status: 'In Progress' });
  };

  const stopTask = async () => {
    if (!activeTask) return;
    const dur = Date.now() - activeTask.lastStartTime;
    await updateDoc(doc(db, 'tasks', activeTask.id), { isRunning: false, elapsedMs: (activeTask.elapsedMs||0) + dur, lastStartTime: null });
  };

  // --- POWER CUT HANDLER ---
  const togglePowerCut = async () => {
      if(!currentUser) return;

      if (activeInterruption) {
          // STOP POWER CUT
          const endTime = Date.now();
          const startTime = activeInterruption.startTime;
          const duration = endTime - startTime;

          // Log to History
          if(duration > 1000) {
            await addDoc(collection(db, 'power_logs'), {
                userId: currentUser.id,
                userName: currentUser.fullname,
                startTime: startTime,
                endTime: endTime,
                durationMs: duration,
                date: new Date().toISOString().split('T')[0]
            });
          }
          await deleteDoc(doc(db, 'interruptions', activeInterruption.id));

      } else {
          // START POWER CUT
          if(activeTask) await stopTask();

          await addDoc(collection(db, 'interruptions'), {
              userId: currentUser.id,
              user: currentUser.fullname,
              active: true,
              startTime: Date.now(),
              type: 'Power Cut'
          });
      }
  };

  return (
    <TimerContext.Provider value={{ activeTask, activeInterruption, startTask, stopTask, togglePowerCut }}>
      {children}
    </TimerContext.Provider>
  );
}