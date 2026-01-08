import React, { createContext, useState, useContext, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp, onSnapshot } from 'firebase/firestore'; 

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(() => {
    const savedUser = localStorage.getItem('teampulse_user');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const [loading, setLoading] = useState(false);

  // --- REAL-TIME SYNC ---
  useEffect(() => {
    if (!currentUser || !currentUser.id || currentUser.id === 'master') return;

    const unsub = onSnapshot(doc(db, 'users', currentUser.id), (docSnap) => {
        if (docSnap.exists()) {
            const freshData = { id: docSnap.id, ...docSnap.data() };
            if (JSON.stringify(freshData) !== JSON.stringify(currentUser)) {
                setCurrentUser(freshData);
                localStorage.setItem('teampulse_user', JSON.stringify(freshData));
            }
        }
    });
    return () => unsub();
  }, [currentUser?.id]);

  // --- STANDARD LOGIN (Web Form - ADMIN ONLY) ---
  async function login(username, password) {
    setLoading(true);
    
    // Master Admin Backdoor
    if (username === 'admin' && password === 'admin123') {
      const masterData = { fullname: 'Master Admin', username: 'admin', role: 'ADMIN', id: 'master' };
      setCurrentUser(masterData);
      localStorage.setItem('teampulse_user', JSON.stringify(masterData));
      setLoading(false);
      return true;
    }

    try {
      const q = query(
        collection(db, 'users'),
        where('username', '==', username),
        where('password', '==', password)
      );
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        alert("Invalid Username or Password");
        setLoading(false);
        return false;
      }

      const docSnap = querySnapshot.docs[0];
      const userData = { id: docSnap.id, ...docSnap.data() };
      
      // --- SECURITY CHECK: BLOCK NON-ADMINS ---
      if (userData.role !== 'ADMIN') {
          alert("ACCESS DENIED: Team Members must log in using the Desktop Tracker app.");
          setLoading(false);
          return false;
      }

      // Admin Login Success
      await updateDoc(doc(db, 'users', docSnap.id), {
        onlineStatus: 'Online',
        lastSeen: serverTimestamp()
      });

      setCurrentUser(userData);
      localStorage.setItem('teampulse_user', JSON.stringify(userData));
      setLoading(false);
      return true;
    } catch (error) {
      console.error("Login error:", error);
      alert("Login failed. Check console.");
      setLoading(false);
      return false;
    }
  }

  // --- TOKEN LOGIN (For Desktop App) ---
  async function loginWithToken(token) {
    setLoading(true);
    try {
        const q = query(collection(db, 'users'), where('sessionToken', '==', token));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            console.error("Invalid Token");
            setLoading(false);
            return false;
        }

        const docSnap = snapshot.docs[0];
        const userData = { id: docSnap.id, ...docSnap.data() };
        
        setCurrentUser(userData);
        localStorage.setItem('teampulse_user', JSON.stringify(userData));
        setLoading(false);
        return true;
    } catch (e) {
        console.error("Token login error:", e);
        setLoading(false);
        return false;
    }
  }

  // --- LOGOUT ---
  async function logout() {
    if (currentUser && currentUser.id && currentUser.id !== 'master') {
      try {
        await updateDoc(doc(db, 'users', currentUser.id), {
          onlineStatus: 'Offline',
          lastSeen: serverTimestamp(),
          sessionToken: null 
        });
      } catch (e) { console.error(e); }
    }
    localStorage.removeItem('teampulse_user');
    setCurrentUser(null);
  }

  // --- PASSWORD MANAGEMENT ---
  async function changePassword(newPassword) {
      if(!currentUser || !currentUser.id) return;
      try {
          await updateDoc(doc(db, 'users', currentUser.id), { password: newPassword });
          alert("Your password has been updated successfully.");
      } catch (e) { console.error(e); alert("Error updating password."); }
  }

  async function resetUserPassword(userId, newPassword) {
      try {
          await updateDoc(doc(db, 'users', userId), { password: newPassword });
          alert("User password reset successfully.");
      } catch (e) { console.error(e); alert("Error resetting password."); }
  }

  const value = {
    currentUser,
    login,
    loginWithToken,
    logout,
    loading,
    changePassword,
    resetUserPassword
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}