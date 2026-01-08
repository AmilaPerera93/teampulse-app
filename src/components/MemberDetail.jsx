import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { collection, query, where, getDocs, doc, updateDoc, addDoc } from 'firebase/firestore';
import { useDate } from '../contexts/DateContext';
import { formatMs } from '../utils/helpers';
import { ArrowLeft, Clock, ZapOff, PlayCircle, Coffee, AlertCircle, CheckCircle, TrendingUp } from 'lucide-react';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend);

export default function MemberDetail() {
  const { username } = useParams();
  const { globalDate } = useDate();
  const navigate = useNavigate();
  
  const [tasks, setTasks] = useState([]);
  const [powerLogs, setPowerLogs] = useState([]);
  const [breakLogs, setBreakLogs] = useState([]);
  const [idleLogs, setIdleLogs] = useState([]);
  const [activeInterruption, setActiveInterruption] = useState(null);
  const [stats, setStats] = useState({ worked: 0, estimated: 0, downtime: 0, idle: 0, breaks: 0, netAvailable: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      
      const userQ = query(collection(db, 'users'), where('fullname', '==', username));
      const userSnap = await getDocs(userQ);
      if (userSnap.empty) { setLoading(false); return; }
      const userId = userSnap.docs[0].id;

      const qTasks = query(collection(db, 'tasks'), where('assignedTo', '==', username), where('date', '==', globalDate));
      const qInt = query(collection(db, 'interruptions'), where('user', '==', username), where('date', '==', globalDate));
      const qIdle = query(collection(db, 'idle_logs'), where('userId', '==', userId), where('date', '==', globalDate));
      const qBreaks = query(collection(db, 'breaks'), where('userId', '==', userId), where('date', '==', globalDate));

      const [snapTasks, snapInt, snapIdle, snapBreaks] = await Promise.all([
        getDocs(qTasks), getDocs(qInt), getDocs(qIdle), getDocs(qBreaks)
      ]);

      const tData = snapTasks.docs.map(d => ({...d.data(), id: d.id}));
      const iData = snapInt.docs.map(d => ({...d.data(), id: d.id}));
      const idlData = snapIdle.docs.map(d => d.data()).sort((a,b) => b.startTime - a.startTime);
      const brkData = snapBreaks.docs.map(d => d.data()).sort((a,b) => b.startTime - a.startTime);
      const pwrLogs = iData.filter(i => !i.active).sort((a,b) => b.startTime - a.startTime);

      setTasks(tData);
      setIdleLogs(idlData);
      setBreakLogs(brkData);
      setPowerLogs(pwrLogs);

      const active = iData.find(i => i.active === true);
      setActiveInterruption(active || null);

      const wMs = tData.reduce((acc, t) => acc + (t.elapsedMs || 0) + (t.isRunning ? (Date.now() - t.lastStartTime) : 0), 0);
      const pMs = iData.reduce((acc, i) => acc + (i.durationMs || (i.active ? (Date.now() - i.startTime) : 0)), 0);
      const idlMs = idlData.reduce((acc, i) => acc + i.durationMs, 0);
      const brkMs = brkData.reduce((acc, i) => acc + i.durationMs, 0);

      const standardDay = 8 * 60 * 60 * 1000;
      const netAvailable = Math.max(0, standardDay - pMs - brkMs);

      setStats({ worked: wMs, estimated: tData.reduce((acc, t) => acc + (t.estHours || 0), 0) * 3600000, downtime: pMs, idle: idlMs, breaks: brkMs, netAvailable });
      setLoading(false);
    };
    fetchData();
  }, [username, globalDate]);

  const reportPowerCut = async () => {
    if(!confirm(`Mark ${username} as having a power cut?`)) return;
    const userSnap = await getDocs(query(collection(db, 'users'), where('fullname', '==', username)));
    await addDoc(collection(db, 'interruptions'), { user: username, userId: userSnap.docs[0].id, type: 'Admin Reported Outage', startTime: Date.now(), active: true, date: globalDate });
    window.location.reload();
  };

  const resumeMember = async () => {
    if(!activeInterruption) return;
    if(!confirm(`Resume work for ${username}?`)) return;
    const duration = Date.now() - activeInterruption.startTime;
    await updateDoc(doc(db, 'interruptions', activeInterruption.id), { active: false, endTime: Date.now(), durationMs: duration });
    window.location.reload();
  };

  const efficiencyScore = stats.netAvailable > 0 ? Math.min(100, Math.round((stats.worked / stats.netAvailable) * 100)) : 0;

  if (loading) return <div className="p-10 text-center animate-pulse text-slate-400">Loading Timesheet...</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
            <button onClick={() => navigate('/')} className="btn btn-ghost"><ArrowLeft size={18} /> Back</button>
            <h1 className="text-2xl font-bold">{username}</h1>
            {activeInterruption && <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-bold animate-pulse flex items-center gap-2"><ZapOff size={12} /> POWER CUT ACTIVE</span>}
        </div>
        <div className="flex gap-2">
            {activeInterruption ? <button onClick={resumeMember} className="btn bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-200"><PlayCircle size={18} /> Resume Member</button> : <button onClick={reportPowerCut} className="btn btn-outline text-amber-600 hover:bg-amber-50"><ZapOff size={18} /> Report Outage</button>}
        </div>
      </div>

      {/* METRICS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <MetricCard label="Worked" value={formatMs(stats.worked)} color="border-l-primary" />
        <MetricCard label="Power Cuts" value={formatMs(stats.downtime)} color="border-l-red-500" />
        <MetricCard label="Breaks" value={formatMs(stats.breaks)} color="border-l-blue-500" />
        <MetricCard label="Idle Time" value={formatMs(stats.idle)} color="border-l-amber-500" />
        <MetricCard label="Efficiency" value={`${efficiencyScore}%`} color="border-l-emerald-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
              {/* IDLE LOG SECTION */}
              <div className="card border-amber-100 bg-amber-50/30">
                  <h3 className="font-bold mb-4 flex items-center gap-2 text-amber-800"><AlertCircle size={18}/> Idle Log (System Inactivity)</h3>
                  <div className="space-y-2">
                      {idleLogs.length === 0 && <p className="text-slate-400 text-xs italic">No idle periods detected by tracker.</p>}
                      {idleLogs.map((log, i) => (
                          <div key={i} className="flex justify-between items-center text-sm p-2 bg-white rounded border border-amber-100 shadow-sm">
                              <span className="text-slate-500">{new Date(log.startTime).toLocaleTimeString()} - {new Date(log.endTime).toLocaleTimeString()}</span>
                              <span className="font-bold text-amber-700">{formatMs(log.durationMs)}</span>
                          </div>
                      ))}
                  </div>
              </div>

              {/* POWER & BREAKS SECTION */}
              <div className="card">
                  <h3 className="font-bold mb-4 flex items-center gap-2 text-slate-700"><ZapOff size={18}/> Downtime & Breaks</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                          <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Power Outages</p>
                          {powerLogs.map((log, i) => (
                              <div key={i} className="flex justify-between p-2 bg-red-50 text-red-700 rounded text-xs font-bold border border-red-100">
                                  <span>{new Date(log.startTime).toLocaleTimeString()}</span>
                                  <span>{formatMs(log.durationMs)}</span>
                              </div>
                          ))}
                      </div>
                      <div className="space-y-2">
                          <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Breaks</p>
                          {breakLogs.map((log, i) => (
                              <div key={i} className="flex justify-between p-2 bg-blue-50 text-blue-700 rounded text-xs font-bold border border-blue-100">
                                  <span>{new Date(log.startTime).toLocaleTimeString()}</span>
                                  <span>{formatMs(log.durationMs)}</span>
                              </div>
                          ))}
                      </div>
                  </div>
              </div>

              {/* TASKS SECTION */}
              <div className="card">
                  <h3 className="font-bold mb-4 flex items-center gap-2 text-slate-700"><CheckCircle size={18}/> Task Activity</h3>
                  {tasks.map(t => (
                      <div key={t.id} className="p-3 border-b last:border-0 flex justify-between items-center hover:bg-slate-50 rounded-lg">
                          <div>
                              <p className="font-bold text-sm text-slate-800">{t.description}</p>
                              <p className="text-[10px] text-slate-400 uppercase">{t.project}</p>
                          </div>
                          <span className="font-mono font-bold text-primary">{formatMs(t.elapsedMs)}</span>
                      </div>
                  ))}
              </div>
          </div>

          {/* VISUALS */}
          <div className="card h-fit sticky top-6">
              <h3 className="font-bold mb-6 text-slate-700">Time Utilization</h3>
              <div className="h-64 flex justify-center items-center">
                  <Doughnut options={{ cutout: '70%', plugins: { legend: { position: 'bottom' } } }} data={{
                      labels: ['Worked', 'Power Cuts', 'Breaks', 'Idle'],
                      datasets: [{
                          data: [stats.worked, stats.downtime, stats.breaks, stats.idle],
                          backgroundColor: ['#4f46e5', '#ef4444', '#3b82f6', '#f59e0b'],
                          borderWidth: 0
                      }]
                  }} />
              </div>
          </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, color }) {
    return (
        <div className={`bg-white p-4 rounded-xl border-l-4 ${color} shadow-sm`}>
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">{label}</p>
            <p className="text-xl font-bold text-slate-800">{value}</p>
        </div>
    );
}