import admin from 'firebase-admin';
import path from 'path';
import fs from 'fs';

// Try multiple paths: dist/config/ (compiled) and src/config/ (source)
const distPath = path.join(__dirname, 'firebase-service-account.json');
const srcPath = path.resolve(__dirname, '../../src/config/firebase-service-account.json');

const serviceAccountPath = fs.existsSync(distPath) ? distPath : srcPath;

// Verifica che il file esista
if (!fs.existsSync(serviceAccountPath)) {
  console.error('❌ Firebase service account file not found');
  console.error('   Tried:', distPath);
  console.error('   Tried:', srcPath);
  console.error('   Please download it from Firebase Console and place it in src/config/');
} else {
  try {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });

    console.log('✅ Firebase Admin initialized successfully (from', serviceAccountPath, ')');
  } catch (error) {
    console.error('❌ Error initializing Firebase Admin:', error);
  }
}

export default admin;
