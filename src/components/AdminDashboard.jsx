import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, doc, deleteDoc } from 'firebase/firestore'; 
import { useDate } from '../contexts/DateContext';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, Trash2, ZapOff, CheckCircle, Edit2 } from 'lucide-react'; // ADDED: Edit2
import Timer from './Timer';
import EditTaskModal from './EditTaskModal'; // ADDED: Import the Modal

export default function AdminDashboard() {
  const { globalDate } = useDate();
  const navigate = useNavigate();
  
  const [users, setUsers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [, setTick] = useState(0);

  // --- ADDED: State for the task currently being edited ---
  const [editingTask, setEditingTask] = useState(null); 

  // Tick every minute for live durations
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setLoading(true);
    
    // 1. LISTEN TO USERS
    const qUsers = query(collection(db, 'users'), where('role', '==', 'MEMBER'));
    const unsubUsers = onSnapshot(qUsers, (snap) => {
        const userList = snap.docs.map(d => ({
            id: d.id, ...d.data(), onlineStatus: d.data().onlineStatus || 'Offline' 
        }));
        
        // Sort: Power Cut > Break > Online > Idle > Offline
        userList.sort((a, b) => {
            const statusOrder = { 'Power Cut': -1, 'Break': 0, 'Online': 1, 'Idle': 2, 'Offline': 3 };
            return (statusOrder[a.onlineStatus] ?? 3) - (statusOrder[b.onlineStatus] ?? 3);
        });
        setUsers(userList);
        setLoading(false); // Stop loading immediately after users load
    });

    // 2. LISTEN TO TASKS
    const qTasks = query(collection(db, 'tasks'), where('date', '==', globalDate));
    const unsubTasks = onSnapshot(qTasks, (snap) => {
        setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubUsers(); unsubTasks(); };
  }, [globalDate]);

  const handleDeleteTask = async (e, taskId) => {
    e.stopPropagation(); 
    if(confirm("Are you sure you want to delete this task?")) {
        await deleteDoc(doc(db, 'tasks', taskId));
    }
  };

  // --- ADDED: Handler to open the edit modal ---
  const handleEditTask = (e, task) => {
      e.stopPropagation();
      setEditingTask(task); 
  };

  if (loading) return <div className="text-center p-20 text-slate-400 animate-pulse">Loading Dashboard...</div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-in fade-in pb-20 auto-rows-fr">
      {users.length === 0 && (
        <div className="col-span-full text-center text-slate-400 p-10 bg-white rounded-xl border border-dashed border-slate-300">
            No team members found.
        </div>
      )}

      {users.map(user => {
        const userName = user.fullname;
        
        // --- STATUS LOGIC ---
        let displayStatus = user.onlineStatus;
        const lastSeenDate = user.lastSeen?.toDate();
        let statusText = displayStatus;

        // Crash Detection (3 mins)
        if ((displayStatus === 'Online' || displayStatus === 'Idle') && lastSeenDate) {
            if ((Date.now() - lastSeenDate.getTime()) > 3 * 60 * 1000) {
                displayStatus = 'Offline';
                statusText = 'Offline (Timeout)';
            }
        }

        // --- TASKS LOGIC ---
        const userTasks = tasks.filter(t => t.assignedTo === userName);
        userTasks.sort((a,b) => (a.isRunning === b.isRunning ? 0 : a.isRunning ? -1 : 1));
        
        // Efficiency Calc
        const workedMs = userTasks.reduce((acc, t) => acc + (t.elapsedMs || 0) + (t.isRunning ? (Date.now() - t.lastStartTime) : 0), 0);
        const efficiency = Math.min(100, Math.round((workedMs / (8 * 3600000)) * 100)); 

        // We only show top 4 tasks
        const visibleTasks = userTasks.slice(0, 4);
        const hiddenCount = userTasks.length - 4;

        return (
          <div 
            key={user.id} 
            onClick={() => navigate(`/member/${userName}`)} 
            className={`card h-full flex flex-col cursor-pointer group relative transition-all duration-200 hover:shadow-lg border-t-4 
                ${displayStatus === 'Power Cut' ? 'border-t-red-500 bg-red-50/10' : 'border-t-transparent hover:border-t-primary bg-white'}`}
          >
            {/* HOVER ACTION */}
            <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-primary">
                <ExternalLink size={16} />
            </div>

            {/* HEADER */}
            <div className="flex justify-between items-start mb-4 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600 border border-slate-200 text-lg">
                            {userName.charAt(0)}
                        </div>
                        <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white shadow-sm transition-colors duration-500 ${
                            displayStatus === 'Online' ? 'bg-emerald-500' :
                            displayStatus === 'Idle' ? 'bg-amber-400' :
                            displayStatus === 'Break' ? 'bg-blue-500' :
                            displayStatus === 'Power Cut' ? 'bg-red-600 animate-pulse' :
                            'bg-slate-300'
                        }`}></div>
                    </div>

                    <div>
                        <h3 className="font-bold text-lg leading-tight text-slate-800 group-hover:text-primary transition-colors">
                            {userName}
                        </h3>
                        <div className="flex items-center gap-2">
                            <span className={`text-[10px] uppercase font-bold tracking-wider ${
                                displayStatus === 'Online' ? 'text-emerald-600' :
                                displayStatus === 'Idle' ? 'text-amber-500' :
                                displayStatus === 'Break' ? 'text-blue-600' :
                                displayStatus === 'Power Cut' ? 'text-red-600' :
                                'text-slate-400'
                            }`}>
                                {statusText}
                            </span>
                            {displayStatus === 'Power Cut' && <ZapOff size={12} className="text-red-600 animate-pulse"/>}
                        </div>
                    </div>
                </div>

                <div className="text-right">
                    <div className={`text-xl font-mono font-bold ${efficiency >= 80 ? 'text-emerald-600' : efficiency >= 50 ? 'text-amber-500' : 'text-slate-400'}`}>
                        {efficiency}%
                    </div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase">Efficiency</div>
                </div>
            </div>

            {/* TASK LIST AREA */}
            <div className="flex-1 space-y-2">
                {visibleTasks.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-300 italic text-sm min-h-[100px]">
                        <CheckCircle size={24} className="mb-2 opacity-50"/>
                        No tasks assigned
                    </div>
                ) : (
                    visibleTasks.map(task => {
                        const isRun = task.isRunning;
                        return (
                            <div key={task.id} className={`flex justify-between items-center text-xs p-3 rounded-lg border transition-all ${
                                isRun ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-transparent hover:bg-white hover:border-slate-200'
                            }`}>
                                <div className="truncate pr-2 flex-1">
                                    <div className="flex items-center gap-2">
                                        {isRun && <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></div>}
                                        <span className={`font-medium truncate ${task.status==='Done'?'line-through text-slate-400':'text-slate-700'}`}>
                                            {task.description}
                                        </span>
                                    </div>
                                    <div className="text-[10px] text-slate-400 mt-0.5">{task.project}</div>
                                </div>

                                <div className="flex items-center gap-3 shrink-0">
                                    <span className={`font-mono font-bold ${isRun ? 'text-indigo-600' : 'text-slate-400'}`}>
                                        <Timer startTime={task.lastStartTime} elapsed={task.elapsedMs} isRunning={isRun} />
                                    </span>
                                    
                                    {/* --- ADDED: EDIT & DELETE BUTTONS --- */}
                                    <div className="flex bg-white rounded border border-slate-200 overflow-hidden">
                                        <button 
                                            onClick={(e) => handleEditTask(e, task)}
                                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors border-r border-slate-200"
                                            title="Edit Task"
                                        >
                                            <Edit2 size={12} />
                                        </button>
                                        <button 
                                            onClick={(e) => handleDeleteTask(e, task.id)}
                                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                            title="Delete Task"
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* FOOTER */}
            {hiddenCount > 0 && (
                <div className="pt-3 mt-2 border-t border-slate-100 text-center">
                    <span className="text-xs text-slate-400 font-medium">
                        + {hiddenCount} more tasks...
                    </span>
                </div>
            )}
          </div>
        );
      })}

      {/* --- ADDED: MODAL COMPONENT --- */}
      <EditTaskModal 
        isOpen={!!editingTask} 
        task={editingTask} 
        onClose={() => setEditingTask(null)} 
      />
    </div>
  );
}