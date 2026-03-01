import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { collection, query, where, getDocs, doc, updateDoc, addDoc } from 'firebase/firestore';
import { useDate } from '../contexts/DateContext';
import { ArrowLeft, ZapOff, PlayCircle, Coffee, AlertCircle, CheckCircle } from 'lucide-react';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend);

// Helper for formatting durations
const formatDuration = (ms) => {
    if (!ms) return "00:00:00";
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export default function MemberDetail() {
  const { username } = useParams();
  const { globalDate } = useDate();
  const navigate = useNavigate();
  
  const [tasks, setTasks] = useState([]);
  const [powerLogs, setPowerLogs] = useState([]);
  const [breakLogs, setBreakLogs] = useState([]);
  const [idleLogs, setIdleLogs] = useState([]);
  const [activeInt, setActiveInt] = useState(null);
  const [stats, setStats] = useState({ worked: 0, idle: 0, breaks: 0, downtime: 0, netAvailable: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      
      const userQ = query(collection(db, 'users'), where('fullname', '==', username));
      const userSnap = await getDocs(userQ);
      if (userSnap.empty) { setLoading(false); return; }
      const userId = userSnap.docs[0].id;

      // Queries
      const qTasks = query(collection(db, 'tasks'), where('assignedTo', '==', username), where('date', '==', globalDate));
      const qInt = query(collection(db, 'interruptions'), where('user', '==', username), where('date', '==', globalDate));
      const qIdle = query(collection(db, 'idle_logs'), where('userId', '==', userId), where('date', '==', globalDate));
      const qBreaks = query(collection(db, 'breaks'), where('userId', '==', userId), where('date', '==', globalDate));
      const qActive = query(collection(db, 'interruptions'), where('user', '==', username), where('active', '==', true));
      const qPower = query(collection(db, 'power_logs'), where('userId', '==', userId), where('date', '==', globalDate));

      const [sTasks, sInt, sIdle, sBreaks, sActive, sPower] = await Promise.all([
        getDocs(qTasks), getDocs(qInt), getDocs(qIdle), getDocs(qBreaks), getDocs(qActive), getDocs(qPower)
      ]);

      const tData = sTasks.docs.map(d => ({...d.data(), id: d.id}));
      const idlData = sIdle.docs
        .map(d => d.data())
        .filter(d => d.startTime) 
        .sort((a,b) => a.startTime - b.startTime); // Sorted Ascending for pattern detection

      const brkData = sBreaks.docs.map(d => d.data()).sort((a,b) => b.startTime - a.startTime);
      const pwrLogs = sPower.docs.map(d => d.data()).sort((a,b) => b.startTime - a.startTime);

      setTasks(tData);
      setIdleLogs([...idlData].reverse()); // Reverse for UI display (Newest first)
      setBreakLogs(brkData);
      setPowerLogs(pwrLogs);
      setActiveInt(!sActive.empty ? {id: sActive.docs[0].id, ...sActive.docs[0].data()} : null);

      // --- CALCULATIONS ---
      const wMs = tData.reduce((acc, t) => acc + (t.elapsedMs || 0) + (t.isRunning ? (Date.now() - t.lastStartTime) : 0), 0);
      const brkMs = brkData.reduce((acc, i) => acc + (Number(i.durationMs) || 0), 0);
      const pwrMs = pwrLogs.reduce((acc, i) => acc + (Number(i.durationMs) || 0), 0);

      // --- NEW STRICT IDLE LOGIC ---
      let calculatedIdleMs = 0;
      let patternBuffer = [];

      idlData.forEach((log, index) => {
          const duration = Number(log.durationMs) || 0;
          const TEN_MINS = 10 * 60 * 1000;
          //const SPECIFIC_50S = 50 * 1000;
          //const SPECIFIC_110S = 110 * 1000;

          // SCENARIO 1: Record is 10 minutes or longer
          if (duration >= TEN_MINS) {
              calculatedIdleMs += duration;
              // Check if we just ended a pattern before this long break
              if (patternBuffer.length >= 3) {
                  calculatedIdleMs += patternBuffer.reduce((a, b) => a + b, 0);
              }
              patternBuffer = [];
          } 
          // SCENARIO 2: Specific pattern detection (Exactly 50s or 110s)
          /*else if (duration === SPECIFIC_50S || duration === SPECIFIC_110S) {
              patternBuffer.push(duration);
          } */
          // Reset buffer if record doesn't match criteria
          else {
              if (patternBuffer.length >= 3) {
                  calculatedIdleMs += patternBuffer.reduce((a, b) => a + b, 0);
              }
              patternBuffer = [];
          }

          // Final check at end of array
          if (index === idlData.length - 1 && patternBuffer.length >= 3) {
              calculatedIdleMs += patternBuffer.reduce((a, b) => a + b, 0);
          }
      });

      const standardDay = 8 * 60 * 60 * 1000;
      const netAvailable = Math.max(0, standardDay - pwrMs - brkMs);

      setStats({ 
          worked: wMs, 
          idle: calculatedIdleMs, 
          breaks: brkMs, 
          downtime: pwrMs, 
          netAvailable 
      });
      setLoading(false);
    };
    fetchData();
  }, [username, globalDate]);

  // Actions
  const reportPowerCut = async () => {
    if(!confirm(`Start a Power Outage for ${username}?`)) return;
    const userSnap = await getDocs(query(collection(db, 'users'), where('fullname', '==', username)));
    const userId = userSnap.docs[0].id;
    await addDoc(collection(db, 'interruptions'), { 
        user: username, userId: userId, active: true, startTime: Date.now(), date: globalDate, type: 'Power Cut' 
    });
    window.location.reload();
  };

  const resumeMember = async () => {
    if(!activeInt) return;
    if(!confirm(`Resume work for ${username}?`)) return;
    const duration = Date.now() - activeInt.startTime;
    await addDoc(collection(db, 'power_logs'), {
        userId: activeInt.userId, userName: username, startTime: activeInt.startTime, endTime: Date.now(), durationMs: duration, date: globalDate
    });
    await updateDoc(doc(db, 'interruptions', activeInt.id), { active: false, endTime: Date.now(), durationMs: duration });
    window.location.reload();
  };

  const score = stats.netAvailable > 0 ? Math.round((stats.worked / stats.netAvailable) * 100) : 0;

  if (loading) return <div className="p-20 text-center animate-pulse text-slate-400">Loading Report...</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20 animate-in fade-in">
      <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-100">
        <div className="flex items-center gap-4">
            <button onClick={() => navigate('/')} className="btn btn-ghost p-2"><ArrowLeft size={18} /></button>
            <div>
                <h1 className="text-2xl font-bold text-slate-800">{username}</h1>
                <p className="text-xs text-slate-400 font-mono">{globalDate}</p>
            </div>
            {activeInt && <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-bold animate-pulse">POWER CUT ACTIVE</span>}
        </div>
        <div>
            {activeInt ? (
                <button onClick={resumeMember} className="btn bg-emerald-500 text-white hover:bg-emerald-600 shadow-emerald-200 shadow-lg"><PlayCircle size={18} className="mr-2"/> Resume Member</button>
            ) : (
                <button onClick={reportPowerCut} className="btn btn-outline text-red-500 border-red-200 hover:bg-red-50"><ZapOff size={18} className="mr-2"/> Report Outage</button>
            )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <MetricCard label="Worked" value={formatDuration(stats.worked)} color="border-l-indigo-500 text-indigo-600" />
        <MetricCard label="Filtered Idle" value={formatDuration(stats.idle)} color="border-l-amber-500 text-amber-600" />
        <MetricCard label="Breaks" value={formatDuration(stats.breaks)} color="border-l-blue-500 text-blue-600" />
        <MetricCard label="Outages" value={formatDuration(stats.downtime)} color="border-l-red-500 text-red-600" />
        <MetricCard label="Efficiency" value={`${score}%`} color="border-l-emerald-500 text-emerald-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
            
            {/* IDLE LOGS */}
            <Section title="Raw Idle Log" icon={<AlertCircle size={16} className="text-amber-600"/>} css="bg-amber-50/50 border-amber-100">
                 {idleLogs.length === 0 ? <span className="italic text-slate-400 text-xs">No records found.</span> : idleLogs.map((log, i) => (
                    <div key={i} className="flex justify-between p-2 bg-white rounded border border-amber-100 mb-2 text-sm">
                        <span className="text-slate-500 font-mono">
                            {log.startTime ? new Date(log.startTime).toLocaleTimeString() : 'Unknown'} - 
                            {log.endTime ? new Date(log.endTime).toLocaleTimeString() : '...'}
                        </span>
                        <span className="font-bold text-amber-700">{formatDuration(log.durationMs)}</span>
                    </div>
                ))}
            </Section>

            {/* POWER & BREAKS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Section title="Power Outages" icon={<ZapOff size={16} className="text-red-600"/>} css="bg-red-50/50 border-red-100">
                    {powerLogs.map((log, i) => (
                        <div key={i} className="flex justify-between p-2 bg-white rounded border border-red-100 mb-2 text-sm">
                            <span className="text-slate-500 font-mono">{new Date(log.startTime).toLocaleTimeString()} - {new Date(log.endTime).toLocaleTimeString()}</span>
                            <span className="font-bold text-red-700">{formatDuration(log.durationMs)}</span>
                        </div>
                    ))}
                </Section>
                <Section title="Breaks" icon={<Coffee size={16} className="text-blue-600"/>} css="bg-blue-50/50 border-blue-100">
                    {breakLogs.map((log, i) => (
                        <div key={i} className="flex justify-between p-2 bg-white rounded border border-blue-100 mb-2 text-sm">
                            <span className="text-slate-500 font-mono">{new Date(log.startTime).toLocaleTimeString()} - {new Date(log.endTime).toLocaleTimeString()}</span>
                            <span className="font-bold text-blue-700">{formatDuration(log.durationMs)}</span>
                        </div>
                    ))}
                </Section>
            </div>
            
            <div className="card">
                <h3 className="font-bold mb-4 flex items-center gap-2 text-slate-700"><CheckCircle size={18}/> Productive Tasks</h3>
                {tasks.map((t, i) => {
                    const isDone = t.status === 'Done';
                    return (
                        <div key={i} className={`flex justify-between p-3 border-b last:border-0 hover:bg-slate-50 transition-colors ${isDone ? 'opacity-70 bg-slate-50' : ''}`}>
                            <div>
                                <div className={`font-medium ${isDone ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                                    {t.description}
                                </div>
                                <div className="text-[10px] text-slate-400 uppercase font-bold">{t.project}</div>
                            </div>
                            <span className={`font-mono font-bold ${isDone ? 'text-slate-400' : 'text-indigo-600'}`}>
                                {formatDuration(t.elapsedMs)}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>

        <div className="card h-fit sticky top-6 flex flex-col items-center">
            <h3 className="font-bold mb-6 text-slate-700">Time Split</h3>
            <Doughnut data={{
                labels: ['Work', 'Filtered Idle', 'Break', 'Power'],
                datasets: [{
                    data: [stats.worked, stats.idle, stats.breaks, stats.downtime],
                    backgroundColor: ['#6366f1', '#f59e0b', '#3b82f6', '#ef4444'],
                    borderWidth: 0
                }]
            }} />
        </div>
      </div>
    </div>
  );
}

function Section({ title, icon, children, css }) {
    return (
        <div className={`p-4 rounded-xl border ${css}`}>
            <h3 className="font-bold mb-3 flex items-center gap-2 text-sm uppercase tracking-wide">{icon} {title}</h3>
            <div className="max-h-60 overflow-y-auto pr-2 custom-scrollbar">{children}</div>
        </div>
    );
}

function MetricCard({ label, value, color }) {
    return (
        <div className={`bg-white p-4 rounded-xl border-l-4 shadow-sm ${color}`}>
            <p className="text-[10px] font-black uppercase text-slate-400 mb-1">{label}</p>
            <p className="text-2xl font-bold text-slate-800">{value}</p>
        </div>
    );
}