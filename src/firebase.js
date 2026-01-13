import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// Your existing credentials
const firebaseConfig = {
  apiKey: "AIzaSyB36lYxWnIiGYhQRtFmef5HorrMfxkfRe0",
  authDomain: "teampulse-app.firebaseapp.com",
  projectId: "teampulse-app",
  storageBucket: "teampulse-app.firebasestorage.app",
  messagingSenderId: "372903178142",
  appId: "1:372903178142:web:9233147fdbf69adecab08f"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);