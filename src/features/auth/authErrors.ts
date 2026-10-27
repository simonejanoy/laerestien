import { FirebaseError } from 'firebase/app'

/** Gjør Firebase-feil om til en forståelig melding på norsk. */
export function authErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'Feil e-post eller passord.'
      case 'auth/invalid-email':
        return 'E-postadressen er ikke gyldig.'
      case 'auth/email-already-in-use':
        return 'Det finnes allerede en konto med denne e-postadressen.'
      case 'auth/weak-password':
        return 'Passordet må ha minst 6 tegn.'
      case 'auth/too-many-requests':
        return 'For mange forsøk. Vent litt og prøv igjen.'
      case 'auth/operation-not-allowed':
      case 'auth/configuration-not-found':
        return 'Innlogging med e-post er ikke slått på i Firebase ennå.'
      case 'permission-denied':
        return 'Ikke tillatt. Sjekk lærerkoden og prøv igjen.'
    }
  }
  return 'Noe gikk galt. Prøv igjen.'
}
