// Типы для работы с Telegram Stars платежами

export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  price: number; // цена в Stars
  duration: number; // продолжительность в днях
  features: string[];
  limits: {
    dailyGenerations: number;
    imageGenerations: number;
    voiceAnalysis: number;
  };
}

export interface UserSubscription {
  userId: number;
  planId: string;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  transactionId: string;
}

export interface PaymentCallbackData {
  action: 'buy_subscription';
  planId: string;
}

export enum SubscriptionPlanId {
  FREE = 'free',
  BASIC = 'basic',
  PRO = 'pro',
  PREMIUM = 'premium',
}

export const SUBSCRIPTION_PLANS: Record<SubscriptionPlanId, SubscriptionPlan> = {
  [SubscriptionPlanId.FREE]: {
    id: SubscriptionPlanId.FREE,
    name: '🆓 Бесплатный',
    description: 'Базовые функции для теста',
    price: 0,
    duration: 0,
    features: [
      '✅ 3 генерации в день',
      '✅ Базовый AI анализ',
    ],
    limits: {
      dailyGenerations: 3,
      imageGenerations: 1,
      voiceAnalysis: 2,
    },
  },
  [SubscriptionPlanId.BASIC]: {
    id: SubscriptionPlanId.BASIC,
    name: '⭐ Базовый',
    description: 'Для регулярного использования',
    price: 50, // 50 Stars для теста
    duration: 7, // 7 дней
    features: [
      '✅ 50 генераций в день',
      '✅ Анализ фото и видео',
      '✅ Приоритетная обработка',
    ],
    limits: {
      dailyGenerations: 50,
      imageGenerations: 20,
      voiceAnalysis: 30,
    },
  },
  [SubscriptionPlanId.PRO]: {
    id: SubscriptionPlanId.PRO,
    name: '💎 Pro',
    description: 'Для профессионалов',
    price: 150, // 150 Stars для теста
    duration: 30, // 30 дней
    features: [
      '✅ Безлимитные генерации',
      '✅ Все функции AI',
      '✅ Максимальный приоритет',
      '✅ Эксклюзивные модели',
    ],
    limits: {
      dailyGenerations: 999999,
      imageGenerations: 999999,
      voiceAnalysis: 999999,
    },
  },
  [SubscriptionPlanId.PREMIUM]: {
    id: SubscriptionPlanId.PREMIUM,
    name: '👑 Premium',
    description: 'Всё включено навсегда',
    price: 500, // 500 Stars для теста
    duration: 365, // 1 год
    features: [
      '✅ Безлимитные генерации',
      '✅ Все функции AI',
      '✅ VIP поддержка',
      '✅ Ранний доступ к новым функциям',
      '✅ Эксклюзивные промпты',
    ],
    limits: {
      dailyGenerations: 999999,
      imageGenerations: 999999,
      voiceAnalysis: 999999,
    },
  },
};