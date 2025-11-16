import { Injectable, Logger } from '@nestjs/common';
import * as geoip from 'geoip-lite';

@Injectable()
export class GeoService {
  private readonly logger = new Logger(GeoService.name);

  /**
   * Проверяет, является ли IP адрес канадским (ДЛЯ ТЕСТА)
   */
  isRussianIP(ip: string | null): boolean {
    if (!ip || ip === '127.0.0.1' || ip === 'localhost') {
      this.logger.warn('Local IP detected, defaulting to Supabase');
      return false;
    }

    const geo = geoip.lookup(ip);
    
    if (!geo) {
      this.logger.warn(`Could not determine location for IP: ${ip}`);
      return false; // по умолчанию используем Supabase
    }

    // 🇨🇦 ВРЕМЕННО: Канада → VPS (для теста)
    const isCanadian = geo.country === 'CA';
    this.logger.log(`IP: ${ip}, Country: ${geo.country}, Routing to: ${isCanadian ? 'VPS' : 'Supabase'}`);
    
    return isCanadian;
  }

  /**
   * Извлекает реальный IP из заголовков запроса (для Vercel)
   */
  extractRealIP(headers: any): string | null {
    // Vercel передает реальный IP в заголовке x-real-ip или x-forwarded-for
    const xForwardedFor = headers['x-forwarded-for'];
    const xRealIp = headers['x-real-ip'];
    
    if (xRealIp) {
      return xRealIp;
    }
    
    if (xForwardedFor) {
      // x-forwarded-for может содержать несколько IP через запятую
      const ips = xForwardedFor.split(',');
      return ips[0].trim();
    }
    
    return null;
  }
}