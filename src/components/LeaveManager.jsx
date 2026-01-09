import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, onSnapshot, orderBy, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { useDate } from '../contexts/DateContext';
import { Calendar, CheckCircle, XCircle, Plus, UserX, Clock, AlertCircle, Trash2, Edit2 } from 'lucide-react';

export default function LeaveManager() {
  const { currentUser } = useAuth();
  
  const [leaves, setLeaves] = useState([]); // User's leaves
  const [allLeaves, setAllLeaves] = useState([]); // Admin's view of all leaves
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ type: 'Annual', startDate: '', endDate: '', reason: '' });
  const [loading, setLoading] = useState(true);

  // Configuration
  const TOTAL_ANNUAL_LEAVES = 14; 

  useEffect(() => {
    // SECURITY CHECK: Wait for Auth to fully load
    if (!currentUser || !currentUser.id) return;
    
    setLoading(true);

    if (currentUser.role === 'ADMIN') {
        // --- ADMIN: LISTEN TO ALL REQUESTS ---
        const q = query(collection(db, 'leaves'), orderBy('createdAt', 'desc'));
        const unsub = onSnapshot(q, (snap) => {
            setAllLeaves(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        });
        return () => unsub();
    } else {
        // --- MEMBER: LISTEN TO MY REQUESTS ---
        // CRITICAL FIX: Ensure we query by string ID, matching how we save it
        const q = query(collection(db, 'leaves'), where('userId', '==', currentUser.id)); // removed orderBy temporarily to fix index issues if any
        
        const unsub = onSnapshot(q, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            // Client-side sort to avoid composite index requirements on startup
            list.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
            setLeaves(list);
            setLoading(false);
        });
        return () => unsub();
    }
  }, [currentUser]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.startDate || !formData.endDate) return;

    // Calculate Duration
    const start = new Date(formData.startDate);
    const end = new Date(formData.endDate);
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; 

    if (diffDays <= 0) return alert("End date must be after start date");

    await addDoc(collection(db, 'leaves'), {
        userId: currentUser.id,
        userName: currentUser.fullname,
        type: formData.type,
        startDate: formData.startDate,
        endDate: formData.endDate,
        reason: formData.reason,
        days: diffDays,
        status: 'Pending',
        createdAt: new Date().toISOString()
    });
    
    setIsModalOpen(false);
    setFormData({ type: 'Annual', startDate: '', endDate: '', reason: '' });
  };

  const handleAction = async (id, status) => {
      if(!confirm(`Mark this leave request as ${status}?`)) return;
      await updateDoc(doc(db, 'leaves', id), { status });
  };

  const handleDelete = async (id) => {
      if(!confirm("Are you sure you want to cancel this leave request?")) return;
      await deleteDoc(doc(db, 'leaves', id));
  };

  // --- HELPER: CHECK IF USER IS AWAY TODAY ---
  const isAwayToday = (leave) => {
      const today = new Date().toISOString().split('T')[0];
      return leave.status === 'Approved' && leave.startDate <= today && leave.endDate >= today;
  };

  // ==========================================
  // VIEW: TEAM MEMBER
  // ==========================================
  if (currentUser.role !== 'ADMIN') {
      const usedDays = leaves
        .filter(l => l.status === 'Approved' && l.type === 'Annual')
        .reduce((acc, l) => acc + l.days, 0);
      
      const pendingCount = leaves.filter(l => l.status === 'Pending').length;

      return (
        <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in h-full flex flex-col">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">My Leave</h2>
                    <p className="text-slate-500">Manage your time off and view balance.</p>
                </div>
                <button onClick={() => setIsModalOpen(true)} className="btn btn-primary shadow-lg shadow-indigo-200">
                    <Plus size={18} className="mr-2" /> Apply for Leave
                </button>
            </div>

            {/* BALANCE CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 text-white p-6 rounded-2xl shadow-xl shadow-indigo-100">
                    <p className="text-indigo-100 text-xs font-bold uppercase mb-1 flex items-center gap-2"><Clock size={14}/> Annual Balance</p>
                    <h2 className="text-4xl font-bold mt-2">{TOTAL_ANNUAL_LEAVES - usedDays} <span className="text-lg font-normal opacity-60">/ {TOTAL_ANNUAL_LEAVES}</span></h2>
                    <div className="w-full bg-black/20 h-1.5 rounded-full mt-4 overflow-hidden">
                        <div className="bg-white/90 h-full rounded-full" style={{ width: `${((TOTAL_ANNUAL_LEAVES - usedDays) / TOTAL_ANNUAL_LEAVES) * 100}%` }}></div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center">
                    <p className="text-slate-400 text-xs font-bold uppercase mb-1">Leaves Taken</p>
                    <h2 className="text-3xl font-bold text-slate-700">{usedDays} <span className="text-sm font-normal text-slate-400">days</span></h2>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center">
                    <p className="text-slate-400 text-xs font-bold uppercase mb-1">Pending Requests</p>
                    <h2 className={`text-3xl font-bold ${pendingCount > 0 ? 'text-amber-500' : 'text-slate-700'}`}>
                        {pendingCount} <span className="text-sm font-normal text-slate-400">requests</span>
                    </h2>
                </div>
            </div>

            {/* REQUEST MODAL */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in">
                    <div className="bg-white p-8 rounded-2xl w-full max-w-lg shadow-2xl scale-100">
                        <h3 className="text-xl font-bold mb-6 text-slate-800">New Leave Request</h3>
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Leave Type</label>
                                <select className="input-field" value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})}>
                                    <option value="Annual">Annual Leave</option>
                                    <option value="Sick">Sick Leave</option>
                                    <option value="Casual">Casual Leave</option>
                                    <option value="Unpaid">Unpaid Leave</option>
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-5">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Start Date</label>
                                    <input type="date" className="input-field" value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value})} required />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">End Date</label>
                                    <input type="date" className="input-field" value={formData.endDate} onChange={e => setFormData({...formData, endDate: e.target.value})} required />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Reason</label>
                                <textarea className="input-field min-h-[100px]" value={formData.reason} onChange={e => setFormData({...formData, reason: e.target.value})} placeholder="e.g. Family vacation, Medical appointment..." required></textarea>
                            </div>
                            <div className="flex justify-end gap-3 pt-2">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="btn btn-ghost">Cancel</button>
                                <button type="submit" className="btn btn-primary px-6">Submit Request</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* HISTORY LIST */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex-1 shadow-sm">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold border-b border-slate-200">
                        <tr>
                            <th className="p-4 pl-6">Type</th>
                            <th className="p-4">Duration</th>
                            <th className="p-4">Days</th>
                            <th className="p-4">Status</th>
                            <th className="p-4 text-right pr-6">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {leaves.map(l => (
                            <tr key={l.id} className="hover:bg-slate-50 transition-colors">
                                <td className="p-4 pl-6 font-bold text-slate-700">{l.type}</td>
                                <td className="p-4 text-slate-500 font-mono text-xs">
                                    {new Date(l.startDate).toLocaleDateString()} <span className="text-slate-300 px-1">➜</span> {new Date(l.endDate).toLocaleDateString()}
                                </td>
                                <td className="p-4 font-bold text-slate-700">{l.days}</td>
                                <td className="p-4">
                                    <span className={`px-2.5 py-1 rounded-md text-xs font-bold border ${
                                        l.status === 'Approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                                        l.status === 'Rejected' ? 'bg-red-50 text-red-700 border-red-100' :
                                        'bg-amber-50 text-amber-700 border-amber-100'
                                    }`}>
                                        {l.status}
                                    </span>
                                </td>
                                <td className="p-4 text-right pr-6">
                                    {l.status === 'Pending' && (
                                        <button 
                                            onClick={() => handleDelete(l.id)} 
                                            className="text-slate-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg transition-colors"
                                            title="Cancel Request"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {leaves.length === 0 && (
                            <tr><td colSpan="5" className="p-10 text-center text-slate-400 italic">No leave records found.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
      );
  }

  // ==========================================
  // VIEW: ADMIN
  // ==========================================
  
  const activeLeaves = allLeaves.filter(isAwayToday);
  const pendingLeaves = allLeaves.filter(l => l.status === 'Pending');
  const pastLeaves = allLeaves.filter(l => l.status !== 'Pending');

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in pb-20">
        <div>
            <h2 className="text-2xl font-bold text-slate-800">Leave Manager</h2>
            <p className="text-slate-500">Approve requests and track employee absence.</p>
        </div>
        
        {/* WHO IS AWAY TODAY WIDGET */}
        {activeLeaves.length > 0 && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-6">
                <h3 className="text-red-800 font-bold flex items-center gap-2 mb-4">
                    <UserX size={20}/> On Leave Today ({activeLeaves.length})
                </h3>
                <div className="flex gap-4 flex-wrap">
                    {activeLeaves.map(l => (
                        <div key={l.id} className="bg-white px-4 py-2 rounded-lg border border-red-100 shadow-sm flex items-center gap-3">
                            <div className="w-8 h-8 bg-red-100 text-red-600 rounded-full flex items-center justify-center font-bold text-xs">
                                {l.userName.charAt(0)}
                            </div>
                            <div>
                                <div className="text-sm font-bold text-slate-700">{l.userName}</div>
                                <div className="text-[10px] text-slate-400 uppercase font-bold">{l.type} • Returns {l.endDate}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {/* PENDING REQUESTS GRID */}
        {pendingLeaves.length > 0 && (
            <div>
                <h3 className="text-sm font-bold text-slate-400 uppercase mb-4 flex items-center gap-2">
                    <AlertCircle size={14}/> Pending Approvals ({pendingLeaves.length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {pendingLeaves.map(leave => (
                        <div key={leave.id} className="bg-white p-5 rounded-xl border-l-4 border-l-amber-400 border-y border-r border-slate-200 shadow-sm">
                            <div className="flex justify-between items-start mb-2">
                                <h3 className="font-bold text-slate-800 text-lg">{leave.userName}</h3>
                                <span className="bg-amber-50 text-amber-700 text-xs font-bold px-2 py-1 rounded">{leave.days} Days</span>
                            </div>
                            
                            <div className="text-xs font-bold text-slate-400 uppercase mb-3">{leave.type} Leave</div>
                            
                            <div className="bg-slate-50 p-2.5 rounded text-xs font-mono text-slate-600 mb-3 flex items-center gap-2 border border-slate-100">
                                <Calendar size={12}/> {new Date(leave.startDate).toLocaleDateString()} ➜ {new Date(leave.endDate).toLocaleDateString()}
                            </div>

                            <p className="text-sm text-slate-600 italic mb-5 bg-white p-2 rounded border border-slate-100">
                                "{leave.reason}"
                            </p>

                            <div className="flex gap-3">
                                <button onClick={() => handleAction(leave.id, 'Approved')} className="flex-1 btn bg-emerald-600 text-white hover:bg-emerald-700 text-xs py-2 shadow-sm">
                                    <CheckCircle size={14} className="mr-1.5"/> Approve
                                </button>
                                <button onClick={() => handleAction(leave.id, 'Rejected')} className="flex-1 btn bg-white border border-slate-200 text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 text-xs py-2">
                                    <XCircle size={14} className="mr-1.5"/> Reject
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {/* PAST HISTORY TABLE */}
        <div className="pt-4">
            <h3 className="text-sm font-bold text-slate-400 uppercase mb-4">Leave History</h3>
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold border-b border-slate-200">
                        <tr>
                            <th className="p-4 pl-6">Employee</th>
                            <th className="p-4">Type</th>
                            <th className="p-4">Dates</th>
                            <th className="p-4">Status</th>
                            <th className="p-4 text-right pr-6">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {pastLeaves.map(l => (
                            <tr key={l.id} className="hover:bg-slate-50 transition-colors">
                                <td className="p-4 pl-6 font-bold text-slate-700">{l.userName}</td>
                                <td className="p-4 text-slate-500 text-xs font-bold uppercase">{l.type}</td>
                                <td className="p-4 text-slate-500 font-mono text-xs">
                                    {l.startDate} <span className="text-slate-300 px-1">➜</span> {l.endDate}
                                </td>
                                <td className="p-4">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${
                                        l.status === 'Approved' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                        l.status === 'Rejected' ? 'bg-red-50 text-red-600 border-red-100' :
                                        'bg-amber-50 text-amber-600 border-amber-100'
                                    }`}>
                                        {l.status}
                                    </span>
                                </td>
                                <td className="p-4 text-right">
                                     <button 
                                        onClick={() => handleDelete(l.id)} 
                                        className="text-slate-300 hover:text-red-600 p-2 rounded-lg transition-colors"
                                        title="Delete Record"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                         {pastLeaves.length === 0 && <tr><td colSpan="5" className="p-8 text-center text-slate-400 italic">No past history.</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
  );
}