import { Telegraf } from 'telegraf';
import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('=== Webhook received ===');
  console.log('Method:', req.method);
  console.log('Body:', JSON.stringify(req.body));
  
  if (req.method !== 'POST') {
    return res.status(200).json({ status: 'ok' });
  }

  try {
    // Получаем переменные окружения
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;
    
    if (!token || !supabaseUrl || !supabaseKey) {
      throw new Error('Missing environment variables');
    }
    
    console.log('Environment variables loaded');
    
    // Создаем бота
    const bot = new Telegraf(token);
    
    // Создаем клиент Supabase
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Обработчик команды /start
    bot.start(async (ctx) => {
      if (!ctx.from) return;
      
      const telegramId = ctx.from.id;
      const username = ctx.from.username || '';
      const firstName = ctx.from.first_name || 'Пользователь';
      
      console.log('Start command from:', telegramId, username, firstName);
      
      // Сохраняем пользователя в Supabase
      try {
        const { data, error } = await supabase
          .from('users')
          .upsert({
            telegram_id: telegramId,
            username: username,
            first_name: firstName,
            last_seen: new Date().toISOString(),
          })
          .select();
        
        if (error) {
          console.error('Supabase error:', error);
        } else {
          console.log('User saved:', data);
        }
      } catch (err) {
        console.error('Error saving user:', err);
      }
      
      await ctx.reply(
        `Привет, ${firstName}! 👋\n\n` +
        `Добро пожаловать в бота!\n` +
        `Используй /help для списка команд.`
      );
    });
    
    // Обработчик команды /help
    bot.help(async (ctx) => {
      await ctx.reply(
        `📋 Доступные команды:\n\n` +
        `/start - Начать работу с ботом\n` +
        `/help - Показать это сообщение\n` +
        `/profile - Показать ваш профиль`
      );
    });
    
    // Обработчик команды /profile
    bot.command('profile', async (ctx) => {
      if (!ctx.from) {
        await ctx.reply('Не удалось получить информацию о пользователе');
        return;
      }
      
      const telegramId = ctx.from.id;
      
      try {
        const { data: user, error } = await supabase
          .from('users')
          .select('*')
          .eq('telegram_id', telegramId)
          .single();
        
        if (error || !user) {
          await ctx.reply('Пользователь не найден. Используйте /start');
          return;
        }
        
        await ctx.reply(
          `👤 Ваш профиль:\n\n` +
          `ID: ${user.telegram_id}\n` +
          `Username: @${user.username || 'не указан'}\n` +
          `Имя: ${user.first_name}\n` +
          `Последний визит: ${new Date(user.last_seen).toLocaleString('ru-RU')}`
        );
      } catch (err) {
        console.error('Error fetching profile:', err);
        await ctx.reply('Произошла ошибка при получении профиля.');
      }
    });
    
    // Обработчик текстовых сообщений
    bot.on('text', async (ctx) => {
      if (!ctx.message || !('text' in ctx.message) || !ctx.from) return;
      
      const text = ctx.message.text;
      const telegramId = ctx.from.id;
      
      // Игнорируем команды
      if (text.startsWith('/')) return;
      
      console.log('Text message from:', telegramId, text);
      
      // Сохраняем сообщение
      try {
        const { error } = await supabase
          .from('messages')
          .insert({
            telegram_id: telegramId,
            message: text,
            created_at: new Date().toISOString(),
          });
        
        if (error) {
          console.error('Error saving message:', error);
        }
      } catch (err) {
        console.error('Error:', err);
      }
      
      await ctx.reply(`Вы написали: ${text}`);
    });
    
    // Обрабатываем update
    await bot.handleUpdate(req.body as any);
    
    console.log('Update processed successfully');
    return res.status(200).json({ ok: true });
    
  } catch (error: any) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    // Всегда возвращаем 200 для Telegram
    return res.status(200).json({ ok: true });
  }
}