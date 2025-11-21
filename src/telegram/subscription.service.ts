import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  SubscriptionPlan,
  UserSubscription,
  SubscriptionPlanId,
  SUBSCRIPTION_PLANS,
} from '../types/payment.types';

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(private databaseService: DatabaseService) {}

  /**
   * Получить все доступные планы подписки
   */
  getAvailablePlans(): SubscriptionPlan[] {
    return Object.values(SUBSCRIPTION_PLANS).filter(
      plan => plan.id !== SubscriptionPlanId.FREE
    );
  }

  /**
   * Получить план по ID
   */
  getPlanById(planId: string): SubscriptionPlan | null {
    return SUBSCRIPTION_PLANS[planId as SubscriptionPlanId] || null;
  }

  /**
   * Получить активную подписку пользователя
   */
  async getUserSubscription(userId: number): Promise<UserSubscription | null> {
    try {
      const { data, error } = await this.databaseService
        .getClient()
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .single();

      if (error || !data) {
        return null;
      }

      return {
        userId: data.user_id,
        planId: data.plan_id,
        startDate: new Date(data.start_date),
        endDate: new Date(data.end_date),
        isActive: data.is_active,
        transactionId: data.transaction_id,
      };
    } catch (error: any) {
      this.logger.error(`Error getting user subscription: ${error.message}`);
      return null;
    }
  }

  /**
   * Проверить, активна ли подписка пользователя
   */
  async isSubscriptionActive(userId: number): Promise<boolean> {
    const subscription = await this.getUserSubscription(userId);
    
    if (!subscription) {
      return false;
    }

    // Проверяем, не истекла ли подписка
    if (new Date() > subscription.endDate) {
      // Деактивируем истёкшую подписку
      await this.deactivateSubscription(userId);
      return false;
    }

    return subscription.isActive;
  }

  /**
   * Получить текущий план пользователя (включая бесплатный)
   */
  async getCurrentPlan(userId: number): Promise<SubscriptionPlan> {
    const subscription = await this.getUserSubscription(userId);
    
    if (!subscription || !subscription.isActive) {
      return SUBSCRIPTION_PLANS[SubscriptionPlanId.FREE];
    }

    return this.getPlanById(subscription.planId) || SUBSCRIPTION_PLANS[SubscriptionPlanId.FREE];
  }

  /**
   * Создать подписку после успешной оплаты
   */
  async createSubscription(
    userId: number,
    planId: string,
    transactionId: string,
  ): Promise<boolean> {
    try {
      const plan = this.getPlanById(planId);
      
      if (!plan) {
        this.logger.error(`Plan not found: ${planId}`);
        return false;
      }

      // Деактивируем старые подписки
      await this.deactivateAllSubscriptions(userId);

      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + plan.duration);

      const { error } = await this.databaseService
        .getClient()
        .from('subscriptions')
        .insert({
          user_id: userId,
          plan_id: planId,
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
          is_active: true,
          transaction_id: transactionId,
          created_at: new Date().toISOString(),
        });

      if (error) {
        this.logger.error(`Error creating subscription: ${error.message}`);
        return false;
      }

      this.logger.log(`✅ Subscription created: User=${userId}, Plan=${planId}, Transaction=${transactionId}`);
      return true;
    } catch (error: any) {
      this.logger.error(`Error creating subscription: ${error.message}`);
      return false;
    }
  }

  /**
   * Деактивировать подписку
   */
  private async deactivateSubscription(userId: number): Promise<void> {
    try {
      await this.databaseService
        .getClient()
        .from('subscriptions')
        .update({ is_active: false })
        .eq('user_id', userId)
        .eq('is_active', true);

      this.logger.log(`🔴 Subscription deactivated: User=${userId}`);
    } catch (error: any) {
      this.logger.error(`Error deactivating subscription: ${error.message}`);
    }
  }

  /**
   * Деактивировать все подписки пользователя
   */
  private async deactivateAllSubscriptions(userId: number): Promise<void> {
    try {
      await this.databaseService
        .getClient()
        .from('subscriptions')
        .update({ is_active: false })
        .eq('user_id', userId);
    } catch (error: any) {
      this.logger.error(`Error deactivating all subscriptions: ${error.message}`);
    }
  }

  /**
   * Проверить лимиты использования
   */
  async checkUsageLimit(
    userId: number,
    action: 'dailyGenerations' | 'imageGenerations' | 'voiceAnalysis',
  ): Promise<{ allowed: boolean; remaining: number; limit: number }> {
    const plan = await this.getCurrentPlan(userId);
    const limit = plan.limits[action];

    // Получаем использование за сегодня
    const usage = await this.getTodayUsage(userId, action);
    const remaining = Math.max(0, limit - usage);
    const allowed = usage < limit;

    return { allowed, remaining, limit };
  }

  /**
   * Получить использование за сегодня
   */
  private async getTodayUsage(
    userId: number,
    action: string,
  ): Promise<number> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data, error } = await this.databaseService
        .getClient()
        .from('usage_stats')
        .select('count')
        .eq('user_id', userId)
        .eq('action_type', action)
        .gte('created_at', today.toISOString())
        .single();

      if (error || !data) {
        return 0;
      }

      return data.count || 0;
    } catch (error: any) {
      this.logger.error(`Error getting usage stats: ${error.message}`);
      return 0;
    }
  }

  /**
   * Записать использование функции
   */
  async recordUsage(
    userId: number,
    action: 'dailyGenerations' | 'imageGenerations' | 'voiceAnalysis',
  ): Promise<void> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Проверяем, есть ли уже запись за сегодня
      const { data: existing } = await this.databaseService
        .getClient()
        .from('usage_stats')
        .select('*')
        .eq('user_id', userId)
        .eq('action_type', action)
        .gte('created_at', today.toISOString())
        .single();

      if (existing) {
        // Увеличиваем счётчик
        await this.databaseService
          .getClient()
          .from('usage_stats')
          .update({ count: existing.count + 1 })
          .eq('id', existing.id);
      } else {
        // Создаём новую запись
        await this.databaseService
          .getClient()
          .from('usage_stats')
          .insert({
            user_id: userId,
            action_type: action,
            count: 1,
            created_at: new Date().toISOString(),
          });
      }
    } catch (error: any) {
      this.logger.error(`Error recording usage: ${error.message}`);
    }
  }

  /**
   * Получить информацию о подписке для отображения
   */
  async getSubscriptionInfo(userId: number): Promise<string> {
    const plan = await this.getCurrentPlan(userId);
    const subscription = await this.getUserSubscription(userId);

    let info = `📊 **Ваша подписка**\n\n`;
    info += `💎 План: ${plan.name}\n`;
    info += `📝 ${plan.description}\n\n`;

    if (subscription && subscription.isActive) {
      const daysLeft = Math.ceil(
        (subscription.endDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      );
      info += `⏰ Осталось: ${daysLeft} дней\n`;
      info += `📅 Истекает: ${subscription.endDate.toLocaleDateString('ru-RU')}\n\n`;
    }

    info += `**Возможности:**\n`;
    plan.features.forEach(feature => {
      info += `${feature}\n`;
    });

    // Проверяем лимиты
    const dailyLimit = await this.checkUsageLimit(userId, 'dailyGenerations');
    const imageLimit = await this.checkUsageLimit(userId, 'imageGenerations');

    info += `\n**Использование сегодня:**\n`;
    info += `🎨 Генерации: ${dailyLimit.limit - dailyLimit.remaining}/${dailyLimit.limit}\n`;
    info += `🖼️ Изображения: ${imageLimit.limit - imageLimit.remaining}/${imageLimit.limit}\n`;

    return info;
  }
}