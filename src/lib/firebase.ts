import { initializeApp } from 'firebase/app'
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  indexedDBLocalPersistence,
  inMemoryPersistence,
  initializeAuth,
  signOut,
} from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(config)

// Lokal persistens: brukeren forblir innlogget til hen logger ut selv.
export const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence],
})

export const db = getFirestore(app)

// Egen Firebase-instans for å lage elevkontoer. Å lage en bruker logger
// alltid inn som den nye brukeren – her skjer det i en separat instans,
// så læreren forblir innlogget i appen.
const accountsAuth = initializeAuth(initializeApp(config, 'elevkontoer'), {
  persistence: inMemoryPersistence,
})

/** Lager en innloggingskonto og returnerer den nye brukerens uid. */
export async function createAccount(email: string, password: string) {
  const credential = await createUserWithEmailAndPassword(accountsAuth, email, password)
  await signOut(accountsAuth)
  return credential.user.uid
}
