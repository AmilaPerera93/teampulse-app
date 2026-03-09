import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { AlertCircle, CheckCircle2, Clock, Plus, Target, CheckCircle } from 'lucide-react';

export default function ProjectHub() {
  const { currentUser } = useAuth();
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [projectTasks, setProjectTasks] = useState([]);
  const [remarks, setRemarks] = useState({}); // Changed to object to track per-task input

  // 1. Fetch Projects for the dropdown
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'projects'), (snap) => {
      const projs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setProjects(projs);
      if (projs.length > 0 && !selectedProjectId) setSelectedProjectId(projs[0].id);
    });
    return () => unsub();
  }, []);

  // 2. Sync Tasks for the selected Project
  useEffect(() => {
    if (!selectedProjectId) return;
    const selectedProjName = projects.find(p => p.id === selectedProjectId)?.name;
    
    const q = query(collection(db, 'tasks'), where('project', '==', selectedProjName));
    const unsub = onSnapshot(q, (snap) => {
      setProjectTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [selectedProjectId, projects]);

  // --- ACTIONS ---
  const addRemark = async (taskId) => {
    const taskRemark = remarks[taskId];
    if (!taskRemark || !taskRemark.trim()) return;

    await updateDoc(doc(db, 'tasks', taskId), {
      latestRemark: taskRemark,
      remarkBy: currentUser.fullname,
      remarkTime: Date.now()
    });
    setRemarks(prev => ({ ...prev, [taskId]: "" })); // Clear specific input
  };

  const handleManualComplete = async (task) => {
    if (currentUser.role !== 'ADMIN' && currentUser.role !== 'SUPER_ADMIN') return;
    if (!confirm(`Mark "${task.description}" as completed for ${task.assignedTo}?`)) return;

    await updateDoc(doc(db, 'tasks', task.id), {
      status: 'Done',
      completedBy: currentUser.fullname,
      completedAt: serverTimestamp()
    });
  };

  // --- LOGIC: CONSOLIDATE DUPLICATE TASKS ---
  // If "Shiftsmart MT" exists twice for the same person, we only show it once 
  // but could sum up their progress if needed.
  const getConsolidatedTasks = (tasks) => {
    const seen = new Set();
    return tasks.filter(t => {
      const duplicateKey = `${t.description}-${t.assignedTo}`;
      if (seen.has(duplicateKey)) return false;
      seen.add(duplicateKey);
      return true;
    });
  };

  const allPending = projectTasks.filter(t => t.status !== 'Done');
  const consolidatedPending = getConsolidatedTasks(allPending);
  const completedTasks = projectTasks.filter(t => t.status === 'Done');

  return (
    <div className="p-6 bg-slate-50 min-h-screen animate-in fade-in duration-500">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Project Discussions</h1>
          <p className="text-slate-500 text-sm font-medium uppercase tracking-widest italic">Standup Mode</p>
        </div>
        
        <select 
          value={selectedProjectId} 
          onChange={(e) => setSelectedProjectId(e.target.value)}
          className="bg-white border-2 border-slate-200 rounded-2xl px-4 py-3 font-bold text-slate-700 shadow-sm focus:ring-4 focus:ring-indigo-100 outline-none"
        >
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT: PENDING TASKS */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
            <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
              <Target className="text-indigo-600" size={20}/> Current Focus & Blockers
            </h3>
            
            <div className="space-y-4">
              {consolidatedPending.length === 0 ? (
                <div className="p-10 text-center text-slate-400 italic">No pending tasks for this project.</div>
              ) : consolidatedPending.map(task => (
                <div key={task.id} className="group border-2 border-slate-50 hover:border-indigo-100 rounded-2xl p-5 transition-all hover:bg-indigo-50/30 relative">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <span className="text-[10px] font-black bg-indigo-100 text-indigo-700 px-2 py-1 rounded-md uppercase mb-2 inline-block mr-2">
                        {task.assignedTo}
                      </span>
                      <h4 className="font-bold text-slate-800 text-lg">{task.description}</h4>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      {/* ADMIN TOOLS */}
                      {(currentUser.role === 'ADMIN' || currentUser.role === 'SUPER_ADMIN') && (
                        <button 
                          onClick={() => handleManualComplete(task)}
                          className="p-2 text-slate-300 hover:text-emerald-500 hover:bg-emerald-50 rounded-xl transition-all"
                          title="Manual Complete"
                        >
                          <CheckCircle size={22} />
                        </button>
                      )}

                      {task.isRunning ? 
                        <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full animate-pulse">
                          <Clock size={12}/> LIVE
                        </span> 
                        : 
                        <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-full uppercase">Queued</span>
                      }
                    </div>
                  </div>

                  {/* Remarks Display */}
                  {task.latestRemark && (
                    <div className="bg-amber-50 border-l-4 border-amber-400 p-3 rounded-r-xl mb-4 text-sm italic text-amber-800 flex gap-2 items-start">
                      <AlertCircle size={16} className="shrink-0 mt-0.5"/>
                      <div>
                        <span className="font-bold not-italic text-[11px] block">{task.remarkBy} (Latest Status):</span>
                        "{task.latestRemark}"
                      </div>
                    </div>
                  )}

                  {/* Add Remark Field (Available to Team & Admins) */}
                  <div className="flex gap-2 mt-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <input 
                      type="text" 
                      value={remarks[task.id] || ""}
                      placeholder="Add status update or blocker..."
                      className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none"
                      onChange={(e) => setRemarks(prev => ({ ...prev, [task.id]: e.target.value }))}
                    />
                    <button 
                      onClick={() => addRemark(task.id)}
                      className="bg-slate-900 text-white p-2 rounded-xl hover:bg-indigo-600 transition-colors"
                    >
                      <Plus size={18}/>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT: PROJECT STATS */}
        <div className="space-y-6">
          <div className="bg-indigo-600 rounded-3xl p-8 text-white shadow-xl shadow-indigo-100 relative overflow-hidden">
            <div className="relative z-10">
                <h4 className="text-[10px] font-black uppercase opacity-60 tracking-widest mb-2 text-white">Project Health</h4>
                <div className="text-4xl font-black mb-4">
                    {projectTasks.length > 0 ? Math.round((completedTasks.length / projectTasks.length) * 100) : 0}%
                </div>
                <div className="w-full bg-white/20 h-2 rounded-full overflow-hidden mb-6">
                    <div 
                        className="bg-white h-full transition-all duration-1000" 
                        style={{ width: `${projectTasks.length > 0 ? (completedTasks.length / projectTasks.length) * 100 : 0}%` }}
                    ></div>
                </div>
                <div className="flex justify-between text-[11px] font-bold opacity-80 uppercase">
                    <span>{completedTasks.length} DONE</span>
                    <span>{allPending.length} REMAINING</span>
                </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
             <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                <CheckCircle2 className="text-emerald-500" size={18}/> Logged as Done
             </h3>
             <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {completedTasks.length === 0 ? <p className="text-xs text-slate-400 italic">No completed tasks yet.</p> : 
                  completedTasks.map(t => (
                    <div key={t.id} className="flex flex-col p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <span className="text-xs font-bold text-slate-700">{t.description}</span>
                        <span className="text-[10px] text-slate-400 uppercase font-black mt-1">By: {t.assignedTo}</span>
                    </div>
                ))}
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}