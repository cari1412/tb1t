import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { INestApplication } from '@nestjs/common';
import { GeoService } from '../src/utils/geo.service';
import { DatabaseService } from '../src/database/database.service';

let app: INestApplication;

async function getApp() {
  if (!app) {
    app = await NestFactory.create(AppModule, {
      logger: ['error', 'warn', 'log'],
    });
    await app.init();
  }
  return app;
}

export default async function handler(req: any, res: any) {
  try {
    const application = await getApp();
    const geoService = application.get(GeoService);

    // Извлекаем реальный IP
    const realIP = geoService.extractRealIP(req.headers);
    const isCanadian = geoService.isRussianIP(realIP); // переименовал для ясности

    console.log(`📍 IP: ${realIP}, Canadian: ${isCanadian}`);

    // 🇨🇦 Если траффик из Канады - проксируем на VPS (ДЛЯ ТЕСТА)
    if (isCanadian) {
      const VPS_URL = process.env.VPS_WEBHOOK_URL;
      
      if (!VPS_URL) {
        console.error('❌ VPS_WEBHOOK_URL not configured');
        return res.status(500).json({ 
          ok: false, 
          error: 'VPS_WEBHOOK_URL not configured' 
        });
      }

      console.log(`🔄 Proxying to VPS: ${VPS_URL}`);

      const response = await fetch(VPS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': realIP || 'unknown',
        },
        body: JSON.stringify(req.body),
      });

      const data = await response.json();
      return res.status(response.status).json(data);
    }

    // Иначе обрабатываем через Supabase локально
    console.log(`✅ Processing with Supabase`);
    
    const databaseService = application.get(DatabaseService);
    const update = req.body;
    
    if (update.message) {
      const { from, text } = update.message;
      
      await databaseService.saveUser(
        from.id,
        from.username || '',
        from.first_name || '',
      );

      if (text) {
        await databaseService.saveMessage(from.id, text);
      }
    }

    return res.status(200).json({ ok: true });
    
  } catch (error: any) {
    console.error('❌ Error:', error);
    return res.status(500).json({ 
      ok: false, 
      error: error.message 
    });
  }
}