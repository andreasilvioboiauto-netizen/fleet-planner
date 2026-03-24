
  import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
  import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged }
    from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
  import { getFirestore, doc, getDoc, setDoc, onSnapshot, collection, getDocs }
    from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
  window._fbReady = false;

  // ── INCOLLA QUI LA TUA CONFIGURAZIONE FIREBASE ──────────────
  const firebaseConfig = {
    apiKey:            window._FB_API_KEY            || "AIzaSyDkyBlLR6ORr52-08nITfpJwQU3bRgwvLY",
    authDomain:        window._FB_AUTH_DOMAIN        || "fleet-planner-v3.firebaseapp.com",
    projectId:         window._FB_PROJECT_ID         || "fleet-planner-v3",
    storageBucket:     window._FB_STORAGE_BUCKET     || "fleet-planner-v3.firebasestorage.app",
    messagingSenderId: window._FB_MESSAGING_SENDER_ID|| "995081271732",
    appId:             window._FB_APP_ID             || "1:995081271732:web:341a5ce48934a1bd8adae1"
  };
  // ---

  const app  = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db   = getFirestore(app);

  // Espone le funzioni Firebase al resto dell'app
  window._fb = { auth, db, signInWithEmailAndPassword, signOut,
                 onAuthStateChanged, doc, getDoc, setDoc,
                 onSnapshot, collection, getDocs };

  // Ascolta cambio stato autenticazione
  onAuthStateChanged(auth, user => {
    if (user) {
      window._fbUser = user;
      window._fbReady = true;
      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('appShell').style.display    = 'flex';
      window._fbLoadAll && window._fbLoadAll();
    } else {
      window._fbUser = null;
      window._fbReady = false;
      document.getElementById('loginScreen').style.display = 'flex';
      document.getElementById('appShell').style.display    = 'none';
    }
  });
