import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// Your existing credentials
/* const firebaseConfig = {
  apiKey: "AIzaSyB36lYxWnIiGYhQRtFmef5HorrMfxkfRe0",
  authDomain: "teampulse-app.firebaseapp.com",
  projectId: "teampulse-app",
  storageBucket: "teampulse-app.firebasestorage.app",
  messagingSenderId: "372903178142",
  appId: "1:372903178142:web:9233147fdbf69adecab08f"
};

*/

//Back up DB
const firebaseConfig = {
  apiKey: "AIzaSyBxxQX_ZXkiUYLNQnCakuqYcYW1uzJxvJ0",
  authDomain: "teampulse-backup.firebaseapp.com",
  projectId: "teampulse-backup",
  storageBucket: "teampulse-backup.firebasestorage.app",
  messagingSenderId: "325521071480",
  appId: "1:325521071480:web:183234d60fa2ff49917c8d"
};


const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);