import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
 // For Firebase JS SDK v7.20.0 and later, measurementId is optional
  apiKey: "AIzaSyDU8L3cMVK2KD53flcil4D_8DE3lBU3nOs",
  authDomain: "solariq-plus-auth.firebaseapp.com",
  projectId: "solariq-plus-auth",
  storageBucket: "solariq-plus-auth.firebasestorage.app",
  messagingSenderId: "780881910763",
  appId: "1:780881910763:web:8bf13cdcd24401ed2757ae",
  measurementId: "G-WJPMJ3NNC6"
};

const required = ["apiKey", "authDomain", "projectId", "appId"];
const missing = required.filter((key) => !firebaseConfig[key]);
if (missing.length) {
  console.warn(`Firebase config is missing: ${missing.join(", ")}. Add the REACT_APP_FIREBASE_* values to your frontend .env file.`);
}

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
