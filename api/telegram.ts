import { Telegraf } from 'telegraf';
import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Создаем бота один раз для переиспользования
let bot: Telegraf | null = null;
let supabase: any = null;

function initBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;
  
  console.log('=== Checking environment variables ===');
  console.log('TELEGRAM_BOT_TOKEN exists:', !!token);
  console.log('SUPABASE_URL:', supabaseUrl);
  console.log('SUPABASE_KEY exists:', !!supabaseKey);
  console.log('SUPABASE_KEY starts with:', supabaseKey?.substring(0, 20) + '...');
  
  if (!token || !supabaseUrl || !supabaseKey) {
    throw new Error('Missing environment variables');
  }
  
  // Создаем бота только если его еще нет
  if (!bot) {
    bot = new Telegraf(token);
    
    // Создаем клиент Supabase с дополнительными опциями
    supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      }
    });
    
    console.log('Supabase client created');
    
    // Обработчик команды /start
    bot.start(async (ctx) => {
      if (!ctx.from) {
        console.error('No ctx.from in start command');
        return;
      }
      
      const telegramId = ctx.from.id;
      const username = ctx.from.username || '';
      const firstName = ctx.from.first_name || 'Пользователь';
      
      console.log('=== Start command ===');
      console.log('Telegram ID:', telegramId);
      console.log('Username:', username);
      console.log('First name:', firstName);
      
      // Сохраняем пользователя в Supabase
      try {
        console.log('Attempting to upsert user...');
        
        const { data, error } = await supabase
          .from('users')
          .upsert({
            telegram_id: telegramId,
            username: username,
            first_name: firstName,
            last_seen: new Date().toISOString(),
          }, {
            onConflict: 'telegram_id'
          })
          .select();
        
        if (error) {
          console.error('❌ Supabase upsert error:', JSON.stringify(error, null, 2));
          console.error('Error code:', error.code);
          console.error('Error message:', error.message);
          console.error('Error details:', error.details);
          console.error('Error hint:', error.hint);
          
          // Пробуем простой insert
          console.log('Trying simple insert instead...');
          const { data: insertData, error: insertError } = await supabase
            .from('users')
            .insert({
              telegram_id: telegramId,
              username: username,
              first_name: firstName,
              last_seen: new Date().toISOString(),
            })
            .select();
          
          if (insertError) {
            console.error('❌ Insert also failed:', JSON.stringify(insertError, null, 2));
          } else {
            console.log('✅ Insert successful:', insertData);
          }
        } else {
          console.log('✅ User saved successfully:', data);
        }
      } catch (err: any) {
        console.error('❌ Exception saving user:', err.message);
        console.error('Stack:', err.stack);
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
        `/profile - Показать ваш профиль\n` +
        `/test - Проверить подключение к БД`
      );
    });
    
    // Тестовая команда для проверки БД
    bot.command('test', async (ctx) => {
      try {
        console.log('=== Testing database connection ===');
        
        // Пробуем прочитать данные
        const { data, error, count } = await supabase
          .from('users')
          .select('*', { count: 'exact' });
        
        if (error) {
          console.error('DB test error:', error);
          await ctx.reply(`❌ Ошибка БД: ${error.message}`);
        } else {
          console.log('DB test success. Users count:', count);
          await ctx.reply(`✅ БД работает!\nПользователей в базе: ${count || 0}`);
        }
      } catch (err: any) {
        console.error('DB test exception:', err);
        await ctx.reply(`❌ Исключение: ${err.message}`);
      }
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
        
        if (error) {
          console.error('Profile error:', error);
          await ctx.reply(`Ошибка: ${error.message}\n\nИспользуйте /start`);
          return;
        }
        
        if (!user) {
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
      } catch (err: any) {
        console.error('Error fetching profile:', err);
        await ctx.reply(`Произошла ошибка: ${err.message}`);
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
        } else {
          console.log('Message saved successfully');
        }
      } catch (err) {
        console.error('Error:', err);
      }
      
      await ctx.reply(`Вы написали: ${text}`);
    });
    
    console.log('✅ Bot initialized successfully');
  }
  
  return { bot, supabase };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('=== Webhook received ===');
  console.log('Method:', req.method);
  console.log('Timestamp:', new Date().toISOString());
  
  // Важно: Telegram всегда отправляет POST запросы
  if (req.method !== 'POST') {
    console.log('Not a POST request, returning 200');
    return res.status(200).json({ ok: true });
  }

  try {
    // Инициализируем бота
    const { bot: telegramBot } = initBot();
    
    if (!telegramBot) {
      throw new Error('Failed to initialize bot');
    }
    
    // Проверяем что body существует
    if (!req.body || typeof req.body !== 'object') {
      console.error('Invalid body:', req.body);
      return res.status(200).json({ ok: true });
    }
    
    console.log('Processing update:', JSON.stringify(req.body));
    
    // Обрабатываем update от Telegram
    await telegramBot.handleUpdate(req.body);
    
    console.log('✅ Update processed successfully');
    
    // ВАЖНО: Всегда возвращаем 200 для Telegram
    return res.status(200).json({ ok: true });
    
  } catch (error: any) {
    console.error('❌ Error processing update:', error.message);
    console.error('Stack:', error.stack);
    
    // ВАЖНО: Даже при ошибке возвращаем 200, чтобы Telegram не помечал webhook как неработающий
    return res.status(200).json({ ok: true });
  }
}