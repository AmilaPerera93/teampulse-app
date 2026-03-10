import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { 
  collection, addDoc, getDocs, query, where, updateDoc, doc, serverTimestamp 
} from 'firebase/firestore';
import { useDate } from '../contexts/DateContext';
import { X, Loader2, Check } from 'lucide-react';

export default function AssignTaskModal({ isOpen, onClose }) {
  const { globalDate } = useDate();
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  
  // Form State
  const [assignedTo, setAssignedTo] = useState('');
  const [project, setProject] = useState('General');
  const [description, setDescription] = useState('');
  const [estHours, setEstHours] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    
    const fetchData = async () => {
      // Fetch only members
      const userSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'MEMBER')));
      const projSnap = await getDocs(collection(db, 'projects'));
      
      setUsers(userSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setProjects(projSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      
      if (projSnap.empty) setProjects([{ name: 'General' }, { name: 'Internal' }]);
    };
    fetchData();
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!assignedTo || !description) return;
    setLoading(true);

    try {
      // --- DUPLICATION CHECK LOGIC ---
      // Check if this member already has this task pending in this project
      const q = query(
        collection(db, 'tasks'),
        where('assignedTo', '==', assignedTo),
        where('project', '==', project),
        where('description', '==', description),
        where('status', '!=', 'Done') 
      );

      const existingTasks = await getDocs(q);

      if (!existingTasks.empty) {
        // SCENARIO: Task exists (e.g., Shiftsmart MT). Just update the date to today.
        const existingTaskDoc = existingTasks.docs[0];
        await updateDoc(doc(db, 'tasks', existingTaskDoc.id), {
          date: globalDate, // Move it to the currently selected date
          estHours: parseFloat(estHours) || existingTaskDoc.data().estHours,
          lastAssignedAt: serverTimestamp() 
        });
        console.log("Existing task updated/moved to current date.");
      } else {
        // SCENARIO: New task. Create fresh entry.
        await addDoc(collection(db, 'tasks'), {
          assignedTo,
          project,
          description,
          estHours: parseFloat(estHours) || 0,
          date: globalDate,
          status: 'Todo',
          elapsedMs: 0,
          isRunning: false,
          lastStartTime: null,
          comments: [],
          createdAt: serverTimestamp()
        });
      }

      // Success Cleanup
      setDescription('');
      setEstHours('');
      onClose(); 
    } catch (err) {
      console.error("Assignment Error:", err);
      alert("Error assigning task. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in zoom-in duration-200">
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl p-8 relative border border-slate-100">
        <button onClick={onClose} className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 transition-colors p-2 hover:bg-slate-50 rounded-full">
            <X size={20} />
        </button>
        
        <div className="mb-8">
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">Assign Task</h2>
            <p className="text-slate-500 text-sm">Task will automatically sync if already assigned to member.</p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Assignee</label>
                    <select 
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 font-bold text-slate-700 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 transition-all appearance-none" 
                        value={assignedTo} 
                        onChange={e => setAssignedTo(e.target.value)} 
                        required
                    >
                        <option value="" disabled>Select Member</option>
                        {users.map(u => <option key={u.id} value={u.fullname}>{u.fullname}</option>)}
                    </select>
                </div>
                <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Project</label>
                    <select 
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 font-bold text-slate-700 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 transition-all appearance-none" 
                        value={project} 
                        onChange={e => setProject(e.target.value)}
                    >
                        {projects.map(p => <option key={p.id || p.name} value={p.name}>{p.name}</option>)}
                        <option value="General">General</option>
                    </select>
                </div>
            </div>

            <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Task Description</label>
                <input 
                    type="text" 
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 font-bold text-slate-700 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 transition-all" 
                    placeholder="e.g. Shiftsmart MT Session" 
                    value={description} 
                    onChange={e => setDescription(e.target.value)} 
                    required 
                />
            </div>

            <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Est. Hours</label>
                <input 
                    type="number" 
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 font-bold text-slate-700 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 transition-all" 
                    placeholder="4" 
                    value={estHours} 
                    onChange={e => setEstHours(e.target.value)} 
                />
            </div>

            <div className="flex gap-4 pt-4">
                <button 
                    type="submit" 
                    className="flex-1 bg-slate-900 text-white py-4 rounded-2xl font-bold shadow-xl shadow-slate-200 hover:bg-indigo-600 hover:shadow-indigo-100 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2" 
                    disabled={loading}
                >
                    {loading ? <Loader2 className="animate-spin" size={20}/> : <Check size={20}/>}
                    {loading ? 'Processing...' : 'Assign & Sync'}
                </button>
                <button 
                    type="button" 
                    onClick={onClose} 
                    className="flex-1 bg-slate-100 text-slate-600 py-4 rounded-2xl font-bold hover:bg-slate-200 transition-all active:scale-95"
                >
                    Cancel
                </button>
            </div>
        </form>
      </div>
    </div>
  );
}