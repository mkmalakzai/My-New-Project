import {initializeApp,getApps} from "firebase/app";
import {getFirestore} from "firebase/firestore";
import {getStorage} from "firebase/storage";
import {getAuth} from "firebase/auth";
import {getFunctions} from "firebase/functions";
import {getDatabase} from "firebase/database";

const firebaseConfig={
  apiKey:process.env.NEXT_PUBLIC_FIREBASE_API_KEY||"AIzaSyBByg1y9UYxX8Q5Zj3XDIRLJxbV4rgu_BY",
  authDomain:process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN||"afglion-47b07.firebaseapp.com",
  projectId:process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID||"afglion-47b07",
  storageBucket:process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET||"afglion-47b07.firebasestorage.app",
  messagingSenderId:process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID||"226343766461",
  appId:process.env.NEXT_PUBLIC_FIREBASE_APP_ID||"1:226343766461:web:d443f1398dd121d6efead4",
  databaseURL:process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL||"https://afglion-47b07-default-rtdb.asia-southeast1.firebasedatabase.app"
};

export const app=getApps().length?getApps()[0]:initializeApp(firebaseConfig);
export const db=getFirestore(app);
export const rtdb=getDatabase(app);
export const storage=getStorage(app);
export const auth=getAuth(app);
export const functions=getFunctions(app);
