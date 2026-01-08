import admin from 'firebase-admin';
import path from 'path';
import fs from 'fs';

const serviceAccountPath = path.join(__dirname, 'firebase-service-account.json');

// Verifica che il file esista
if (!fs.existsSync(serviceAccountPath)) {
  console.error('❌ Firebase service account file not found:', serviceAccountPath);
  console.error('   Please download it from Firebase Console and place it in src/config/');
} else {
  try {
    const serviceAccount = require('./firebase-service-account.json');

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });

    console.log('✅ Firebase Admin initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing Firebase Admin:', error);
  }
}

export default admin;
