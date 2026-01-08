import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, doc, deleteDoc } from 'firebase/firestore'; 
import { useDate } from '../contexts/DateContext';
import { useNavigate } from 'react-router-dom';
import { Trash2, ExternalLink, Coffee } from 'lucide-react';
import Timer from './Timer';

// Helper for formatting "14m" or "1h 2m"
const formatMinutes = (ms) => {
    if (!ms) return "0m";
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m`;
};

export default function AdminDashboard() {
  const { globalDate } = useDate();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [breakData, setBreakData] = useState({}); // Stores total break time per user
  const [loading, setLoading] = useState(true);
  
  // State to force re-render every minute to update durations
  const [, setTick] = useState(0);

  // Pagination state
  const [expandedUsers, setExpandedUsers] = useState({});

  useEffect(() => {
    // Force UI update every 60 seconds
    const interval = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // 1. Listen to Users (REAL-TIME STATUS)
    const qUsers = query(collection(db, 'users'), where('role', '==', 'MEMBER'));
    const unsubUsers = onSnapshot(qUsers, (snap) => {
        const userList = snap.docs.map(d => ({
            id: d.id,
            ...d.data(),
            onlineStatus: d.data().onlineStatus || 'Offline' 
        }));
        
        // Sort: Break > Online > Idle > Offline
        userList.sort((a, b) => {
            const statusOrder = { 'Break': 0, 'Online': 1, 'Idle': 2, 'Offline': 3 };
            const aVal = statusOrder[a.onlineStatus] ?? 3;
            const bVal = statusOrder[b.onlineStatus] ?? 3;
            return aVal - bVal;
        });
        setUsers(userList);
    });

    // 2. Listen to Tasks (For Load Calc)
    const qTasks = query(collection(db, 'tasks'), where('date', '==', globalDate));
    const unsubTasks = onSnapshot(qTasks, (snap) => {
        setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 3. Listen to Breaks (For Total Break Calc)
    const qBreaks = query(collection(db, 'breaks'), where('date', '==', globalDate));
    const unsubBreaks = onSnapshot(qBreaks, (snap) => {
        const map = {}; // { userId: totalMs }
        snap.docs.forEach(d => {
            const data = d.data();
            map[data.userId] = (map[data.userId] || 0) + (data.durationMs || 0);
        });
        setBreakData(map);
        setLoading(false);
    });

    return () => { unsubUsers(); unsubTasks(); unsubBreaks(); };
  }, [globalDate]);

  const handleDelete = async (e, id) => {
    e.stopPropagation(); 
    if(confirm("Permanently delete this task?")) {
        await deleteDoc(doc(db, 'tasks', id));
    }
  };

  const toggleExpand = (e, userName) => {
    e.stopPropagation();
    setExpandedUsers(prev => ({ ...prev, [userName]: !prev[userName] }));
  };

  if (loading) return <div className="text-center p-10 text-text-sec animate-pulse">Loading Team Overview...</div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-in fade-in">
      {users.length === 0 && (
        <div className="col-span-full text-center text-text-sec p-10 bg-white rounded-xl border border-dashed border-slate-300">
            No team members found. Go to "Team" page to add users.
        </div>
      )}

      {users.map(user => {
        const userName = user.fullname;
        
        // --- STATUS & BREAK LOGIC ---
        let displayStatus = user.onlineStatus;
        const lastSeenDate = user.lastSeen?.toDate();
        let statusText = displayStatus;

        // A. Crash Detection
        if ((displayStatus === 'Online' || displayStatus === 'Idle') && lastSeenDate) {
            const diff = (Date.now() - lastSeenDate.getTime()) / 1000 / 60;
            if (diff > 3) {
                displayStatus = 'Offline';
                statusText = 'Offline';
            }
        }

        // B. Current Session Break Time
        let currentSessionBreakMs = 0;
        if (displayStatus === 'Break' && user.lastBreakStart) {
            currentSessionBreakMs = Date.now() - user.lastBreakStart;
            statusText = `Break (${formatMinutes(currentSessionBreakMs)})`;
        }

        // C. Grand Total Break Time (Past + Current)
        const pastBreaksMs = breakData[user.id] || 0;
        const grandTotalBreakMs = pastBreaksMs + currentSessionBreakMs;

        // Filter tasks
        const userTasks = tasks.filter(t => t.assignedTo === userName);
        userTasks.sort((a,b) => (a.isRunning === b.isRunning ? 0 : a.isRunning ? -1 : 1));
        const totalLoad = userTasks.reduce((acc, t) => acc + (t.estHours || 0), 0);
        
        // Pagination
        const isExpanded = expandedUsers[userName];
        const visibleTasks = isExpanded ? userTasks : userTasks.slice(0, 4);
        const hiddenCount = userTasks.length - 4;

        return (
          <div 
            key={user.id} 
            onClick={() => navigate(`/member/${userName}`)} 
            className="card card-hover h-fit cursor-pointer group relative transition-all duration-200 hover:shadow-md border-t-4 border-t-transparent hover:border-t-primary"
          >
            {/* Hover Hint */}

            

            <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-primary">
                <ExternalLink size={16} />
            </div>

            <div className="flex justify-between items-start mb-4 pb-3 border-b border-border">
                <div className="flex items-center gap-3">
                    {/* AVATAR + STATUS DOT */}
                    <div className="relative">
                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600 border border-slate-200 text-lg">
                            {userName.charAt(0)}
                        </div>
                        <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white shadow-sm transition-colors duration-500 ${
                            displayStatus === 'Online' ? 'bg-emerald-500' :
                            displayStatus === 'Idle' ? 'bg-amber-400' :
                            displayStatus === 'Break' ? 'bg-blue-500' :
                            'bg-slate-300'
                        }`} title={displayStatus}></div>
                    </div>

                    <div>
                        <h3 className="font-bold text-lg leading-tight group-hover:text-primary transition-colors">
                            {userName}
                        </h3>
                        {/* DYNAMIC STATUS TEXT */}
                        <span className={`text-[10px] uppercase font-bold tracking-wider transition-colors duration-300 ${
                             displayStatus === 'Online' ? 'text-emerald-600' :
                             displayStatus === 'Idle' ? 'text-amber-500' :
                             displayStatus === 'Break' ? 'text-blue-600' :
                             'text-slate-400'
                        }`}>
                            {statusText}
                        </span>
                    </div>
                </div>

                {/* STATS BADGES */}
                <div className="flex flex-col items-end gap-1">
                    <span className="text-xs font-bold text-text-sec bg-slate-100 px-2 py-1 rounded">
                        {totalLoad}h Load
                    </span>
                    {grandTotalBreakMs > 0 && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 ${grandTotalBreakMs > 3600000 ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-500'}`}>
                            <Coffee size={10} /> {formatMinutes(grandTotalBreakMs)}
                        </span>
                    )}
                </div>
            </div>

            <div className="space-y-3">
                {visibleTasks.length === 0 && (
                    <div className="text-center italic text-text-sec text-sm py-4 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                        No tasks assigned
                    </div>
                )}

                {visibleTasks.map(task => {
                    const isRun = task.isRunning;
                    return (
                        <div key={task.id} className={`flex justify-between items-center text-sm p-3 rounded-lg border transition-all duration-300
                            ${isRun ? 'bg-emerald-50 border-emerald-200 shadow-sm' : 'bg-white border-transparent border-b-slate-100 hover:bg-slate-50'}`}>
                            
                            <div className="overflow-hidden pr-2">
                                <div className={`font-semibold truncate flex items-center ${task.status === 'Done' ? 'line-through text-slate-400' : 'text-text-main'}`}>
                                    {isRun && <span className="inline-block w-2 h-2 bg-emerald-500 rounded-full mr-2 animate-pulse"></span>}
                                    {task.description}
                                </div>
                                <div className="text-xs text-text-sec truncate">{task.project}</div>
                            </div>

                            <div className="flex items-center gap-3 shrink-0">
                                <div className={`font-mono font-bold ${isRun ? 'text-emerald-600' : 'text-slate-400'}`}>
                                    <Timer 
                                        startTime={task.lastStartTime} 
                                        elapsed={task.elapsedMs} 
                                        isRunning={isRun} 
                                    />
                                </div>
                                <button 
                                    onClick={(e) => handleDelete(e, task.id)}
                                    className="text-slate-300 hover:text-red-500 transition-colors p-1.5 rounded-full hover:bg-red-50"
                                    title="Delete Task"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {hiddenCount > 0 && (
                <button 
                    onClick={(e) => toggleExpand(e, userName)}
                    className="w-full text-center text-xs text-primary font-bold mt-3 pt-2 border-t border-dashed border-slate-200 hover:underline opacity-80 hover:opacity-100"
                >
                    {isExpanded ? 'Show Less' : `View ${hiddenCount} More Tasks`}
                </button>
            )}
          </div>
        );
      })}
    </div>
  );
}