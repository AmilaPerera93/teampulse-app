import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { Calendar, Clock, ZapOff, Coffee, ChevronDown, ChevronUp, CheckCircle, Activity } from 'lucide-react';

// Format Helper
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
    setLoading(true);

    // 1. DEFINE QUERIES
    const qTasks = query(collection(db, 'tasks'), where('assignedTo', '==', currentUser.fullname));
    const qBreaks = query(collection(db, 'breaks'), where('userId', '==', currentUser.id));
    const qPower = query(collection(db, 'power_logs'), where('userId', '==', currentUser.id));

    // 2. SETUP REAL-TIME LISTENERS
    let tasksData = [];
    let breaksData = [];
    let powerData = [];

    const processData = () => {
        const grouped = {};

        // Helper to init date object
        const initDate = (date) => {
            if (!grouped[date]) {
                grouped[date] = { 
                    date, 
                    worked: 0, 
                    breaks: 0, 
                    power: 0, 
                    taskList: [], 
                    breakList: [], 
                    powerList: [] 
                };
            }
        };

        // Process Tasks
        tasksData.forEach(t => {
            if (!t.date) return;
            initDate(t.date);
            grouped[t.date].worked += (t.elapsedMs || 0);
            grouped[t.date].taskList.push(t);
        });

        // Process Breaks
        breaksData.forEach(b => {
            if (!b.date) return;
            initDate(b.date);
            grouped[b.date].breaks += (b.durationMs || 0);
            grouped[b.date].breakList.push(b);
        });

        // Process Power Cuts
        powerData.forEach(p => {
            if (!p.date) return;
            initDate(p.date);
            grouped[p.date].power += (p.durationMs || 0);
            grouped[p.date].powerList.push(p);
        });

        // Convert to Array & Sort (Newest First)
        const sorted = Object.values(grouped).sort((a, b) => new Date(b.date) - new Date(a.date));
        setHistory(sorted);
        setLoading(false);
    };

    // 3. LISTENERS
    const unsubTasks = onSnapshot(qTasks, (snap) => {
        tasksData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        processData();
    });

    const unsubBreaks = onSnapshot(qBreaks, (snap) => {
        breaksData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        processData();
    });

    const unsubPower = onSnapshot(qPower, (snap) => {
        powerData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        processData();
    });

    // Cleanup listeners on unmount
    return () => {
        unsubTasks();
        unsubBreaks();
        unsubPower();
    };
  }, [currentUser]);

  if (loading) return <div className="p-20 text-center text-slate-400 animate-pulse">Loading Live History...</div>;

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in pb-20">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">My Work History</h2>
        <p className="text-slate-500">Live summary of your daily activity.</p>
      </div>

      {history.length === 0 && (
          <div className="text-center p-20 bg-white rounded-xl border border-dashed border-slate-200">
              <Calendar className="mx-auto text-slate-300 mb-4" size={48}/>
              <h3 className="text-slate-500 font-medium">No work records found.</h3>
          </div>
      )}

      <div className="space-y-4">
          {history.map((day) => {
              const isExpanded = expandedDate === day.date;
              const dateObj = new Date(day.date);

              return (
                  <div key={day.date} className={`bg-white border rounded-xl overflow-hidden transition-all duration-300 ${isExpanded ? 'border-indigo-200 shadow-md ring-1 ring-indigo-50' : 'border-slate-200 shadow-sm'}`}>
                      {/* SUMMARY HEADER */}
                      <div 
                        onClick={() => setExpandedDate(isExpanded ? null : day.date)}
                        className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-slate-50/50"
                      >
                          <div className="flex items-center gap-4">
                              <div className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center border shrink-0 transition-colors ${isExpanded ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-indigo-50 text-indigo-600 border-indigo-100'}`}>
                                  <span className="text-[10px] font-bold uppercase">{dateObj.toLocaleString('default', { month: 'short' })}</span>
                                  <span className="text-2xl font-black leading-none">{dateObj.getDate()}</span>
                              </div>
                              <div>
                                  <h3 className="font-bold text-lg text-slate-800">{dateObj.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric' })}</h3>
                                  <div className="flex gap-2 text-xs text-slate-400 font-medium">
                                      <span className="flex items-center gap-1"><CheckCircle size={10}/> {day.taskList.length} Tasks</span>
                                  </div>
                              </div>
                          </div>

                          {/* METRICS ROW */}
                          <div className="flex items-center gap-2 md:gap-4 flex-wrap">
                              <MetricBadge icon={Clock} label="Worked" value={formatMs(day.worked)} color="text-emerald-700 bg-emerald-50 border-emerald-100" />
                              <MetricBadge icon={Coffee} label="Breaks" value={formatMs(day.breaks)} color="text-blue-700 bg-blue-50 border-blue-100" />
                              <MetricBadge icon={ZapOff} label="Power Cuts" value={formatMs(day.power)} color="text-red-700 bg-red-50 border-red-100" />
                              
                              <div className={`ml-2 text-slate-300 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
                                  <ChevronDown size={20}/>
                              </div>
                          </div>
                      </div>

                      {/* EXPANDED DETAILS */}
                      {isExpanded && (
                          <div className="border-t border-slate-100 bg-slate-50/30 p-6 space-y-6 animate-in slide-in-from-top-2">
                              
                              {/* 1. TASKS LIST */}
                              <div>
                                  <h4 className="text-xs font-bold text-slate-400 uppercase mb-3 flex items-center gap-2">
                                      <Activity size={14}/> Completed Tasks
                                  </h4>
                                  <div className="space-y-2">
                                      {day.taskList.map((t, i) => (
                                          <div key={i} className="bg-white p-3 rounded-lg border border-slate-200 flex justify-between items-center text-sm shadow-sm">
                                              <div>
                                                  <div className="font-medium text-slate-700">{t.description}</div>
                                                  <div className="text-[10px] text-slate-400 font-bold uppercase">{t.project}</div>
                                              </div>
                                              <span className="font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded text-xs">{formatMs(t.elapsedMs)}</span>
                                          </div>
                                      ))}
                                      {day.taskList.length === 0 && <div className="text-xs italic text-slate-400">No tasks logged.</div>}
                                  </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                  {/* 2. BREAKS LIST */}
                                  <div>
                                      <h4 className="text-xs font-bold text-slate-400 uppercase mb-3 flex items-center gap-2">
                                          <Coffee size={14}/> Break History
                                      </h4>
                                      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                                          {day.breakList.map((b, i) => (
                                              <div key={i} className="flex justify-between items-center p-3 border-b border-slate-50 last:border-0 text-sm">
                                                  <span className="text-slate-500">{new Date(b.startTime).toLocaleTimeString()}</span>
                                                  <span className="font-mono font-bold text-slate-700">{formatMs(b.durationMs)}</span>
                                              </div>
                                          ))}
                                          {day.breakList.length === 0 && <div className="p-4 text-xs italic text-slate-400 text-center">No breaks taken.</div>}
                                      </div>
                                  </div>

                                  {/* 3. POWER CUTS LIST */}
                                  <div>
                                      <h4 className="text-xs font-bold text-slate-400 uppercase mb-3 flex items-center gap-2">
                                          <ZapOff size={14}/> Power Outages
                                      </h4>
                                      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                                          {day.powerList.map((p, i) => (
                                              <div key={i} className="flex justify-between items-center p-3 border-b border-slate-50 last:border-0 text-sm">
                                                  <span className="text-slate-500">{new Date(p.startTime).toLocaleTimeString()}</span>
                                                  <span className="font-mono font-bold text-red-600">{formatMs(p.durationMs)}</span>
                                              </div>
                                          ))}
                                          {day.powerList.length === 0 && <div className="p-4 text-xs italic text-slate-400 text-center">No outages reported.</div>}
                                      </div>
                                  </div>
                              </div>
                          </div>
                      )}
                  </div>
              );
          })}
      </div>
    </div>
  );
}

function MetricBadge({ icon: Icon, label, value, color }) {
    return (
        <div className={`flex items-center gap-3 px-3 py-2 rounded-lg border min-w-[120px] ${color}`}>
            <Icon size={16} />
            <div className="flex flex-col">
                <span className="text-[9px] uppercase font-bold opacity-60 leading-none mb-0.5">{label}</span>
                <span className="font-mono font-bold text-sm leading-none">{value}</span>
            </div>
        </div>
    );
}