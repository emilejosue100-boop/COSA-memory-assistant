import type { Language } from '../types';
import { HAS_API_PROXY } from '../generated/apiProxy';

export type MessageContext =
  | 'login'
  | 'register'
  | 'committee'
  | 'save'
  | 'loan'
  | 'repay'
  | 'approve'
  | 'profile'
  | 'opportunity'
  | 'general';

interface UserMessageInput {
  language: Language;
  status?: number;
  serverError?: string;
  context?: MessageContext;
  code?: 'network' | 'misconfigured' | 'not_json' | 'unknown';
}

const messages = {
  wrongPin: {
    en: 'Incorrect PIN. Please check your 4-digit code and try again.',
    fr: 'Code PIN incorrect. Vérifiez votre code à 4 chiffres et réessayez.',
  },
  accountNotFound: {
    en: 'No account found for this phone number. Use Join to register, or ask your committee.',
    fr: 'Aucun compte trouvé pour ce numéro. Utilisez Inscription ou contactez votre comité.',
  },
  committeeNotFound: {
    en: 'No committee account found for this phone number.',
    fr: 'Aucun compte comité trouvé pour ce numéro.',
  },
  notCommittee: {
    en: 'This phone number is a member account, not a committee account. Use Sign In instead.',
    fr: 'Ce numéro est un compte membre, pas comité. Utilisez Connexion.',
  },
  alreadyRegistered: {
    en: 'This phone number is already registered. Use Sign In instead.',
    fr: 'Ce numéro est déjà enregistré. Utilisez Connexion.',
  },
  nameRequired: {
    en: 'Please enter your full name to create an account.',
    fr: 'Veuillez entrer votre nom complet pour créer un compte.',
  },
  network: {
    en: 'Could not connect. Check your internet connection and try again.',
    fr: 'Connexion impossible. Vérifiez votre internet et réessayez.',
  },
  serverUnreachable: {
    en: 'Kumbuka is temporarily unavailable. Please try again in a few minutes.',
    fr: 'Kumbuka est temporairement indisponible. Réessayez dans quelques minutes.',
  },
  serverDown: {
    en: 'Our servers are busy right now. Please try again shortly.',
    fr: 'Nos serveurs sont occupés. Veuillez réessayer sous peu.',
  },
  saveFailed: {
    en: 'Your savings could not be recorded. Please try again.',
    fr: 'Votre épargne n’a pas pu être enregistrée. Réessayez.',
  },
  loanFailed: {
    en: 'Your loan request could not be sent. Please try again.',
    fr: 'Votre demande de prêt n’a pas pu être envoyée. Réessayez.',
  },
  repayFailed: {
    en: 'Repayment could not be processed. Please try again.',
    fr: 'Le remboursement n’a pas pu être traité. Réessayez.',
  },
  approveFailed: {
    en: 'That action could not be completed. Please try again.',
    fr: 'Cette action n’a pas pu être effectuée. Réessayez.',
  },
  profileFailed: {
    en: 'Your profile could not be updated. Please try again.',
    fr: 'Votre profil n’a pas pu être mis à jour. Réessayez.',
  },
  registerFailed: {
    en: 'Member registration failed. Check the details and try again.',
    fr: 'L’inscription a échoué. Vérifiez les informations et réessayez.',
  },
  opportunityFailed: {
    en: 'Could not refresh opportunities right now. Try again later.',
    fr: 'Impossible d’actualiser les opportunités. Réessayez plus tard.',
  },
  loginFailed: {
    en: 'Sign in failed. Check your phone number and PIN.',
    fr: 'Connexion échouée. Vérifiez votre numéro et votre PIN.',
  },
  committeeLoginFailed: {
    en: 'Committee sign in failed. Check your phone number and PIN.',
    fr: 'Connexion comité échouée. Vérifiez votre numéro et votre PIN.',
  },
  generic: {
    en: 'Something went wrong. Please try again.',
    fr: 'Une erreur s’est produite. Réessayez.',
  },
} as const;

function pick(language: Language, pair: { en: string; fr: string }): string {
  return language === 'fr' ? pair.fr : pair.en;
}

/** Prefer a clean bilingual server message when it looks user-facing. */
function fromServer(serverError: string | undefined, language: Language): string | null {
  if (!serverError?.trim()) return null;
  const parts = serverError.split(' / ').map((part) => part.trim());
  if (parts.length >= 2) {
    return language === 'fr' ? parts[parts.length - 1] : parts[0];
  }
  return serverError;
}

export function getUserMessage(input: UserMessageInput): string {
  const { language, status, serverError, context = 'general', code } = input;
  const fromApi = fromServer(serverError, language);
  if (fromApi && status && status >= 400 && status < 500 && status !== 405) {
    return fromApi;
  }

  if (code === 'network') {
    return pick(language, messages.network);
  }

  if (code === 'misconfigured' || code === 'not_json' || status === 405) {
    return pick(language, messages.serverUnreachable);
  }

  if (status === 401) {
    return pick(language, messages.wrongPin);
  }

  if (status === 403 && context === 'committee') {
    return pick(language, messages.notCommittee);
  }

  if (status === 404 && context === 'committee') {
    return pick(language, messages.committeeNotFound);
  }

  if (status === 404 && (context === 'login' || context === 'register')) {
    return pick(language, messages.accountNotFound);
  }

  if (status === 409) {
    return pick(language, messages.alreadyRegistered);
  }

  if (status === 503 || status === 502 || status === 504) {
    if (fromApi) return fromApi;
    return pick(language, messages.serverDown);
  }

  switch (context) {
    case 'login':
      return pick(language, messages.loginFailed);
    case 'committee':
      return pick(language, messages.committeeLoginFailed);
    case 'register':
      return pick(language, messages.registerFailed);
    case 'save':
      return pick(language, messages.saveFailed);
    case 'loan':
      return pick(language, messages.loanFailed);
    case 'repay':
      return pick(language, messages.repayFailed);
    case 'approve':
      return pick(language, messages.approveFailed);
    case 'profile':
      return pick(language, messages.profileFailed);
    case 'opportunity':
      return pick(language, messages.opportunityFailed);
    default:
      return fromApi ?? pick(language, messages.generic);
  }
}

export function getApiConfigWarning(language: Language): string | null {
  if (!import.meta.env.PROD) return null;
  if (import.meta.env.VITE_API_URL || HAS_API_PROXY) return null;
  return language === 'fr'
    ? 'Kumbuka est inaccessible — configurez BACKEND_URL sur Vercel.'
    : 'Kumbuka cannot reach the server — set BACKEND_URL on Vercel to your Render API URL, then redeploy.';
}
