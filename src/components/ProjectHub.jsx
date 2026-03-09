import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, updateDoc, doc, addDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { AlertCircle, CheckCircle2, Clock, MessageSquare, Plus, Target } from 'lucide-react';

export default function ProjectHub() {
  const { currentUser } = useAuth();
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [projectTasks, setProjectTasks] = useState([]);
  const [remarks, setRemarks] = useState("");

  // 1. Fetch Projects for the dropdown
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'projects'), (snap) => {
      const projs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setProjects(projs);
      if (projs.length > 0 && !selectedProjectId) setSelectedProjectId(projs[0].id);
    });
    return () => unsub();
  }, []);

  // 2. Sync Tasks & Statuses for the selected Project
  useEffect(() => {
    if (!selectedProjectId) return;
    
    const selectedProjName = projects.find(p => p.id === selectedProjectId)?.name;
    
    const q = query(collection(db, 'tasks'), where('project', '==', selectedProjName));
    const unsub = onSnapshot(q, (snap) => {
      setProjectTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [selectedProjectId, projects]);

  const addRemark = async (taskId) => {
    if (!remarks.trim()) return;
    await updateDoc(doc(db, 'tasks', taskId), {
      latestRemark: remarks,
      remarkBy: currentUser.fullname,
      remarkTime: Date.now()
    });
    setRemarks("");
  };

  const pendingTasks = projectTasks.filter(t => t.status !== 'Done');
  const completedTasks = projectTasks.filter(t => t.status === 'Done');

  return (
    <div className="p-6 bg-slate-50 min-h-screen animate-in fade-in duration-500">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Project Discussions</h1>
          <p className="text-slate-500 text-sm font-medium uppercase tracking-widest">Strategic Alignment Hub</p>
        </div>
        
        <select 
          value={selectedProjectId} 
          onChange={(e) => setSelectedProjectId(e.target.value)}
          className="bg-white border-2 border-slate-200 rounded-2xl px-4 py-3 font-bold text-slate-700 shadow-sm focus:ring-4 focus:ring-indigo-100 transition-all outline-none"
        >
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* LEFT: PENDING & UPCOMING TASKS */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
            <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
              <Target className="text-indigo-600" size={20}/> Active Sprint & Pending
            </h3>
            
            <div className="space-y-4">
              {pendingTasks.length === 0 ? (
                <div className="p-10 text-center text-slate-400 italic">No pending tasks for this project.</div>
              ) : pendingTasks.map(task => (
                <div key={task.id} className="group border-2 border-slate-50 hover:border-indigo-100 rounded-2xl p-5 transition-all hover:bg-indigo-50/30">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <span className="text-[10px] font-black bg-indigo-100 text-indigo-700 px-2 py-1 rounded-md uppercase mb-2 inline-block">
                        Assigned: {task.assignedTo}
                      </span>
                      <h4 className="font-bold text-slate-800 text-lg">{task.description}</h4>
                    </div>
                    <div className="flex items-center gap-2">
                        {task.isRunning ? 
                            <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full animate-pulse">
                                <Clock size={12}/> LIVE
                            </span> 
                            : 
                            <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-full">QUEUED</span>
                        }
                    </div>
                  </div>

                  {/* Remarks Display */}
                  {task.latestRemark && (
                    <div className="bg-amber-50 border-l-4 border-amber-400 p-3 rounded-r-xl mb-4 text-sm italic text-amber-800 flex gap-2 items-start">
                      <AlertCircle size={16} className="shrink-0 mt-0.5"/>
                      <div>
                        <span className="font-bold not-italic text-[11px] block">{task.remarkBy}:</span>
                        "{task.latestRemark}"
                      </div>
                    </div>
                  )}

                  {/* Add Remark Field */}
                  <div className="flex gap-2 mt-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <input 
                      type="text" 
                      placeholder="Add status update or blocker..."
                      className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none"
                      onChange={(e) => setRemarks(e.target.value)}
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

        {/* RIGHT: PROJECT STATS & DISCUSSION SIDEBAR */}
        <div className="space-y-6">
          {/* Project Health Card */}
          <div className="bg-indigo-600 rounded-3xl p-8 text-white shadow-xl shadow-indigo-100 relative overflow-hidden">
            <div className="relative z-10">
                <h4 className="text-[10px] font-black uppercase opacity-60 tracking-widest mb-2">Project Velocity</h4>
                <div className="text-4xl font-black mb-4">
                    {projectTasks.length > 0 ? Math.round((completedTasks.length / projectTasks.length) * 100) : 0}%
                </div>
                <div className="w-full bg-white/20 h-2 rounded-full overflow-hidden mb-6">
                    <div 
                        className="bg-white h-full transition-all duration-1000" 
                        style={{ width: `${projectTasks.length > 0 ? (completedTasks.length / projectTasks.length) * 100 : 0}%` }}
                    ></div>
                </div>
                <div className="flex justify-between text-[11px] font-bold opacity-80">
                    <span>{completedTasks.length} COMPLETED</span>
                    <span>{pendingTasks.length} TO GO</span>
                </div>
            </div>
            <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-3xl"></div>
          </div>

          {/* Recently Completed Log */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
             <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                <CheckCircle2 className="text-emerald-500" size={18}/> Recently Finished
             </h3>
             <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                {completedTasks.map(t => (
                    <div key={t.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <span className="text-xs font-medium text-slate-600 truncate mr-2">{t.description}</span>
                        <span className="text-[10px] font-black text-emerald-600 shrink-0">DONE</span>
                    </div>
                ))}
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}