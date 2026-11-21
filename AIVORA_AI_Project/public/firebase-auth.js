
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js";

import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDgVqvC8REm5E96kfL2hPbrmdqzEfZrbKc",
  authDomain: "harvoin-ai-web.firebaseapp.com",
  projectId: "harvoin-ai-web",
  storageBucket: "harvoin-ai-web.firebasestorage.app",
  messagingSenderId: "840815457367",
  appId: "1:840815457367:web:78c44aefcddc47b5ba1f12",
  measurementId: "G-RMEHMEE5MC"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

const signInButton = document.getElementById("googleSignInButton");
const signOutButton = document.getElementById("signOutButton");

const authScreen = document.getElementById("authScreen");
const appShell = document.querySelector(".app-shell");

const userName = document.getElementById("userName");
const userEmail = document.getElementById("userEmail");
const userAvatar = document.getElementById("userAvatar");
const authStatus = document.getElementById("authStatus");

// GOOGLE SIGN IN

signInButton?.addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.error("Google sign-in error:", error);
    alert(error.message || "Google sign-in failed.");
  }
});

// SIGN OUT

signOutButton?.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Sign-out error:", error);
    alert(error.message || "Sign-out failed.");
  }
});

// CHECK LOGIN STATUS

onAuthStateChanged(auth, (user) => {

  if (user) {

    // Show chat interface
    authScreen.hidden = true;
    appShell.hidden = false;
    appShell.classList.add("authenticated");
        // PERSONALIZED WELCOME MESSAGE
    const personalWelcome = document.getElementById("personalWelcome");
    const personalWelcomeText = document.getElementById("personalWelcomeText");

    const firstName = user.displayName
      ? user.displayName.split(" ")[0]
      : "there";

    if (personalWelcome) {
      personalWelcome.textContent = `Welcome back, ${firstName}! ✨`;
    }

    if (personalWelcomeText) {
      personalWelcomeText.textContent =
        "Your intelligent assistant is ready. What would you like to explore today?";
    }

    // Update profile
    if (userName) {
      userName.textContent = user.displayName || "Google user";
    }

    if (userEmail) {
      userEmail.textContent = user.email || "";
    }

    if (userAvatar) {
      userAvatar.textContent = user.displayName
        ? user.displayName.charAt(0).toUpperCase()
        : "G";
    }

    authStatus?.classList.add("signed-in");

    if (signOutButton) {
      signOutButton.hidden = false;
    }

  } else {
        // RESTORE DEFAULT WELCOME MESSAGE
    const personalWelcome = document.getElementById("personalWelcome");
    const personalWelcomeText = document.getElementById("personalWelcomeText");

    if (personalWelcome) {
      personalWelcome.innerHTML = 'Where ideas<br><em>become reality.</em>';
    }

    if (personalWelcomeText) {
      personalWelcomeText.textContent =
        "Think freely. Ask anything. Create something amazing. Your intelligent assistant is ready to help.";
    }

    // Show login screen
    authScreen.hidden = false;
    appShell.hidden = true;
    appShell.classList.remove("authenticated");

    if (userName) {
      userName.textContent = "HARVION AI";
    }

    if (userEmail) {
      userEmail.textContent = "Not signed in";
    }

    if (userAvatar) {
      userAvatar.textContent = "A";
    }

    authStatus?.classList.remove("signed-in");

    if (signOutButton) {
      signOutButton.hidden = true;
    }
  }
});
