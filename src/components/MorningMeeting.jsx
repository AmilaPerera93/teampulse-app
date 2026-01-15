import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { useDate } from '../contexts/DateContext';
import { Clock, CheckCircle, Coffee, Calendar, ChevronRight, User } from 'lucide-react';

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

  // Auto-set date to "Yesterday" on first load if it's currently "Today"
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

      // 1. Get All Members
      const uSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'MEMBER')));
      const users = uSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // 2. Get Data for Selected Date
      const tSnap = await getDocs(query(collection(db, 'tasks'), where('date', '==', globalDate)));
      const bSnap = await getDocs(query(collection(db, 'breaks'), where('date', '==', globalDate)));

      const tasks = tSnap.docs.map(d => d.data());
      const breaks = bSnap.docs.map(d => d.data());

      // 3. Aggregate Data
      const data = users.map(user => {
        const userTasks = tasks.filter(t => t.assignedTo === user.fullname);
        const userBreaks = breaks.filter(b => b.userId === user.id);
        
        // Calculate Total Work Time
        const totalWorkMs = userTasks.reduce((acc, t) => acc + (t.elapsedMs || 0), 0);
        
        // Sort tasks: Done first, then In Progress
        userTasks.sort((a,b) => (a.status === 'Done' ? -1 : 1));

        return {
          ...user,
          tasks: userTasks,
          breaks: userBreaks,
          totalWorkMs
        };
      });

      // Sort users by name
      data.sort((a, b) => a.fullname.localeCompare(b.fullname));

      setReport(data);
      setLoading(false);
    };

    fetchData();
  }, [globalDate]);

  if (loading) return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-slate-400">
          <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
          <p className="animate-pulse">Preparing Meeting Slides...</p>
      </div>
  );

  return (
    <div className="max-w-7xl mx-auto pb-20 animate-in fade-in duration-500">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-10 bg-slate-900 text-white p-8 rounded-3xl shadow-2xl">
        <div>
            <h1 className="text-4xl font-black tracking-tight mb-2">Morning Standup</h1>
            <p className="text-indigo-200 text-lg flex items-center gap-2">
                <Calendar size={20}/> Reviewing: <span className="font-mono font-bold text-white">{new Date(globalDate).toDateString()}</span>
            </p>
        </div>
        <div className="mt-6 md:mt-0 bg-white/10 px-6 py-3 rounded-xl backdrop-blur-sm border border-white/10">
            <span className="text-xs font-bold uppercase tracking-widest text-indigo-300 block mb-1">Total Team Output</span>
            <span className="text-3xl font-mono font-bold">
                {formatHours(report.reduce((acc, u) => acc + u.totalWorkMs, 0))}
            </span>
        </div>
      </div>

      {/* USER CARDS GRID */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {report.map(user => (
            <div key={user.id} className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden flex flex-col group hover:shadow-xl hover:border-indigo-100 transition-all duration-300">
                
                {/* USER HEADER */}
                <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-white border-2 border-indigo-100 rounded-2xl flex items-center justify-center text-xl font-bold text-indigo-600 shadow-sm">
                            {user.fullname.charAt(0)}
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-800">{user.fullname}</h2>
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">{user.role}</span>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-xs font-bold text-slate-400 uppercase mb-0.5">Logged Work</div>
                        <div className={`text-2xl font-mono font-bold ${user.totalWorkMs > 25200000 ? 'text-emerald-600' : 'text-slate-700'}`}>
                            {formatHours(user.totalWorkMs)}
                        </div>
                    </div>
                </div>

                {/* CONTENT AREA */}
                <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-8">
                    
                    {/* LEFT: TASKS */}
                    <div className="md:col-span-2 space-y-4">
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <CheckCircle size={14}/> Tasks Completed / Working On
                        </h3>
                        
                        {user.tasks.length === 0 ? (
                            <div className="p-4 rounded-xl border-2 border-dashed border-slate-100 text-slate-400 text-sm italic text-center">
                                No tasks logged for this day.
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {user.tasks.map((task, i) => (
                                    <div key={i} className="flex justify-between items-start text-sm p-3 rounded-xl bg-slate-50 border border-slate-100">
                                        <div>
                                            <div className={`font-medium ${task.status === 'Done' ? 'text-slate-800' : 'text-indigo-600'}`}>
                                                {task.description}
                                            </div>
                                            <div className="text-[10px] font-bold text-slate-400 uppercase mt-1 bg-white px-1.5 py-0.5 rounded w-fit border border-slate-200">
                                                {task.project}
                                            </div>
                                        </div>
                                        <div className="font-mono font-bold text-slate-500 text-xs whitespace-nowrap bg-white px-2 py-1 rounded-md border border-slate-200">
                                            {formatHours(task.elapsedMs)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* RIGHT: BREAKS */}
                    <div className="border-l border-slate-100 pl-8 -ml-4 md:ml-0">
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-4">
                            <Coffee size={14}/> Break Log
                        </h3>
                        <div className="relative border-l-2 border-slate-100 ml-1 space-y-6 py-2">
                            {user.breaks.length === 0 ? (
                                <div className="pl-4 text-xs text-slate-400 italic">No breaks taken.</div>
                            ) : (
                                user.breaks.map((b, i) => (
                                    <div key={i} className="pl-4 relative">
                                        <div className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-indigo-200"></div>
                                        <div className="text-xs font-mono font-bold text-slate-600">
                                            {new Date(b.startTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                                        </div>
                                        <div className="text-[10px] text-slate-400 font-medium mt-0.5">
                                            Duration: {Math.round(b.durationMs / 60000)} mins
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                </div>
            </div>
        ))}
      </div>
    </div>
  );
}