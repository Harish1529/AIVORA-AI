
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js";

import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";

// ========================================
// FIREBASE CONFIGURATION
// ========================================

const firebaseConfig = {
  apiKey: "AIzaSyDgVqvC8REm5E96kfL2hPbrmdqzEfZrbKc",
  authDomain: "harvoin-ai-web.firebaseapp.com",
  projectId: "harvoin-ai-web",
  storageBucket: "harvoin-ai-web.firebasestorage.app",
  messagingSenderId: "840815457367",
  appId: "1:840815457367:web:78c44aefcddc47b5ba1f12"
};

// ========================================
// INITIALIZE FIREBASE
// ========================================

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// Get secure login token for backend requests
window.getFirebaseIdToken = async function () {
  const user = auth.currentUser;

  if (!user) {
    throw new Error("Please sign in with Google first.");
  }

  return await user.getIdToken();
};

const provider = new GoogleAuthProvider();
provider.setCustomParameters({
  prompt: "select_account"
});

// ========================================
// HTML ELEMENTS
// ========================================

const signInButton = document.getElementById("googleSignInButton");
const signOutButton = document.getElementById("signOutButton");

const authScreen = document.getElementById("authScreen");
const appShell = document.querySelector(".app-shell");

const userName = document.getElementById("userName");
const userEmail = document.getElementById("userEmail");
const userAvatar = document.getElementById("userAvatar");
const authStatus = document.getElementById("authStatus");

const authMessage = document.getElementById("authMessage");

// ========================================
// AUTH MESSAGE
// ========================================

function showAuthMessage(message, isError = false) {
  if (!authMessage) return;

  authMessage.textContent = message;
  authMessage.style.color = isError ? "#ff6b6b" : "";
}

function getFriendlyError(error) {
  const messages = {
    "auth/popup-closed-by-user": "Google sign-in was cancelled.",
    "auth/unauthorized-domain": "This domain is not authorized in Firebase.",
    "auth/popup-blocked": "Your browser blocked the sign-in popup.",
    "auth/network-request-failed": "Please check your internet connection.",
    "auth/api-key-not-valid": "Firebase API key is invalid. Check your Firebase configuration."
  };

  return messages[error.code] || error.message || "Google sign-in failed.";
}

// ========================================
// GOOGLE SIGN IN
// ========================================

if (signInButton) {
  signInButton.addEventListener("click", async () => {
    signInButton.disabled = true;

    try {
      showAuthMessage("Connecting to Google...");

      await signInWithPopup(auth, provider);

      showAuthMessage("");

    } catch (error) {
      console.error("Google sign-in error:", error);
      showAuthMessage(getFriendlyError(error), true);

    } finally {
      signInButton.disabled = false;
    }
  });
} else {
  console.error("Google sign-in button not found.");
}

// ========================================
// SIGN OUT
// ========================================

if (signOutButton) {
  signOutButton.addEventListener("click", async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Sign-out error:", error);
      alert(getFriendlyError(error));
    }
  });
}

// ========================================
// AUTHENTICATION STATE
// ========================================

onAuthStateChanged(auth, (user) => {
  if (!authScreen || !appShell) {
    console.error("Authentication screen or app shell not found.");
    return;
  }

  if (user) {
    authScreen.hidden = true;
    appShell.hidden = false;
    appShell.classList.add("authenticated");

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

    if (userName) {
      userName.textContent = user.displayName || "Google user";
    }

    if (userEmail) {
      userEmail.textContent = user.email || "";
    }

    if (userAvatar) {
      userAvatar.textContent = firstName.charAt(0).toUpperCase();
    }

    authStatus?.classList.add("signed-in");

    if (signOutButton) {
      signOutButton.hidden = false;
    }

  } else {
    authScreen.hidden = false;
    appShell.hidden = true;
    appShell.classList.remove("authenticated");

    if (userName) userName.textContent = "HARVION AI";
    if (userEmail) userEmail.textContent = "Not signed in";
    if (userAvatar) userAvatar.textContent = "A";

    authStatus?.classList.remove("signed-in");

    if (signOutButton) {
      signOutButton.hidden = true;
    }
  }
});

