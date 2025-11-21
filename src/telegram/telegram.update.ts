import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Context } from 'telegraf';
import { StartCommand } from './commands/start.command';
import { HelpCommand } from './commands/help.command';
import { SubscriptionCommand } from './commands/subscription.command';
import { DatabaseService } from '../database/database.service';
import { TelegramService } from './telegram.service';
import { GeminiService } from '../ai/gemini.service';
import { SubscriptionService } from './subscription.service';
import { hasFrom, hasTextMessage } from './guards/context.guard';
import { PaymentCallbackData } from '../types/payment.types';

@Injectable()
export class TelegramUpdate implements OnModuleInit {
  private readonly logger = new Logger(TelegramUpdate.name);

  constructor(
    private startCommand: StartCommand,
    private helpCommand: HelpCommand,
    private subscriptionCommand: SubscriptionCommand,
    private databaseService: DatabaseService,
    private telegramService: TelegramService,
    private geminiService: GeminiService,
    private subscriptionService: SubscriptionService,
  ) {}

  onModuleInit() {
    const bot = this.telegramService.getBot();

    // Основные команды
    bot.start(async (ctx: Context) => {
      try {
        await this.onStart(ctx);
      } catch (error: any) {
        this.logger.error(`Error in /start: ${error.message}`);
      }
    });

    bot.help(async (ctx: Context) => {
      try {
        await this.onHelp(ctx);
      } catch (error: any) {
        this.logger.error(`Error in /help: ${error.message}`);
      }
    });

    bot.command('profile', async (ctx: Context) => {
      try {
        await this.onProfile(ctx);
      } catch (error: any) {
        this.logger.error(`Error in /profile: ${error.message}`);
      }
    });

    // Команды для подписок
    bot.command('subscribe', async (ctx: Context) => {
      try {
        await this.subscriptionCommand.showPlans(ctx);
      } catch (error: any) {
        this.logger.error(`Error in /subscribe: ${error.message}`);
      }
    });

    bot.command('subscription', async (ctx: Context) => {
      try {
        await this.subscriptionCommand.showMySubscription(ctx);
      } catch (error: any) {
        this.logger.error(`Error in /subscription: ${error.message}`);
      }
    });

    // Обработчики платежей
    bot.on('pre_checkout_query', async (ctx: Context) => {
      try {
        await this.subscriptionCommand.handlePreCheckout(ctx);
      } catch (error: any) {
        this.logger.error(`Error in pre_checkout_query: ${error.message}`);
      }
    });

    bot.on('successful_payment', async (ctx: Context) => {
      try {
        await this.subscriptionCommand.handleSuccessfulPayment(ctx);
      } catch (error: any) {
        this.logger.error(`Error in successful_payment: ${error.message}`);
      }
    });

    // Callback queries для кнопок
    bot.on('callback_query', async (ctx: Context) => {
      try {
        await this.onCallbackQuery(ctx);
      } catch (error: any) {
        this.logger.error(`Error in callback_query: ${error.message}`);
      }
    });

    // Остальные команды
    bot.command('ping', async (ctx: Context) => {
      try {
        await this.onPing(ctx);
      } catch (error: any) {
        this.logger.error(`Error in /ping: ${error.message}`);
      }
    });

    bot.command('status', async (ctx: Context) => {
      try {
        await this.onStatus(ctx);
      } catch (error: any) {
        this.logger.error(`Error in /status: ${error.message}`);
      }
    });

    bot.command('imagine', async (ctx: Context) => {
      try {
        await this.onImagine(ctx);
      } catch (error: any) {
        this.logger.error(`Error in /imagine: ${error.message}`);
      }
    });

    // Медиа обработчики
    bot.on('photo', async (ctx: Context) => {
      try {
        await this.onPhoto(ctx);
      } catch (error: any) {
        this.logger.error(`Error in photo handler: ${error.message}`);
      }
    });

    bot.on('voice', async (ctx: Context) => {
      try {
        await this.onVoice(ctx);
      } catch (error: any) {
        this.logger.error(`Error in voice handler: ${error.message}`);
      }
    });

    bot.on('audio', async (ctx: Context) => {
      try {
        await this.onAudio(ctx);
      } catch (error: any) {
        this.logger.error(`Error in audio handler: ${error.message}`);
      }
    });

    bot.on('video', async (ctx: Context) => {
      try {
        await this.onVideo(ctx);
      } catch (error: any) {
        this.logger.error(`Error in video handler: ${error.message}`);
      }
    });

    bot.on('text', async (ctx: Context) => {
      try {
        await this.onText(ctx);
      } catch (error: any) {
        this.logger.error(`Error in text handler: ${error.message}`);
      }
    });

    this.logger.log('✅ Telegram command handlers registered (with payments)');
  }

  async onStart(ctx: Context) {
    await this.startCommand.execute(ctx);
  }

  async onHelp(ctx: Context) {
    await this.helpCommand.execute(ctx);
  }

  async onProfile(ctx: Context) {
    if (!hasFrom(ctx)) {
      await ctx.reply('Не удалось получить информацию о пользователе');
      return;
    }

    try {
      const user = await this.databaseService.getUser(ctx.from.id);
      
      if (!user) {
        await ctx.reply('Пользователь не найден. Используйте /start');
        return;
      }

      // Получаем информацию о подписке
      const plan = await this.subscriptionService.getCurrentPlan(ctx.from.id);
      const subscription = await this.subscriptionService.getUserSubscription(ctx.from.id);

      let profileText = `👤 **Ваш профиль**\n\n`;
      profileText += `ID: ${user.telegram_id}\n`;
      profileText += `Username: @${user.username || 'не указан'}\n`;
      profileText += `Имя: ${user.first_name}\n`;
      profileText += `Последний визит: ${new Date(user.last_seen).toLocaleString('ru-RU')}\n\n`;
      
      profileText += `💎 **Подписка:** ${plan.name}\n`;
      
      if (subscription && subscription.isActive) {
        const daysLeft = Math.ceil(
          (subscription.endDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
        );
        profileText += `⏰ Осталось: ${daysLeft} дней\n`;
      }

      await ctx.reply(profileText, { 
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '⭐ Управление подпиской',
                callback_data: 'show_subscription',
              },
            ],
          ],
        },
      });
    } catch (error: any) {
      this.logger.error(`Error in profile command: ${error.message}`);
      await ctx.reply('Произошла ошибка при получении профиля.');
    }
  }

  /**
   * Обработчик callback queries (нажатия на кнопки)
   */
  async onCallbackQuery(ctx: Context) {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
      return;
    }

    const data = ctx.callbackQuery.data;

    try {
      // Простые строковые команды
      if (data === 'show_plans') {
        await ctx.answerCbQuery();
        await this.subscriptionCommand.showPlans(ctx);
        return;
      }

      if (data === 'show_subscription') {
        await ctx.answerCbQuery();
        await this.subscriptionCommand.showMySubscription(ctx);
        return;
      }

      // JSON команды для покупки подписки
      const parsedData: PaymentCallbackData = JSON.parse(data);

      if (parsedData.action === 'buy_subscription') {
        await ctx.answerCbQuery();
        await this.subscriptionCommand.createInvoice(ctx, parsedData.planId);
        return;
      }
    } catch (error: any) {
      this.logger.error(`Error handling callback query: ${error.message}`);
      await ctx.answerCbQuery('Ошибка при обработке запроса');
    }
  }

  /**
   * Проверка лимитов перед использованием AI функций
   */
  private async checkAndRecordUsage(
    ctx: Context,
    action: 'dailyGenerations' | 'imageGenerations' | 'voiceAnalysis',
  ): Promise<boolean> {
    if (!ctx.from) {
      return false;
    }

    const limitCheck = await this.subscriptionService.checkUsageLimit(
      ctx.from.id,
      action,
    );

    if (!limitCheck.allowed) {
      const plan = await this.subscriptionService.getCurrentPlan(ctx.from.id);
      
      await ctx.reply(
        `❌ Вы достигли лимита на сегодня!\n\n` +
        `💎 Ваш план: ${plan.name}\n` +
        `📊 Лимит: ${limitCheck.limit} в день\n` +
        `⏰ Лимит обновится завтра\n\n` +
        `⭐ Хотите больше? Улучшите подписку: /subscribe`,
        {
          parse_mode: 'Markdown',
        }
      );
      return false;
    }

    // Записываем использование
    await this.subscriptionService.recordUsage(ctx.from.id, action);

    // Предупреждаем, если осталось мало
    if (limitCheck.remaining <= 3 && limitCheck.remaining > 0) {
      await ctx.reply(
        `⚠️ Внимание: осталось ${limitCheck.remaining} генераций на сегодня`,
        { parse_mode: 'Markdown' }
      );
    }

    return true;
  }

  async onPing(ctx: Context) {
    const startTime = Date.now();
    
    try {
      const sentMessage = await ctx.reply('🏓 Pinging...');
      const latency = Date.now() - startTime;
      
      if (!ctx.chat) {
        await ctx.reply('❌ Не удалось определить чат');
        return;
      }
      
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        sentMessage.message_id,
        undefined,
        `🏓 Pong!\n\n` +
        `⏱️ Задержка: ${latency}ms\n` +
        `📍 Регион: Vercel (Supabase)\n` +
        `⏰ Время: ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}`
      );
      
      this.logger.log(`⏱️ /ping command: ${latency}ms`);
    } catch (error: any) {
      this.logger.error(`Error in /ping: ${error.message}`);
      await ctx.reply('❌ Ошибка при выполнении команды /ping');
    }
  }

  async onStatus(ctx: Context) {
    const overallStart = Date.now();
    
    try {
      const message = await ctx.reply('⏳ Проверяю статус...');
      
      const botLatency = Date.now() - overallStart;
      
      const dbStart = Date.now();
      await this.databaseService.getClient()
        .from('users')
        .select('count')
        .limit(1);
      const dbLatency = Date.now() - dbStart;
      
      const totalTime = Date.now() - overallStart;
      
      const getQuality = (ms: number) => {
        if (ms < 100) return '🟢 Отлично';
        if (ms < 300) return '🟡 Хорошо';
        if (ms < 500) return '🟠 Средне';
        return '🔴 Медленно';
      };
      
      const dbStats = this.databaseService.getStats();
      
      const statusText = 
        `📊 **Статус системы**\n\n` +
        `🤖 **Бот (Telegram API)**\n` +
        `├ Задержка: ${botLatency}ms\n` +
        `└ Статус: ${getQuality(botLatency)}\n\n` +
        `💾 **База данных (Supabase)**\n` +
        `├ Задержка запроса: ${dbLatency}ms\n` +
        `├ Всего запросов: ${dbStats.queries}\n` +
        `├ Средняя задержка: ${dbStats.avgTime}ms\n` +
        `├ Мин/Макс: ${dbStats.minTime === Infinity ? 'N/A' : dbStats.minTime}/${dbStats.maxTime}ms\n` +
        `└ Статус: ${getQuality(dbLatency)}\n\n` +
        `⚡ **Общая производительность**\n` +
        `├ Полное время: ${totalTime}ms\n` +
        `└ Статус: ${getQuality(totalTime)}\n\n` +
        `📍 Сервер: Vercel (${process.env.VERCEL_REGION || 'unknown'})\n` +
        `🗄️ БД: Supabase\n` +
        `🤖 AI: Gemini 1.5 Flash + 2.5 Flash Image 🍌\n` +
        `⏰ Время: ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}`;
      
      if (!ctx.chat) {
        await ctx.reply('❌ Не удалось определить чат');
        return;
      }
      
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        message.message_id,
        undefined,
        statusText,
        { parse_mode: 'Markdown' }
      );
      
      this.logger.log(`⏱️ /status command processed in ${totalTime}ms`);
      
    } catch (error: any) {
      this.logger.error(`Error in /status: ${error.message}`);
      await ctx.reply(`❌ Ошибка при проверке статуса:\n${error.message}`);
    }
  }

  async onImagine(ctx: Context) {
    if (!ctx.message || !('text' in ctx.message)) {
      await ctx.reply('❌ Не удалось получить текст команды');
      return;
    }

    // Проверяем лимиты
    const canUse = await this.checkAndRecordUsage(ctx, 'imageGenerations');
    if (!canUse) {
      return;
    }

    const startTime = Date.now();
    const text = ctx.message.text;
    const prompt = text.replace('/imagine', '').trim();

    if (!prompt) {
      await ctx.reply(
        '🍌 **Nano Banana - Генерация изображений**\n\n' +
        'Использование: `/imagine [ваш промпт]`\n\n' +
        'Пример: `/imagine кот в космосе`',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const statusMessage = await ctx.reply('🍌 Генерирую изображение...');

    try {
      const aiStart = Date.now();
      const imageBuffer = await this.geminiService.generateImage(prompt);
      const aiTime = Date.now() - aiStart;

      await ctx.replyWithPhoto(
        { source: imageBuffer },
        {
          caption: 
            `🍌 *Nano Banana*\n\n` +
            `📝 Промпт: "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}"\n\n` +
            `⏱️ Время: ${aiTime}ms\n` +
            `💰 Стоимость: ~$0.039`,
          parse_mode: 'Markdown',
        }
      );

      if (ctx.chat) {
        await ctx.telegram.deleteMessage(ctx.chat.id, statusMessage.message_id);
      }

      this.logger.log(`⏱️ Image generation: AI=${aiTime}ms, Total=${Date.now() - startTime}ms`);
    } catch (error: any) {
      this.logger.error(`Error generating image: ${error.message}`);
      
      if (ctx.chat) {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          statusMessage.message_id,
          undefined,
          '❌ Ошибка при генерации изображения. Попробуй другой промпт или повтори позже.'
        );
      }
    }
  }

  async onPhoto(ctx: Context) {
    if (!ctx.message || !('photo' in ctx.message)) {
      return;
    }

    // Проверяем лимиты
    const canUse = await this.checkAndRecordUsage(ctx, 'imageGenerations');
    if (!canUse) {
      return;
    }

    const startTime = Date.now();
    
    const photos = ctx.message.photo;
    const largestPhoto = photos[photos.length - 1];
    const fileLink = await ctx.telegram.getFileLink(largestPhoto.file_id);
    
    const caption = 'caption' in ctx.message ? ctx.message.caption : undefined;

    if (!caption) {
      await ctx.reply('🖼️ Анализирую изображение...');

      try {
        const aiStart = Date.now();
        const analysis = await this.geminiService.analyzeImage(
          fileLink.href, 
          'Опиши это изображение подробно'
        );
        const aiTime = Date.now() - aiStart;
        
        const totalTime = Date.now() - startTime;
        
        await ctx.reply(
          `🤖 *Результат анализа:*\n\n${analysis}\n\n` +
          `⏱️ Время: ${aiTime}ms\n\n` +
          `💡 *Подсказка:* Отправь фото с подписью, чтобы отредактировать его через Nano Banana! 🍌`,
          { parse_mode: 'Markdown' }
        );
        
        this.logger.log(`⏱️ Photo analysis: AI=${aiTime}ms, Total=${totalTime}ms`);
      } catch (error: any) {
        this.logger.error(`Error analyzing photo: ${error.message}`);
        await ctx.reply('❌ Ошибка при анализе изображения');
      }
    } else {
      const statusMessage = await ctx.reply('🍌 Редактирую изображение...');

      try {
        const aiStart = Date.now();
        const editedImageBuffer = await this.geminiService.editImage(
          fileLink.href,
          caption
        );
        const aiTime = Date.now() - aiStart;

        await ctx.replyWithPhoto(
          { source: editedImageBuffer },
          {
            caption: 
              `🍌 *Nano Banana Edit*\n\n` +
              `📝 Инструкция: "${caption.substring(0, 100)}${caption.length > 100 ? '...' : ''}"\n\n` +
              `⏱️ Время: ${aiTime}ms\n` +
              `💰 Стоимость: ~$0.039`,
            parse_mode: 'Markdown',
          }
        );

        if (ctx.chat) {
          await ctx.telegram.deleteMessage(ctx.chat.id, statusMessage.message_id);
        }

        this.logger.log(`⏱️ Image editing: AI=${aiTime}ms, Total=${Date.now() - startTime}ms`);
      } catch (error: any) {
        this.logger.error(`Error editing image: ${error.message}`);
        
        if (ctx.chat) {
          await ctx.telegram.editMessageText(
            ctx.chat.id,
            statusMessage.message_id,
            undefined,
            '❌ Ошибка при редактировании изображения'
          );
        }
      }
    }
  }

  async onVoice(ctx: Context) {
    if (!ctx.message || !('voice' in ctx.message)) {
      return;
    }

    // Проверяем лимиты
    const canUse = await this.checkAndRecordUsage(ctx, 'voiceAnalysis');
    if (!canUse) {
      return;
    }

    const startTime = Date.now();
    await ctx.reply('🎤 Обрабатываю голосовое сообщение...');

    try {
      const voice = ctx.message.voice;
      const fileLink = await ctx.telegram.getFileLink(voice.file_id);
      
      const aiStart = Date.now();
      const transcription = await this.geminiService.analyzeAudio(fileLink.href);
      const aiTime = Date.now() - aiStart;
      
      const totalTime = Date.now() - startTime;
      
      await ctx.reply(
        `🎤 *Расшифровка:*\n\n${transcription}\n\n` +
        `⏱️ Время: ${aiTime}ms`,
        { parse_mode: 'Markdown' }
      );
      
      this.logger.log(`⏱️ Voice analysis: AI=${aiTime}ms, Total=${totalTime}ms`);
    } catch (error: any) {
      this.logger.error(`Error analyzing voice: ${error.message}`);
      await ctx.reply('❌ Ошибка при обработке голосового сообщения');
    }
  }

  async onAudio(ctx: Context) {
    if (!ctx.message || !('audio' in ctx.message)) {
      return;
    }

    // Проверяем лимиты
    const canUse = await this.checkAndRecordUsage(ctx, 'voiceAnalysis');
    if (!canUse) {
      return;
    }

    const startTime = Date.now();
    await ctx.reply('🎵 Анализирую аудио...');

    try {
      const audio = ctx.message.audio;
      const fileLink = await ctx.telegram.getFileLink(audio.file_id);
      
      const aiStart = Date.now();
      const analysis = await this.geminiService.analyzeAudio(fileLink.href);
      const aiTime = Date.now() - aiStart;
      
      const totalTime = Date.now() - startTime;
      
      await ctx.reply(
        `🎵 *Анализ аудио:*\n\n${analysis}\n\n` +
        `⏱️ Время: ${aiTime}ms`,
        { parse_mode: 'Markdown' }
      );
      
      this.logger.log(`⏱️ Audio analysis: AI=${aiTime}ms, Total=${totalTime}ms`);
    } catch (error: any) {
      this.logger.error(`Error analyzing audio: ${error.message}`);
      await ctx.reply('❌ Ошибка при анализе аудио');
    }
  }

  async onVideo(ctx: Context) {
    if (!ctx.message || !('video' in ctx.message)) {
      return;
    }

    // Проверяем лимиты
    const canUse = await this.checkAndRecordUsage(ctx, 'dailyGenerations');
    if (!canUse) {
      return;
    }

    const startTime = Date.now();
    await ctx.reply('🎬 Анализирую видео...');

    try {
      const video = ctx.message.video;
      const fileLink = await ctx.telegram.getFileLink(video.file_id);
      
      const caption = 'caption' in ctx.message ? ctx.message.caption : undefined;
      const prompt = caption || 'Опиши содержание этого видео';
      
      const aiStart = Date.now();
      const analysis = await this.geminiService.analyzeVideo(fileLink.href, prompt);
      const aiTime = Date.now() - aiStart;
      
      const totalTime = Date.now() - startTime;
      
      await ctx.reply(
        `🎬 *Анализ видео:*\n\n${analysis}\n\n` +
        `⏱️ Время: ${aiTime}ms`,
        { parse_mode: 'Markdown' }
      );
      
      this.logger.log(`⏱️ Video analysis: AI=${aiTime}ms, Total=${totalTime}ms`);
    } catch (error: any) {
      this.logger.error(`Error analyzing video: ${error.message}`);
      await ctx.reply('❌ Ошибка при анализе видео');
    }
  }

  async onText(ctx: Context) {
    if (!hasTextMessage(ctx)) {
      return;
    }

    const text = ctx.message.text;
    
    if (text.startsWith('/')) {
      return;
    }

    const startTime = Date.now();

    try {
      const dbStart = Date.now();
      await this.databaseService.saveMessage(ctx.from.id, text);
      const dbTime = Date.now() - dbStart;

      await ctx.reply(
        `✅ Сообщение сохранено!\n\n` +
        `📝 Текст: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"\n` +
        `⏱️ Время сохранения: ${dbTime}ms`
      );

      const totalTime = Date.now() - startTime;
      this.logger.log(`⏱️ Message processing: DB=${dbTime}ms, Total=${totalTime}ms`);
    } catch (error: any) {
      this.logger.error(`Error processing text message: ${error.message}`);
      await ctx.reply('Произошла ошибка при обработке сообщения.');
    }
  }
}