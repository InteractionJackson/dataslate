// Firebase web app config for rooms and the display view. See "Rooms setup" in README.md.
// Values from Firebase console → Project settings → Your apps → Web app; databaseURL is shown at the top of
// Realtime Database → Data. They identify the project; they are not secrets. database.rules.json is what protects the data.
// While apiKey is empty, the Room button stays hidden and Data Slate works as a solo scorer.
window.DATA_SLATE_FIREBASE = {
  apiKey: "AIzaSyASlfNCNI7KdbXl9fkODc0RrG9g_L9HgW8",
  authDomain: "data-slate.firebaseapp.com",
  databaseURL: "https://data-slate-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "data-slate",
  appId: "1:848138787001:web:8734a9735616eea8cce368",
};
