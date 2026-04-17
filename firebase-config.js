export const firebaseConfig = {
  apiKey: "AIzaSyC1M5jDLpr9AFfKOiQtI0xca6NuavbFTcA",
  authDomain: "booth-designer.firebaseapp.com",
  projectId: "booth-designer",
  storageBucket: "booth-designer.firebasestorage.app",
  messagingSenderId: "399155487315",
  appId: "1:399155487315:web:af5b5b7664ec9ad92cdca6",
  measurementId: "G-1WGL2C9CNB",
};

export const firestoreCollection = "boothDesignerRooms";

export const firebaseEnabled = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.appId
);
