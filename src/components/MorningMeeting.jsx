import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { useDate } from '../contexts/DateContext';
import { Clock, CheckCircle, Coffee, Calendar, ArrowLeft, ChevronRight, ChevronLeft, User, Briefcase } from 'lucide-react';

// Helper: Format Milliseconds to HH:MM
const formatHours = (ms) => {
  if (!ms) return "0h 0m";
  const h = Math.floor(ms / (1000 * 60 * 60));
  const m = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  return `${h}h ${m}m`;
};

export default function MorningMeeting() {
  const { globalDate, setGlobalDate } = useDate();
  const [report, setReport] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState(null); // <--- State for Focus Mode

  // Auto-set date to "Yesterday" on first load
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    if (globalDate === today) {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        setGlobalDate(d.toISOString().split('T')[0]);
    }
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      // 1. Get Members
      const uSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'MEMBER')));
      const users = uSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // 2. Get Data
      const tSnap = await getDocs(query(collection(db, 'tasks'), where('date', '==', globalDate)));
      const bSnap = await getDocs(query(collection(db, 'breaks'), where('date', '==', globalDate)));

      const tasks = tSnap.docs.map(d => d.data());
      const breaks = bSnap.docs.map(d => d.data());

      // 3. Aggregate
      const data = users.map(user => {
        const userTasks = tasks.filter(t => t.assignedTo === user.fullname);
        const userBreaks = breaks.filter(b => b.userId === user.id);
        const totalWorkMs = userTasks.reduce((acc, t) => acc + (t.elapsedMs || 0), 0);
        
        // Sort: Done first
        userTasks.sort((a,b) => (a.status === 'Done' ? -1 : 1));

        return { ...user, tasks: userTasks, breaks: userBreaks, totalWorkMs };
      });

      data.sort((a, b) => a.fullname.localeCompare(b.fullname));
      setReport(data);
      setLoading(false);
    };
    fetchData();
  }, [globalDate]);

  // --- NAVIGATION LOGIC ---
  const handleNext = () => {
      const idx = report.findIndex(u => u.id === selectedUser.id);
      if (idx < report.length - 1) setSelectedUser(report[idx + 1]);
  };

  const handlePrev = () => {
      const idx = report.findIndex(u => u.id === selectedUser.id);
      if (idx > 0) setSelectedUser(report[idx - 1]);
  };

  if (loading) return <div className="p-20 text-center animate-pulse text-slate-400">Loading Meeting Data...</div>;

  // === VIEW 2: FOCUS MODE (One User) ===
  if (selectedUser) {
      const idx = report.findIndex(u => u.id === selectedUser.id);
      
      return (
        <div className="max-w-6xl mx-auto h-[calc(100vh-140px)] flex flex-col animate-in zoom-in-95 duration-300">
            
            {/* FOCUS HEADER */}
            <div className="flex justify-between items-center mb-6 bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                <button onClick={() => setSelectedUser(null)} className="btn btn-ghost hover:bg-slate-100 text-slate-500 flex items-center gap-2">
                    <ArrowLeft size={20}/> Back to Grid
                </button>
                
                <div className="flex items-center gap-2">
                    <button onClick={handlePrev} disabled={idx === 0} className="p-2 rounded-full hover:bg-slate-100 disabled:opacity-30 transition-colors">
                        <ChevronLeft size={24}/>
                    </button>
                    <span className="text-sm font-bold text-slate-400 uppercase tracking-widest px-4">
                        Member {idx + 1} / {report.length}
                    </span>
                    <button onClick={handleNext} disabled={idx === report.length - 1} className="p-2 rounded-full hover:bg-slate-100 disabled:opacity-30 transition-colors">
                        <ChevronRight size={24}/>
                    </button>
                </div>
            </div>

            {/* MAIN CARD */}
            <div className="flex-1 bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden flex flex-col md:flex-row">
                
                {/* LEFT: PROFILE & STATS */}
                <div className="md:w-80 bg-slate-50 border-r border-slate-100 p-8 flex flex-col items-center text-center">
                    <div className="w-32 h-32 bg-white rounded-full border-4 border-white shadow-lg flex items-center justify-center text-4xl font-bold text-indigo-600 mb-6">
                        {selectedUser.fullname.charAt(0)}
                    </div>
                    <h1 className="text-3xl font-bold text-slate-800 mb-1">{selectedUser.fullname}</h1>
                    <p className="text-slate-500 font-medium uppercase tracking-wide text-sm mb-8">{selectedUser.role}</p>

                    <div className="w-full space-y-4">
                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                            <div className="text-xs font-bold text-slate-400 uppercase mb-1">Total Output</div>
                            <div className="text-3xl font-mono font-bold text-indigo-600">{formatHours(selectedUser.totalWorkMs)}</div>
                        </div>
                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                            <div className="text-xs font-bold text-slate-400 uppercase mb-1">Tasks Logged</div>
                            <div className="text-3xl font-mono font-bold text-slate-700">{selectedUser.tasks.length}</div>
                        </div>
                    </div>
                </div>

                {/* RIGHT: TASK DETAILS */}
                <div className="flex-1 p-8 overflow-y-auto bg-white custom-scrollbar">
                    <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
                        <Briefcase className="text-slate-400" />
                        <h3 className="text-xl font-bold text-slate-700">Work Log</h3>
                    </div>

                    {selectedUser.tasks.length === 0 ? (
                         <div className="h-64 flex flex-col items-center justify-center text-slate-300 border-2 border-dashed border-slate-100 rounded-2xl">
                            <Briefcase size={48} className="mb-4 opacity-20"/>
                            <p className="text-lg font-medium">No tasks recorded.</p>
                         </div>
                    ) : (
                        <div className="space-y-4">
                            {selectedUser.tasks.map((task, i) => (
                                <div key={i} className="flex gap-4 p-5 rounded-xl border border-slate-100 hover:border-indigo-100 hover:shadow-md transition-all group">
                                    <div className={`mt-1 ${task.status === 'Done' ? 'text-emerald-500' : 'text-amber-500'}`}>
                                        <CheckCircle size={24} fill={task.status === 'Done' ? "currentColor" : "none"} className={task.status !== 'Done' ? "animate-pulse" : ""} />
                                    </div>
                                    <div className="flex-1">
                                        <h4 className={`text-lg font-medium ${task.status === 'Done' ? 'text-slate-800' : 'text-slate-600'}`}>
                                            {task.description}
                                        </h4>
                                        <div className="flex items-center gap-3 mt-2">
                                            <span className="text-xs font-bold bg-slate-100 text-slate-500 px-2 py-1 rounded uppercase tracking-wide">
                                                {task.project}
                                            </span>
                                            {task.status === 'Done' && <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded">Completed</span>}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xl font-mono font-bold text-indigo-600">
                                            {formatHours(task.elapsedMs)}
                                        </div>
                                        <div className="text-xs text-slate-400 mt-1">Duration</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* FAR RIGHT: BREAKS (Slim Column) */}
                <div className="w-64 bg-slate-50/50 border-l border-slate-100 p-6 overflow-y-auto">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                        <Coffee size={14}/> Breaks
                    </h3>
                    <div className="space-y-4 relative border-l-2 border-slate-200 ml-1.5 pl-6 py-2">
                        {selectedUser.breaks.map((b, i) => (
                             <div key={i} className="relative">
                                <div className="absolute -left-[31px] top-1.5 w-3 h-3 bg-white border-2 border-slate-300 rounded-full"></div>
                                <div className="text-sm font-mono font-bold text-slate-600">
                                    {new Date(b.startTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                                </div>
                                <div className="text-xs text-slate-400 mt-0.5">
                                    {Math.round(b.durationMs / 60000)} mins
                                </div>
                            </div>
                        ))}
                         {selectedUser.breaks.length === 0 && <div className="text-xs text-slate-400 italic">No breaks.</div>}
                    </div>
                </div>
            </div>
        </div>
      );
  }

  // === VIEW 1: THE GRID (Summary) ===
  return (
    <div className="max-w-7xl mx-auto pb-20 animate-in fade-in">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-10 bg-slate-900 text-white p-8 rounded-3xl shadow-xl">
        <div>
            <h1 className="text-3xl font-black tracking-tight mb-2">Morning Standup</h1>
            <div className="flex items-center gap-4 text-indigo-200">
                <Calendar size={20}/> 
                <span className="font-mono font-bold text-white text-lg">{new Date(globalDate).toDateString()}</span>
                <input 
                    type="date" 
                    className="bg-white/10 border-none rounded px-2 py-1 text-sm text-white cursor-pointer hover:bg-white/20"
                    value={globalDate}
                    onChange={(e) => setGlobalDate(e.target.value)}
                />
            </div>
        </div>
        <div className="text-right">
            <span className="text-xs font-bold uppercase tracking-widest text-indigo-400 block mb-1">Total Team Effort</span>
            <span className="text-4xl font-mono font-bold">
                {formatHours(report.reduce((acc, u) => acc + u.totalWorkMs, 0))}
            </span>
        </div>
      </div>

      <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-6 ml-1">Team Overview</h3>

      {/* GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {report.map(user => (
            <div 
                key={user.id} 
                onClick={() => setSelectedUser(user)}
                className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl hover:border-indigo-300 hover:-translate-y-1 transition-all cursor-pointer group"
            >
                <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-lg group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                        {user.fullname.charAt(0)}
                    </div>
                    <div className="bg-slate-50 px-3 py-1 rounded-full text-xs font-bold text-slate-500 font-mono group-hover:bg-indigo-50 group-hover:text-indigo-600">
                        {formatHours(user.totalWorkMs)}
                    </div>
                </div>
                
                <h3 className="text-lg font-bold text-slate-800 mb-1 group-hover:text-indigo-600 transition-colors">{user.fullname}</h3>
                <p className="text-xs text-slate-400 font-bold uppercase">{user.role}</p>

                <div className="mt-6 pt-4 border-t border-slate-100 flex justify-between items-center text-xs text-slate-500">
                    <span className="flex items-center gap-1"><CheckCircle size={14}/> {user.tasks.length} Tasks</span>
                    <span className="text-indigo-500 font-bold flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        View Details <ChevronRight size={14}/>
                    </span>
                </div>
            </div>
        ))}
      </div>
    </div>
  );
}