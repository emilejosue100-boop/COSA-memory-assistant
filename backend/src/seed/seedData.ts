import type { FinancialTip } from '../types/index.js';

export const COOPERATIVE_NAME = 'Kumbuka';

export const demoAccounts = [
  { name: 'Committee Admin', phone: '0788123456', pin: '1234', role: 'admin' as const },
  { name: 'Demo Member', phone: '0788111111', pin: '1234', role: 'member' as const },
];

export const defaultWelcomeTip: FinancialTip = {
  id: 'tip-welcome',
  titleEn: 'Welcome to Kumbuka',
  titleFr: 'Bienvenue sur Kumbuka',
  contentEn: 'Start saving regularly — even small amounts build trust and growth for your group.',
  contentFr: 'Commencez à épargner régulièrement — même de petits montants renforcent la confiance et la croissance du groupe.',
  whyEn: 'This tip appears until you make your first savings contribution.',
  whyFr: 'Ce conseil s’affiche jusqu’à votre premier versement d’épargne.',
  category: 'goal',
};
