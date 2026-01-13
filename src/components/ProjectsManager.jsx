import React, { useEffect, useState } from 'react';

import { db } from '../firebase';

import { collection, onSnapshot, addDoc, deleteDoc, doc, orderBy, query } from 'firebase/firestore';

import { Trash2, Plus, Folder } from 'lucide-react';



export default function ProjectsManager() {

  const [projects, setProjects] = useState([]);

  const [newProject, setNewProject] = useState('');



  useEffect(() => {

    const q = query(collection(db, 'projects'), orderBy('name'));

    const unsub = onSnapshot(q, (snap) => {

      setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() })));

    });

    return () => unsub();

  }, []);



  const handleAdd = async (e) => {

    e.preventDefault();

    if (!newProject.trim()) return;

    await addDoc(collection(db, 'projects'), { name: newProject });

    setNewProject('');

  };



  const handleDelete = async (id) => {

    if (confirm("Remove this project from the list?")) {

      await deleteDoc(doc(db, 'projects', id));

    }

  };



  return (

    <div className="max-w-2xl mx-auto">

      <h2 className="text-2xl font-bold text-text-main mb-6">Manage Projects</h2>



      <div className="bg-white p-6 rounded-xl shadow-sm border border-border mb-8">

        <form onSubmit={handleAdd} className="flex gap-3">

            <input

                className="input-field mb-0 flex-1"

                placeholder="New Project Name"

                value={newProject}

                onChange={e => setNewProject(e.target.value)}

            />

            <button type="submit" className="btn btn-primary">

                <Plus size={18} /> Add

            </button>

        </form>

      </div>



      <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm">

        {projects.length === 0 && <div className="p-6 text-center text-text-sec">No projects found.</div>}

       

        {projects.map(p => (

            <div key={p.id} className="flex items-center justify-between p-4 border-b border-border last:border-0 hover:bg-slate-50">

                <div className="flex items-center gap-3 font-semibold text-text-main">

                    <div className="w-8 h-8 rounded bg-indigo-50 text-primary flex items-center justify-center">

                        <Folder size={16} />

                    </div>

                    {p.name}

                </div>

                <button onClick={() => handleDelete(p.id)} className="btn-icon hover:text-danger hover:bg-red-50">

                    <Trash2 size={16} />

                </button>

            </div>

        ))}

      </div>

    </div>

  );

}