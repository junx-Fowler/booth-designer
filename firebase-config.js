// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyC1M5jDLpr9AFfKOiQtI0xca6NuavbFTcA",
    authDomain: "booth-designer.firebaseapp.com",
    projectId: "booth-designer",
    storageBucket: "booth-designer.firebasestorage.app",
    messagingSenderId: "399155487315",
    appId: "1:399155487315:web:af5b5b7664ec9ad92cdca6",
    measurementId: "G-1WGL2C9CNB"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
export const firestoreCollection = "boothDesignerRooms";

export const firebaseEnabled = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.appId
);
