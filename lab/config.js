/* =====================================================================
   BOUNCE LAB — SETTINGS
   This is the only file you need to edit to turn on the online features.
   Until it's filled in, the lab runs in "demo mode": leaderboards,
   ratings and feedback are saved only on the device you're using.
   See docs/SETUP.md for step-by-step instructions.
   ===================================================================== */
window.BOUNCE_LAB_CONFIG = {

  // 1) FIREBASE — paste the "firebaseConfig" values from your Firebase
  //    project (Project settings → General → Your apps → Web app).
  firebase: {
    apiKey: "AIzaSyAciYZDL4DNuxxSxywXPdNNJvFPjzwu4aI",
    authDomain: "bounce-lab-ebfbd.firebaseapp.com",
    projectId: "bounce-lab-ebfbd",
    storageBucket: "bounce-lab-ebfbd.firebasestorage.app",
    messagingSenderId: "698209398868",
    appId: "1:698209398868:web:28f17acfb97b6e7d3a7dc1",
    measurementId: "G-D1QTD8WQMP"
  },

  // 2) ADMIN — who can open the admin page is decided by the email in the
  //    Firestore rules (Firebase console → Firestore → Rules → isAdmin).
  //    Nothing to set here.

  // 3) GOATCOUNTER — just the code, e.g. "bouncelab" for
  //    https://bouncelab.goatcounter.com. Leave "" to turn analytics off.
  goatcounter: "",

  // 4) PUBLIC ADDRESS — used for share links, so they always point at the live site
  siteUrl: "https://az-build.github.io/bounce-lab/",

  // Name shown at the top of the lobby
  labName: "BOUNCE LAB"
};
