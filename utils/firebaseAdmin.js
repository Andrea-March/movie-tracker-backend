const admin = require('firebase-admin');

// Inizializza Firebase Admin con il tuo file di credenziali
admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_AUTH_JSON)),
  databaseURL: 'https://your-project-id.firebaseio.com' // Il tuo URL del database Firebase
});

module.exports = admin;