import { Injectable, Logger } from '@nestjs/common';
import { Context } from 'telegraf';
import { InlineKeyboardMarkup } from 'telegraf/typings/core/types/typegram';
import { SubscriptionService } from '../subscription.service';
import { PaymentCallbackData } from '../../types/payment.types';

@Injectable()
export class SubscriptionCommand {
  private readonly logger = new Logger(SubscriptionCommand.name);

  constructor(private subscriptionService: SubscriptionService) {}

  /**
   * Показать информацию о текущей подписке
   */
  async showMySubscription(ctx: Context) {
    if (!ctx.from) {
      await ctx.reply('❌ Не удалось получить информацию о пользователе');
      return;
    }

    try {
      const info = await this.subscriptionService.getSubscriptionInfo(ctx.from.id);
      
      await ctx.reply(info, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '⭐ Улучшить подписку',
                callback_data: 'show_plans',
              },
            ],
          ],
        },
      });
    } catch (error: any) {
      this.logger.error(`Error showing subscription: ${error.message}`);
      await ctx.reply('❌ Ошибка при получении информации о подписке');
    }
  }

  /**
   * Показать доступные планы подписки
   */
  async showPlans(ctx: Context) {
    const plans = this.subscriptionService.getAvailablePlans();

    let message = `🌟 **Доступные подписки**\n\n`;
    message += `Выберите план, который подходит вам:\n\n`;

    plans.forEach(plan => {
      message += `${plan.name}\n`;
      message += `💰 Цена: ${plan.price} Stars\n`;
      message += `⏰ Срок: ${plan.duration} дней\n`;
      message += `📝 ${plan.description}\n`;
      plan.features.forEach(feature => {
        message += `  ${feature}\n`;
      });
      message += `\n`;
    });

    message += `\n💡 **Как оплатить?**\n`;
    message += `Нажмите на кнопку нужного плана ниже 👇`;

    const keyboard: InlineKeyboardMarkup = {
      inline_keyboard: plans.map(plan => [
        {
          text: `${plan.name} - ${plan.price} ⭐`,
          callback_data: JSON.stringify({
            action: 'buy_subscription',
            planId: plan.id,
          } as PaymentCallbackData),
        },
      ]),
    };

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });
  }

  /**
   * Создать инвойс для оплаты подписки
   */
  async createInvoice(ctx: Context, planId: string) {
    if (!ctx.from) {
      await ctx.reply('❌ Не удалось получить информацию о пользователе');
      return;
    }

    try {
      const plan = this.subscriptionService.getPlanById(planId);

      if (!plan) {
        await ctx.reply('❌ План не найден');
        return;
      }

      // Формируем payload для отслеживания платежа
      const payload = JSON.stringify({
        userId: ctx.from.id,
        planId: plan.id,
        timestamp: Date.now(),
      });

      // Создаём инвойс с Telegram Stars
      await ctx.replyWithInvoice({
        title: plan.name,
        description: plan.description,
        payload: payload,
        provider_token: '', // Для Telegram Stars оставляем пустым
        currency: 'XTR', // Telegram Stars валюта
        prices: [
          {
            label: plan.name,
            amount: plan.price, // Цена в Stars
          },
        ],
      });

      this.logger.log(`📄 Invoice created: User=${ctx.from.id}, Plan=${planId}, Price=${plan.price} Stars`);
    } catch (error: any) {
      this.logger.error(`Error creating invoice: ${error.message}`);
      await ctx.reply(
        '❌ Ошибка при создании счёта. Попробуйте позже или свяжитесь с поддержкой.'
      );
    }
  }

  /**
   * Обработать pre-checkout запрос (проверка перед оплатой)
   */
  async handlePreCheckout(ctx: Context) {
    if (!ctx.preCheckoutQuery) {
      return;
    }

    try {
      const payload = JSON.parse(ctx.preCheckoutQuery.invoice_payload);
      const plan = this.subscriptionService.getPlanById(payload.planId);

      if (!plan) {
        await ctx.answerPreCheckoutQuery(false, 'План подписки не найден');
        return;
      }

      // Здесь можно добавить дополнительные проверки
      // Например, проверить баланс пользователя, лимиты и т.д.

      // Подтверждаем платёж
      await ctx.answerPreCheckoutQuery(true);
      
      this.logger.log(`✅ Pre-checkout approved: User=${payload.userId}, Plan=${payload.planId}`);
    } catch (error: any) {
      this.logger.error(`Error in pre-checkout: ${error.message}`);
      await ctx.answerPreCheckoutQuery(false, 'Ошибка при обработке платежа');
    }
  }

  /**
   * Обработать успешный платёж
   */
  async handleSuccessfulPayment(ctx: Context) {
    if (!ctx.message || !('successful_payment' in ctx.message)) {
      return;
    }

    if (!ctx.from) {
      return;
    }

    try {
      const payment = ctx.message.successful_payment;
      const payload = JSON.parse(payment.invoice_payload);

      this.logger.log(
        `💰 Payment received: User=${ctx.from.id}, Amount=${payment.total_amount} Stars, Transaction=${payment.telegram_payment_charge_id}`
      );

      // Создаём подписку
      const success = await this.subscriptionService.createSubscription(
        payload.userId,
        payload.planId,
        payment.telegram_payment_charge_id,
      );

      if (success) {
        const plan = this.subscriptionService.getPlanById(payload.planId);
        
        await ctx.reply(
          `🎉 **Поздравляем!**\n\n` +
          `✅ Подписка **${plan?.name}** успешно активирована!\n\n` +
          `📅 Срок действия: ${plan?.duration} дней\n` +
          `💎 Теперь вам доступны все возможности:\n\n` +
          `${plan?.features.join('\n')}\n\n` +
          `🚀 Начните использовать прямо сейчас!\n` +
          `Введите /imagine [ваш промпт] для генерации изображения`,
          { parse_mode: 'Markdown' }
        );

        // Отправляем благодарность
        await ctx.reply(
          '🙏 Спасибо за вашу поддержку!\n\n' +
          'Если возникнут вопросы, используйте /help'
        );
      } else {
        await ctx.reply(
          '❌ Ошибка при активации подписки.\n' +
          'Платёж получен, но подписка не активирована.\n' +
          'Пожалуйста, свяжитесь с поддержкой.'
        );
      }
    } catch (error: any) {
      this.logger.error(`Error handling successful payment: ${error.message}`);
      await ctx.reply(
        '❌ Ошибка при обработке платежа.\n' +
        'Пожалуйста, свяжитесь с поддержкой.'
      );
    }
  }
}