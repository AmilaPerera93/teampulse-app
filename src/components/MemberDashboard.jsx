import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, doc, updateDoc, addDoc, orderBy, limit, getDocs } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { getLocalDate, formatMs } from '../utils/helpers';
import Timer from './Timer';
import { Play, Pause, CheckCircle, ZapOff, Zap } from 'lucide-react'; // Import Icons

export default function MemberDashboard() {
  const { currentUser } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentInterruption, setCurrentInterruption] = useState(null); // Track active power cut
  
  const today = getLocalDate();

  useEffect(() => {
    if (!currentUser) return;

    // 1. Listen for Tasks
    const qTasks = query(collection(db, 'tasks'), where('assignedTo', '==', currentUser.fullname));
    const unsubTasks = onSnapshot(qTasks, (snapshot) => {
      const fetchedTasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const relevantTasks = fetchedTasks.filter(t => t.date === today || t.isRunning === true);
      
      relevantTasks.sort((a, b) => {
        if (a.isRunning && !b.isRunning) return -1;
        if (!a.isRunning && b.isRunning) return 1;
        return 0;
      });
      setTasks(relevantTasks);
      setLoading(false);
    });

    // 2. Listen for Active Interruptions (Power Cuts)
    const qInt = query(
        collection(db, 'interruptions'), 
        where('user', '==', currentUser.fullname),
        where('active', '==', true),
        limit(1)
    );
    const unsubInt = onSnapshot(qInt, (snap) => {
        if (!snap.empty) {
            setCurrentInterruption({ id: snap.docs[0].id, ...snap.docs[0].data() });
        } else {
            setCurrentInterruption(null);
        }
    });

    return () => { unsubTasks(); unsubInt(); };
  }, [currentUser, today]);

  // --- ACTIONS ---

  const toggleTimer = async (task) => {
    if (currentInterruption) {
        alert("You cannot start a task during a Power Cut. Please resolve the interruption first.");
        return;
    }

    const taskRef = doc(db, 'tasks', task.id);
    if (task.isRunning) {
        const sessionDuration = Date.now() - task.lastStartTime;
        await updateDoc(taskRef, { isRunning: false, elapsedMs: (task.elapsedMs || 0) + sessionDuration, lastStartTime: null });
    } else {
        // Stop others
        const running = tasks.find(t => t.isRunning);
        if(running) {
             const rRef = doc(db, 'tasks', running.id);
             const rDur = Date.now() - running.lastStartTime;
             await updateDoc(rRef, { isRunning: false, elapsedMs: (running.elapsedMs||0) + rDur, lastStartTime: null });
        }
        await updateDoc(taskRef, { isRunning: true, lastStartTime: Date.now(), status: 'In Progress' });
    }
  };

  const markDone = async (task) => {
    if(!confirm("Complete?")) return;
    const taskRef = doc(db, 'tasks', task.id);
    let finalElapsed = task.elapsedMs || 0;
    if (task.isRunning) finalElapsed += (Date.now() - task.lastStartTime);
    await updateDoc(taskRef, { status: 'Done', isRunning: false, elapsedMs: finalElapsed, lastStartTime: null });
  };

  const togglePowerCut = async () => {
    if (currentInterruption) {
        // STOP POWER CUT (RESUME WORK)
        const intRef = doc(db, 'interruptions', currentInterruption.id);
        const duration = Date.now() - currentInterruption.startTime;
        await updateDoc(intRef, { active: false, endTime: Date.now(), durationMs: duration });
    } else {
        // START POWER CUT
        // 1. Stop any running tasks automatically
        const running = tasks.find(t => t.isRunning);
        if(running) {
             const rRef = doc(db, 'tasks', running.id);
             const rDur = Date.now() - running.lastStartTime;
             await updateDoc(rRef, { isRunning: false, elapsedMs: (running.elapsedMs||0) + rDur, lastStartTime: null });
        }

        // 2. Create Interruption Log
        await addDoc(collection(db, 'interruptions'), {
            user: currentUser.fullname,
            type: 'Power Cut',
            startTime: Date.now(),
            active: true,
            date: today
        });
    }
  };

  if (loading) return <div className="text-center p-10">Loading...</div>;

  return (
    <div className="space-y-6">
      {/* POWER CUT BANNER */}
      {currentInterruption ? (
        <div className="bg-red-600 text-white p-6 rounded-xl shadow-lg flex justify-between items-center animate-pulse">
            <div className="flex items-center gap-4">
                <ZapOff size={32} />
                <div>
                    <h2 className="text-xl font-bold">POWER CUT ACTIVE</h2>
                    <p className="opacity-90">Work paused since {new Date(currentInterruption.startTime).toLocaleTimeString()}</p>
                </div>
            </div>
            <button onClick={togglePowerCut} className="bg-white text-red-600 px-6 py-2 rounded-lg font-bold hover:bg-red-50">
                I Have Power Now (Resume)
            </button>
        </div>
      ) : (
         <div className="flex justify-end">
            <button onClick={togglePowerCut} className="btn text-amber-600 bg-amber-50 border-amber-200 hover:bg-amber-100">
                <ZapOff size={16} /> Report Power Cut
            </button>
         </div>
      )}

      {/* TASK LIST (Same as before, simplified for brevity) */}
      {Object.entries(tasks.reduce((acc, t) => { (acc[t.project] = acc[t.project] || []).push(t); return acc; }, {}))
       .map(([project, pTasks]) => (
        <div key={project}>
            <h3 className="text-lg font-bold mb-3">{project}</h3>
            <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
                {pTasks.map(task => (
                    <div key={task.id} className={`grid grid-cols-[1fr_auto_auto] gap-4 p-4 border-b last:border-0 ${task.isRunning ? 'bg-emerald-50' : ''}`}>
                        <div>
                            <div className="font-semibold">{task.description}</div>
                            <div className="text-xs text-text-sec">Est: {task.estHours}h</div>
                        </div>
                        <Timer startTime={task.lastStartTime} elapsed={task.elapsedMs} isRunning={task.isRunning} />
                        <div className="flex gap-2">
                            {task.status !== 'Done' && (
                                <>
                                <button onClick={() => toggleTimer(task)} disabled={!!currentInterruption} className={`btn-icon ${task.isRunning?'bg-warning text-white':''}`}>
                                    {task.isRunning ? <Pause size={16}/> : <Play size={16}/>}
                                </button>
                                <button onClick={() => markDone(task)} className="btn-icon text-success"><CheckCircle size={16}/></button>
                                </>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
      ))}
    </div>
  );
}