# Booth Designer

Open `Index.html` in a modern browser.

What this version includes:
- Default booth size: 60 ft x 20 ft
- 1 ft grid layout with 1 inch nudge precision
- Autosave in the browser using local storage
- Section create, move, resize, recolor, duplicate, delete
- Section name and size editing
- Arrow key nudging for the selected section
- Mouse wheel zoom and right-drag pan
- High-resolution PNG export
- Live shared rooms backed by Firebase Cloud Firestore when the app is hosted on an `http://` or `https://` URL

Autosave note:
- Saved layouts are stored in the same browser profile on the same machine.
- If you open the file in a different browser or clear site storage, the saved layout will not follow automatically.

Live sharing note:
- Click `Share Live Link` to generate a room URL.
- Anyone who opens the same room URL can edit the same layout in real time.
- Live collaboration is designed for a hosted copy of the app, such as GitHub Pages, Netlify, Vercel, or another static web host.
- If you open the app as a local file (`file://`), local editing still works, but live rooms will stay unavailable.

Firebase setup:
1. Create a Firebase project at [Firebase Console](https://console.firebase.google.com/).
2. Add a Web app to that project and copy its `firebaseConfig` values.
3. Enable Cloud Firestore in the project.
4. Fill in [firebase-config.js](/C:/booth-designer/firebase-config.js:1) with your real Firebase values.
5. Deploy the updated files to GitHub Pages again.

Firestore rules for open room links:
```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /boothDesignerRooms/{roomId} {
      allow read, write: if true;
    }
  }
}
```

Security note:
- The rule above matches your requested behavior: anyone with the URL can edit.
- That also means anyone who learns a room ID can read and write that room.
- If you want stronger access control later, add Firebase Authentication and tighten the rules.
