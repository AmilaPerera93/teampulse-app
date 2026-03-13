import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { collection, query, where, getDocs, doc, updateDoc, addDoc } from 'firebase/firestore';
import { useDate } from '../contexts/DateContext';
import { ArrowLeft, ZapOff, PlayCircle, Coffee, AlertCircle, CheckCircle, ShieldAlert } from 'lucide-react';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend);

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
  const [stats, setStats] = useState({ worked: 0, idle: 0, breaks: 0, downtime: 0, netAvailable: 0, scriptDetected: false });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      
      const userQ = query(collection(db, 'users'), where('fullname', '==', username));
      const userSnap = await getDocs(userQ);
      if (userSnap.empty) { setLoading(false); return; }
      const userId = userSnap.docs[0].id;

      const qTasks = query(collection(db, 'tasks'), where('assignedTo', '==', username), where('date', '==', globalDate));
      const qIdle = query(collection(db, 'idle_logs'), where('userId', '==', userId), where('date', '==', globalDate));
      const qBreaks = query(collection(db, 'breaks'), where('userId', '==', userId), where('date', '==', globalDate));
      const qActive = query(collection(db, 'interruptions'), where('user', '==', username), where('active', '==', true));
      const qPower = query(collection(db, 'power_logs'), where('userId', '==', userId), where('date', '==', globalDate));

      const [sTasks, sIdle, sBreaks, sActive, sPower] = await Promise.all([
        getDocs(qTasks), getDocs(qIdle), getDocs(qBreaks), getDocs(qActive), getDocs(qPower)
      ]);

      const tData = sTasks.docs.map(d => ({...d.data(), id: d.id}));
      const idlData = sIdle.docs
        .map(d => d.data())
        .filter(d => d.startTime) 
        .sort((a,b) => a.startTime - b.startTime); 

      const brkData = sBreaks.docs.map(d => d.data()).sort((a,b) => b.startTime - a.startTime);
      const pwrLogs = sPower.docs.map(d => d.data()).sort((a,b) => b.startTime - a.startTime);

      setTasks(tData);
      setIdleLogs([...idlData].reverse());
      setBreakLogs(brkData);
      setPowerLogs(pwrLogs);
      setActiveInt(!sActive.empty ? {id: sActive.docs[0].id, ...sActive.docs[0].data()} : null);

      const wMs = tData.reduce((acc, t) => acc + (t.elapsedMs || 0) + (t.isRunning ? (Date.now() - t.lastStartTime) : 0), 0);
      const brkMs = brkData.reduce((acc, i) => acc + (Number(i.durationMs) || 0), 0);
      const pwrMs = pwrLogs.reduce((acc, i) => acc + (Number(i.durationMs) || 0), 0);

      // --- SILENT PATTERN DETECTION (The "Jiggler" Hunter) ---
      let calculatedIdleMs = 0;
      
      // 1. Long Breaks (10+ mins) - Always counted
      const longBreaksList = idlData.filter(log => (Number(log.durationMs) || 0) >= 600000);
      
      // 2. Suspicious bursts (20s to 5 mins)
      const suspiciousBursts = idlData.filter(log => {
          const d = Number(log.durationMs) || 0;
          return d >= 20000 && d < 300000;
      });

      // Add long breaks to total
      longBreaksList.forEach(log => { calculatedIdleMs += Number(log.durationMs); });

      // SCRIPTS: If we find 5+ short bursts, add them all to Filtered Idle
      const isScriptPatternActive = suspiciousBursts.length >= 5;
      if (isScriptPatternActive) {
          suspiciousBursts.forEach(log => {
              calculatedIdleMs += Number(log.durationMs);
          });
      }

      const standardDay = 8 * 60 * 60 * 1000;
      const netAvailable = Math.max(0, standardDay - pwrMs - brkMs);

      setStats({ 
          worked: wMs, 
          idle: calculatedIdleMs, 
          breaks: brkMs, 
          downtime: pwrMs, 
          netAvailable,
          scriptDetected: isScriptPatternActive
      });
      setLoading(false);
    };
    fetchData();
  }, [username, globalDate]);

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

  const score = stats.netAvailable > 0 ? Math.round((stats.worked / (stats.worked + stats.idle)) * 100) : 0;

  if (loading) return <div className="p-20 text-center animate-pulse text-slate-400 font-bold uppercase tracking-widest">Analysing Logs...</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20 animate-in fade-in duration-700">
      {/* HEADER SECTION */}
      <div className="flex justify-between items-center bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <div className="flex items-center gap-6">
            <button onClick={() => navigate('/')} className="p-3 bg-slate-50 hover:bg-slate-100 rounded-2xl transition-all text-slate-600">
                <ArrowLeft size={20} />
            </button>
            <div>
                <h1 className="text-3xl font-black text-slate-900 leading-none">{username}</h1>
                <p className="text-xs text-slate-400 font-bold tracking-widest uppercase mt-1">{globalDate}</p>
            </div>
            {stats.scriptDetected && (
                <div className="flex items-center gap-2 bg-red-50 text-red-600 px-4 py-2 rounded-2xl border border-red-100">
                    <ShieldAlert size={18} />
                    <span className="text-[10px] font-black uppercase tracking-tighter">Activity Alert</span>
                </div>
            )}
        </div>
        <div className="flex gap-3">
            {activeInt ? (
                <button onClick={resumeMember} className="btn bg-emerald-500 text-white hover:bg-emerald-600 shadow-xl shadow-emerald-100 px-6 rounded-2xl font-bold transition-all">Resume Member</button>
            ) : (
                <button onClick={reportPowerCut} className="btn btn-outline text-red-500 border-red-100 hover:bg-red-50 px-6 rounded-2xl font-bold transition-all">Report Power Cut</button>
            )}
        </div>
      </div>

      {/* METRIC CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <MetricCard label="Worked" value={formatDuration(stats.worked)} color="border-l-indigo-500 text-indigo-600" />
        <MetricCard label="Filtered Idle" value={formatDuration(stats.idle)} color="border-l-amber-500 text-amber-600" />
        <MetricCard label="Breaks" value={formatDuration(stats.breaks)} color="border-l-blue-500 text-blue-600" />
        <MetricCard label="Outages" value={formatDuration(stats.downtime)} color="border-l-red-500 text-red-600" />
        <MetricCard label="Efficiency" value={`${score}%`} color="border-l-emerald-500 text-emerald-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
            {/* CLEAN LIVE STREAM FOR HR */}
            <Section title="Live Idle Stream" icon={<AlertCircle size={16} className="text-amber-600"/>} css="bg-white border-slate-100 shadow-sm">
                 {idleLogs.length === 0 ? <span className="italic text-slate-400 text-xs">No records found.</span> : idleLogs.map((log, i) => (
                    <div key={i} className="flex justify-between p-3.5 rounded-2xl border border-slate-100 bg-slate-50/50 mb-2 text-sm text-slate-600 transition-all hover:border-slate-200 hover:bg-white">
                        <span className="font-mono font-bold tracking-tight">
                            {log.startTime ? new Date(log.startTime).toLocaleTimeString() : '...'}
                        </span>
                        <span className="font-black tabular-nums">{formatDuration(log.durationMs)}</span>
                    </div>
                 ))}
            </Section>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Section title="Power Outages" icon={<ZapOff size={16} className="text-red-600"/>} css="bg-white border-slate-100 shadow-sm">
                    {powerLogs.map((log, i) => (
                        <div key={i} className="flex justify-between p-3.5 bg-red-50/30 rounded-2xl border border-red-100 mb-2 text-sm">
                            <span className="text-slate-500 font-mono">{new Date(log.startTime).toLocaleTimeString()}</span>
                            <span className="font-bold text-red-700">{formatDuration(log.durationMs)}</span>
                        </div>
                    ))}
                </Section>
                <Section title="Breaks" icon={<Coffee size={16} className="text-blue-600"/>} css="bg-white border-slate-100 shadow-sm">
                    {breakLogs.map((log, i) => (
                        <div key={i} className="flex justify-between p-3.5 bg-blue-50/30 rounded-2xl border border-blue-100 mb-2 text-sm">
                            <span className="text-slate-500 font-mono">{new Date(log.startTime).toLocaleTimeString()}</span>
                            <span className="font-bold text-blue-700">{formatDuration(log.durationMs)}</span>
                        </div>
                    ))}
                </Section>
            </div>
            
            <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
                <h3 className="font-bold mb-4 flex items-center gap-2 text-slate-700"><CheckCircle size={18} className="text-indigo-500"/> Task Performance</h3>
                <div className="divide-y divide-slate-50">
                    {tasks.map((t, i) => {
                        const isDone = t.status === 'Done';
                        return (
                            <div key={i} className={`flex justify-between py-4 hover:bg-slate-50/50 px-2 transition-all rounded-xl ${isDone ? 'opacity-50' : ''}`}>
                                <div>
                                    <div className={`font-bold ${isDone ? 'line-through text-slate-400' : 'text-slate-800'}`}>{t.description}</div>
                                    <div className="text-[10px] text-slate-400 uppercase font-black tracking-widest mt-0.5">{t.project}</div>
                                </div>
                                <span className={`font-mono font-black ${isDone ? 'text-slate-400' : 'text-indigo-600'}`}>
                                    {formatDuration(t.elapsedMs)}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>

        <div className="space-y-6 sticky top-6">
            <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-sm flex flex-col items-center">
                <h3 className="font-bold mb-8 text-slate-400 uppercase tracking-widest text-[10px]">Utilisation Split</h3>
                <div className="w-full max-w-[200px]">
                    <Doughnut data={{
                        labels: ['Work', 'Idle', 'Break', 'Power'],
                        datasets: [{
                            data: [stats.worked, stats.idle, stats.breaks, stats.downtime],
                            backgroundColor: ['#6366f1', '#f59e0b', '#3b82f6', '#ef4444'],
                            borderWidth: 0,
                            hoverOffset: 15
                        }]
                    }} options={{ cutout: '82%', plugins: { legend: { display: false } } }} />
                </div>
                <div className="mt-10 text-center">
                    <div className="text-5xl font-black text-slate-900 tracking-tighter">{score}%</div>
                    <div className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mt-2">Productivity Score</div>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, icon, children, css }) {
    return (
        <div className={`p-6 rounded-[32px] border ${css}`}>
            <h3 className="font-black mb-5 flex items-center gap-2 text-[10px] uppercase tracking-[0.15em] text-slate-500">{icon} {title}</h3>
            <div className="max-h-80 overflow-y-auto pr-2 custom-scrollbar">{children}</div>
        </div>
    );
}

function MetricCard({ label, value, color }) {
    return (
        <div className={`bg-white p-6 rounded-[32px] border-l-[10px] shadow-sm transition-all hover:shadow-md ${color}`}>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{label}</p>
            <p className="text-3xl font-black tracking-tight tabular-nums">{value}</p>
        </div>
    );
}