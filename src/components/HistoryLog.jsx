import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { Calendar, Clock, ZapOff, Coffee, ChevronDown, ChevronUp, CheckCircle } from 'lucide-react';

// Format Helper (Local version to ensure no dependency errors)
const formatMs = (ms) => {
  if (!ms) return "00:00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export default function HistoryLog() {
  const { currentUser } = useAuth();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedDate, setExpandedDate] = useState(null);

  useEffect(() => {
    if (!currentUser) return;

    const fetchHistory = async () => {
      setLoading(true);
      try {
        // 1. Fetch Data
        // Tasks (for Worked Time)
        const qTasks = query(collection(db, 'tasks'), where('assignedTo', '==', currentUser.fullname));
        // Breaks
        const qBreaks = query(collection(db, 'breaks'), where('userId', '==', currentUser.id));
        // Power Cuts (Finished logs)
        const qPower = query(collection(db, 'power_logs'), where('userId', '==', currentUser.id));

        const [sTasks, sBreaks, sPower] = await Promise.all([
            getDocs(qTasks), getDocs(qBreaks), getDocs(qPower)
        ]);

        // 2. Group By Date
        const grouped = {};

        // Process Tasks
        sTasks.docs.forEach(doc => {
            const data = doc.data();
            const date = data.date; 
            if(!date) return;
            if(!grouped[date]) grouped[date] = { date, worked: 0, breaks: 0, power: 0, taskCount: 0 };
            
            // Add Elapsed Time + (Running time if applicable)
            let duration = data.elapsedMs || 0;
            grouped[date].worked += duration;
            grouped[date].taskCount += 1;
        });

        // Process Breaks
        sBreaks.docs.forEach(doc => {
            const data = doc.data();
            const date = data.date;
            if(!date) return;
            if(!grouped[date]) grouped[date] = { date, worked: 0, breaks: 0, power: 0, taskCount: 0 };
            grouped[date].breaks += (data.durationMs || 0);
        });

        // Process Power Cuts
        sPower.docs.forEach(doc => {
            const data = doc.data();
            const date = data.date;
            if(!date) return;
            if(!grouped[date]) grouped[date] = { date, worked: 0, breaks: 0, power: 0, taskCount: 0 };
            grouped[date].power += (data.durationMs || 0);
        });

        // 3. Convert to Array & Sort (Newest First)
        const sortedHistory = Object.values(grouped).sort((a, b) => new Date(b.date) - new Date(a.date));
        setHistory(sortedHistory);

      } catch (err) {
          console.error("Error loading history:", err);
      }
      setLoading(false);
    };

    fetchHistory();
  }, [currentUser]);

  if (loading) return <div className="p-20 text-center text-slate-400 animate-pulse">Loading History...</div>;

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in pb-20">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">My Work History</h2>
        <p className="text-slate-500">A daily summary of your activity, breaks, and outages.</p>
      </div>

      {history.length === 0 && (
          <div className="text-center p-20 bg-white rounded-xl border border-dashed border-slate-200">
              <Calendar className="mx-auto text-slate-300 mb-4" size={48}/>
              <h3 className="text-slate-500 font-medium">No work history recorded yet.</h3>
          </div>
      )}

      <div className="grid gap-4">
          {history.map((day) => {
              const isExpanded = expandedDate === day.date;
              const dateObj = new Date(day.date);

              return (
                  <div key={day.date} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                      {/* SUMMARY HEADER */}
                      <div 
                        onClick={() => setExpandedDate(isExpanded ? null : day.date)}
                        className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer"
                      >
                          <div className="flex items-center gap-4">
                              <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-xl flex flex-col items-center justify-center border border-indigo-100 shrink-0">
                                  <span className="text-[10px] font-bold uppercase">{dateObj.toLocaleString('default', { month: 'short' })}</span>
                                  <span className="text-2xl font-black leading-none">{dateObj.getDate()}</span>
                              </div>
                              <div>
                                  <h3 className="font-bold text-lg text-slate-800">{dateObj.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric' })}</h3>
                                  <div className="flex gap-2 text-xs text-slate-400 font-medium">
                                      <span>{day.taskCount} tasks logged</span>
                                  </div>
                              </div>
                          </div>

                          {/* METRICS ROW */}
                          <div className="flex items-center gap-2 md:gap-6 flex-wrap">
                              <MetricBadge icon={Clock} label="Worked" value={formatMs(day.worked)} color="text-emerald-600 bg-emerald-50 border-emerald-100" />
                              <MetricBadge icon={Coffee} label="Breaks" value={formatMs(day.breaks)} color="text-blue-600 bg-blue-50 border-blue-100" />
                              <MetricBadge icon={ZapOff} label="Power Cuts" value={formatMs(day.power)} color="text-red-600 bg-red-50 border-red-100" />
                              
                              <div className="ml-2 text-slate-300">
                                  {isExpanded ? <ChevronUp size={20}/> : <ChevronDown size={20}/>}
                              </div>
                          </div>
                      </div>
                  </div>
              );
          })}
      </div>
    </div>
  );
}

// Simple Badge Component for cleaner code
function MetricBadge({ icon: Icon, label, value, color }) {
    return (
        <div className={`flex items-center gap-3 px-4 py-2 rounded-lg border ${color}`}>
            <Icon size={16} />
            <div className="flex flex-col">
                <span className="text-[9px] uppercase font-bold opacity-70 leading-none mb-0.5">{label}</span>
                <span className="font-mono font-bold text-sm leading-none">{value}</span>
            </div>
        </div>
    );
}