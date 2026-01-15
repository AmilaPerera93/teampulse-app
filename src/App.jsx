import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import Login from './components/Login';
import Layout from './components/Layout';
import MemberDashboard from './components/MemberDashboard';
import AdminDashboard from './components/AdminDashboard';
import UsersManager from './components/UsersManager';
import ProjectsManager from './components/ProjectsManager';
import MemberDetail from './components/MemberDetail';
import ClientManager from './components/ClientManager';
import InvoiceManager from './components/InvoiceManager';
import ResourcePlanner from './components/ResourcePlanner';
import LeaveManager from './components/LeaveManager';
import HistoryLog from './components/HistoryLog';
import GameZone from './components/GameZone';
import MorningMeeting from './components/MorningMeeting';

function ProtectedRoute({ children }) {
  const { currentUser } = useAuth();
  if (!currentUser) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const { currentUser } = useAuth();

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route path="/" element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }>
          <Route index element={
            currentUser?.role === 'ADMIN' ? <AdminDashboard /> : <MemberDashboard />
          } /> 
          
          <Route path="users" element={<UsersManager />} />
          <Route path="projects" element={<ProjectsManager />} />
          <Route path="member/:username" element={<MemberDetail />} />
          <Route path="crm" element={<ClientManager />} />
          <Route path="finance" element={<InvoiceManager />} />   
          <Route path="resources" element={<ResourcePlanner />} />
          <Route path="leaves" element={<LeaveManager />} />
          <Route path="/history" element={<HistoryLog />} />
          <Route path="game" element={<GameZone />} />
          <Route path="meeting" element={<MorningMeeting />} /> 
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

 