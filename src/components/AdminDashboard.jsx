import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, doc, deleteDoc } from 'firebase/firestore'; 
import { useAuth } from '../contexts/AuthContext';
import { useDate } from '../contexts/DateContext';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, Trash2, ZapOff, UserCheck, Edit2 } from 'lucide-react';
import Timer from './Timer';
import EditTaskModal from './EditTaskModal';

export default function AdminDashboard() {
  const { globalDate } = useDate();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  
  const [users, setUsers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [, setTick] = useState(0);

  const [editingTask, setEditingTask] = useState(null); 

  // Permission Checks
  const hasFullAccess = currentUser?.role === 'ADMIN' || currentUser?.role === 'SUPER_ADMIN';

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setLoading(true);
    
    // 1. LISTEN TO USERS (Members only)
    const qUsers = query(collection(db, 'users'), where('role', '==', 'MEMBER'));
    const unsubUsers = onSnapshot(qUsers, (snap) => {
        const userList = snap.docs.map(d => ({
            id: d.id, ...d.data(), onlineStatus: d.data().onlineStatus || 'Offline' 
        }));
        
        userList.sort((a, b) => a.fullname.localeCompare(b.fullname));
        setUsers(userList);
        setLoading(false); 
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
    if(!hasFullAccess) return;
    if(confirm("Are you sure you want to delete this task?")) {
        await deleteDoc(doc(db, 'tasks', taskId));
    }
  };

  const handleEditTask = (e, task) => {
      e.stopPropagation();
      if(!hasFullAccess) return;
      setEditingTask(task); 
  };

  if (loading) return <div className="text-center p-20 text-slate-400 animate-pulse font-bold tracking-widest uppercase">Syncing Dashboard...</div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-in fade-in pb-20 auto-rows-fr">
      {users.length === 0 && (
        <div className="col-span-full text-center text-slate-400 p-10 bg-white rounded-[32px] border-2 border-dashed border-slate-200">
            No active team members found for this workspace.
        </div>
      )}

      {users.map(user => {
        const userName = user.fullname;
        
        // --- STATUS LOGIC ---
        let displayStatus = user.onlineStatus;
        const lastSeenDate = user.lastSeen?.toDate();
        let statusText = displayStatus;

        if ((displayStatus === 'Online' || displayStatus === 'Idle') && lastSeenDate) {
            if ((Date.now() - lastSeenDate.getTime()) > 3 * 60 * 1000) {
                displayStatus = 'Offline';
                statusText = 'Offline (Timeout)';
            }
        }

        // --- TASKS LOGIC ---
        const userTasks = tasks.filter(t => t.assignedTo === userName);
        userTasks.sort((a,b) => (a.isRunning === b.isRunning ? 0 : a.isRunning ? -1 : 1));
        
        const workedMs = userTasks.reduce((acc, t) => acc + (t.elapsedMs || 0) + (t.isRunning ? (Date.now() - t.lastStartTime) : 0), 0);
        const efficiency = Math.min(100, Math.round((workedMs / (8 * 3600000)) * 100)); 

        const visibleTasks = userTasks.slice(0, 4);
        const hiddenCount = userTasks.length - 4;

        return (
          <div 
            key={user.id} 
            // Only Admins can navigate to private member detail pages
            onClick={() => hasFullAccess && navigate(`/member/${userName}`)} 
            className={`bg-white p-6 rounded-[32px] border-2 flex flex-col transition-all duration-300 relative group
                ${hasFullAccess ? 'cursor-pointer hover:shadow-2xl hover:border-indigo-200' : 'cursor-default'}
                ${displayStatus === 'Power Cut' ? 'border-red-100 bg-red-50/20' : 'border-slate-50'}`}
          >
            {/* LINK ICON - HIDDEN FROM COORDINATORS */}
            {hasFullAccess && (
                <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity text-indigo-600 bg-indigo-50 p-2 rounded-xl">
                    <ExternalLink size={16} />
                </div>
            )}

            {/* HEADER */}
            <div className="flex justify-between items-start mb-6">
                <div className="flex items-center gap-4">
                    <div className="relative">
                        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center font-black text-slate-400 border-2 border-white shadow-sm text-xl uppercase">
                            {userName.charAt(0)}
                        </div>
                        <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-4 border-white shadow-sm transition-all duration-700 ${
                            displayStatus === 'Online' ? 'bg-emerald-500' :
                            displayStatus === 'Idle' ? 'bg-amber-400' :
                            displayStatus === 'Break' ? 'bg-blue-500' :
                            displayStatus === 'Power Cut' ? 'bg-red-600 animate-pulse' :
                            'bg-slate-300'
                        }`}></div>
                    </div>

                    <div>
                        <h3 className="font-black text-slate-800 tracking-tight group-hover:text-indigo-600 transition-colors">
                            {userName}
                        </h3>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-[9px] uppercase font-black tracking-widest ${
                                displayStatus === 'Online' ? 'text-emerald-600' :
                                displayStatus === 'Idle' ? 'text-amber-500' :
                                displayStatus === 'Break' ? 'text-blue-600' :
                                displayStatus === 'Power Cut' ? 'text-red-600' :
                                'text-slate-400'
                            }`}>
                                {statusText}
                            </span>
                        </div>
                    </div>
                </div>

                {/* EFFICIENCY - HIDDEN FROM COORDINATORS */}
                {hasFullAccess ? (
                    <div className="text-right">
                        <div className={`text-2xl font-black tabular-nums ${efficiency >= 80 ? 'text-emerald-600' : efficiency >= 50 ? 'text-amber-500' : 'text-slate-400'}`}>
                            {efficiency}%
                        </div>
                        <div className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Efficiency</div>
                    </div>
                ) : (
                    // Neutral indicator for Coordinators
                    <div className="text-right">
                        <div className="bg-slate-50 text-slate-300 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border border-slate-100">
                           Active
                        </div>
                    </div>
                )}
            </div>

            {/* TASK LIST AREA */}
            <div className="flex-1 space-y-3">
                {visibleTasks.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-300 p-8 bg-slate-50/50 rounded-3xl border-2 border-dashed border-slate-100">
                        <UserCheck size={28} className="mb-2 opacity-30"/>
                        <span className="text-xs font-bold uppercase tracking-widest">No Active Tasks</span>
                    </div>
                ) : (
                    visibleTasks.map(task => {
                        const isRun = task.isRunning;
                        return (
                            <div key={task.id} className={`flex justify-between items-center p-3.5 rounded-2xl border-2 transition-all ${
                                isRun ? 'bg-indigo-50/50 border-indigo-100' : 'bg-slate-50/50 border-transparent hover:border-slate-100'
                            }`}>
                                <div className="truncate pr-2 flex-1">
                                    <div className="flex items-center gap-2">
                                        {isRun && <div className="w-2 h-2 rounded-full bg-indigo-600 animate-ping"></div>}
                                        <span className={`text-xs font-bold truncate ${task.status==='Done'?'line-through text-slate-300':'text-slate-700'}`}>
                                            {task.description}
                                        </span>
                                    </div>
                                    <div className="text-[9px] font-black text-slate-400 mt-1 uppercase tracking-tight">{task.project}</div>
                                </div>

                                <div className="flex items-center gap-3 shrink-0">
                                    <span className={`text-[11px] font-black font-mono ${isRun ? 'text-indigo-600' : 'text-slate-400'}`}>
                                        <Timer startTime={task.lastStartTime} elapsed={task.elapsedMs} isRunning={isRun} />
                                    </span>
                                    
                                    {/* ACTIONS - HIDDEN FROM COORDINATORS */}
                                    {hasFullAccess && (
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                            <button 
                                                onClick={(e) => handleEditTask(e, task)}
                                                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-lg transition-colors"
                                            >
                                                <Edit2 size={12} />
                                            </button>
                                            <button 
                                                onClick={(e) => handleDeleteTask(e, task.id)}
                                                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-white rounded-lg transition-colors"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {hiddenCount > 0 && (
                <div className="mt-4 pt-3 border-t-2 border-slate-50 text-center">
                    <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">
                        + {hiddenCount} other tasks in queue
                    </span>
                </div>
            )}
          </div>
        );
      })}

      <EditTaskModal 
        isOpen={!!editingTask} 
        task={editingTask} 
        onClose={() => setEditingTask(null)} 
      />
    </div>
  );
}