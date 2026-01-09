import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { formatMs } from '../utils/helpers';
import { Calendar, Clock, AlertCircle, Coffee, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';

export default function HistoryLog() {
  const { currentUser } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedDay, setExpandedDay] = useState(null);

  useEffect(() => {
    if (!currentUser) return;

    const fetchHistory = async () => {
      setLoading(true);

      // 1. TASKS: assignedTo matches fullname
      // Note: Ensure your tasks collection actually has 'assignedTo' set to the fullname exactly as it is in auth
      const qTasks = query(collection(db, 'tasks'), where('assignedTo', '==', currentUser.fullname));
      
      // 2. LOGS: userId matches auth id
      const qIdle = query(collection(db, 'idle_logs'), where('userId', '==', currentUser.id));
      const qBreaks = query(collection(db, 'breaks'), where('userId', '==', currentUser.id));

      const [sTasks, sIdle, sBreaks] = await Promise.all([getDocs(qTasks), getDocs(qIdle), getDocs(qBreaks)]);

      // Group by Date String (YYYY-MM-DD)
      const grouped = {};
      
      const process = (snap, type) => {
          snap.docs.forEach(doc => {
              const data = doc.data();
              // Fallback: if 'date' is missing, try extracting from timestamp
              let dateKey = data.date;
              if (!dateKey && data.startTime) {
                   dateKey = new Date(data.startTime).toISOString().split('T')[0];
              }
              if (!dateKey) dateKey = 'Unknown Date';

              if (!grouped[dateKey]) grouped[dateKey] = { date: dateKey, tasks: [], idle: [], breaks: [], totalWorked: 0 };
              
              if (type === 'task') {
                  grouped[dateKey].tasks.push(data);
                  grouped[dateKey].totalWorked += (data.elapsedMs || 0);
              } else if (type === 'idle') {
                  grouped[dateKey].idle.push(data);
              } else if (type === 'break') {
                  grouped[dateKey].breaks.push(data);
              }
          });
      };

      process(sTasks, 'task');
      process(sIdle, 'idle');
      process(sBreaks, 'break');

      // Sort by date descending
      const historyArray = Object.values(grouped).sort((a, b) => new Date(b.date) - new Date(a.date));
      setLogs(historyArray);
      setLoading(false);
    };

    fetchHistory();
  }, [currentUser]);

  if (loading) return <div className="p-20 text-center text-slate-400 animate-pulse">Loading History...</div>;

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in pb-20">
      <div className="flex justify-between items-center mb-2">
        <div>
            <h2 className="text-2xl font-bold text-slate-800">Work History</h2>
            <p className="text-slate-500">Your past activity logs and timesheets.</p>
        </div>
      </div>

      {logs.length === 0 && (
          <div className="text-center p-20 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              <Calendar className="mx-auto text-slate-300 mb-4" size={48}/>
              <h3 className="text-slate-500 font-medium">No history records found yet.</h3>
              <p className="text-xs text-slate-400 mt-2">Complete some tasks or log time to see data here.</p>
          </div>
      )}

      {logs.map((day) => {
          const totalIdle = day.idle.reduce((acc, i) => acc + (i.durationMs || 0), 0);
          const totalBreak = day.breaks.reduce((acc, i) => acc + (i.durationMs || 0), 0);
          const isExpanded = expandedDay === day.date;
          
          // Helper to parse date safely
          const dateObj = new Date(day.date);
          const isValidDate = !isNaN(dateObj.getTime());

          return (
              <div key={day.date} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm transition-all">
                  <div 
                    onClick={() => setExpandedDay(isExpanded ? null : day.date)}
                    className="p-5 flex items-center justify-between cursor-pointer hover:bg-slate-50"
                  >
                      <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-lg flex flex-col items-center justify-center font-bold border border-indigo-100">
                              {isValidDate ? (
                                  <>
                                    <span className="text-xs uppercase">{dateObj.toLocaleString('default', { month: 'short' })}</span>
                                    <span className="text-xl leading-none">{dateObj.getDate()}</span>
                                  </>
                              ) : (
                                  <span className="text-xs">UNK</span>
                              )}
                          </div>
                          <div>
                              <h3 className="font-bold text-slate-700">
                                  {isValidDate ? dateObj.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : day.date}
                              </h3>
                              <div className="flex gap-4 text-xs text-slate-500 mt-1">
                                  <span className="flex items-center gap-1"><Clock size={12}/> Worked: <b className="text-slate-700">{formatMs(day.totalWorked)}</b></span>
                                  <span className="flex items-center gap-1"><AlertCircle size={12}/> Idle: <b className="text-slate-700">{formatMs(totalIdle)}</b></span>
                              </div>
                          </div>
                      </div>
                      
                      <div className="flex items-center gap-4">
                          <div className="text-right hidden sm:block">
                              <div className="text-xs text-slate-400 font-bold uppercase mb-1">Productivity</div>
                              <div className="font-mono font-bold text-indigo-600">
                                  {day.totalWorked > 0 ? Math.round((day.totalWorked / (day.totalWorked + totalIdle + totalBreak)) * 100) : 0}%
                              </div>
                          </div>
                          {isExpanded ? <ChevronUp className="text-slate-400"/> : <ChevronDown className="text-slate-400"/>}
                      </div>
                  </div>

                  {isExpanded && (
                      <div className="border-t border-slate-100 bg-slate-50/50 p-5 space-y-4">
                          {/* TASKS */}
                          <div>
                              <h4 className="text-xs font-bold text-slate-400 uppercase mb-2 flex items-center gap-2"><CheckCircle size={12}/> Completed Tasks</h4>
                              <div className="space-y-2">
                                  {day.tasks.map((t, i) => (
                                      <div key={i} className="bg-white p-3 rounded border border-slate-200 flex justify-between items-center text-sm">
                                          <span className="font-medium text-slate-700">{t.description}</span>
                                          <span className="font-mono text-slate-500">{formatMs(t.elapsedMs)}</span>
                                      </div>
                                  ))}
                                  {day.tasks.length === 0 && <div className="text-xs italic text-slate-400">No tasks logged.</div>}
                              </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                              {/* BREAKS */}
                              <div>
                                  <h4 className="text-xs font-bold text-slate-400 uppercase mb-2 flex items-center gap-2"><Coffee size={12}/> Breaks</h4>
                                  <div className="bg-white p-3 rounded border border-slate-200 text-sm space-y-1">
                                      {day.breaks.map((b, i) => (
                                          <div key={i} className="flex justify-between text-slate-500">
                                              <span>{new Date(b.startTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                                              <span className="font-mono">{formatMs(b.durationMs)}</span>
                                          </div>
                                      ))}
                                      {day.breaks.length === 0 && <div className="text-xs italic text-slate-400">No breaks taken.</div>}
                                  </div>
                              </div>
                              
                              {/* IDLE */}
                              <div>
                                  <h4 className="text-xs font-bold text-slate-400 uppercase mb-2 flex items-center gap-2"><AlertCircle size={12}/> Idle Sessions</h4>
                                  <div className="bg-white p-3 rounded border border-slate-200 text-sm space-y-1">
                                      {day.idle.map((l, i) => (
                                          <div key={i} className="flex justify-between text-slate-500">
                                              <span>{new Date(l.startTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                                              <span className="font-mono">{formatMs(l.durationMs)}</span>
                                          </div>
                                      ))}
                                      {day.idle.length === 0 && <div className="text-xs italic text-slate-400">No idle time recorded.</div>}
                                  </div>
                              </div>
                          </div>
                      </div>
                  )}
              </div>
          );
      })}
    </div>
  );
}