import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAGU-ZKIQEdk6M37Jt65S-tMydQsoaswh4",
  authDomain: "tableplanner123.firebaseapp.com",
  projectId: "tableplanner123",
  storageBucket: "tableplanner123.firebasestorage.app",
  messagingSenderId: "78386456966",
  appId: "1:78386456966:web:1aee4ea19d1d91f3f2e407",
  measurementId: "G-8LJRBDWS6B"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);