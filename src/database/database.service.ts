import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class DatabaseService implements OnModuleInit {
  private supabase: SupabaseClient;
  private readonly logger = new Logger(DatabaseService.name);

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const supabaseUrl = this.configService.get<string>('supabase.url');
    const supabaseKey = this.configService.get<string>('supabase.key');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase URL and KEY must be provided');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.logger.log('✅ Supabase client initialized');
  }

  getClient(): SupabaseClient {
    return this.supabase;
  }

  async saveUser(telegramId: number, username: string, firstName: string) {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .upsert({
          telegram_id: telegramId,
          username: username,
          first_name: firstName,
          last_seen: new Date().toISOString(),
        })
        .select();

      if (error) throw error;
      this.logger.log(`✅ User saved: ${telegramId}`);
      return data;
    } catch (error: any) {
      this.logger.error(`❌ Error saving user: ${error.message}`);
      throw error;
    }
  }

  async getUser(telegramId: number) {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('*')
        .eq('telegram_id', telegramId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data;
    } catch (error: any) {
      this.logger.error(`❌ Error getting user: ${error.message}`);
      throw error;
    }
  }

  async saveMessage(telegramId: number, message: string) {
    try {
      const { data, error } = await this.supabase
        .from('messages')
        .insert({
          telegram_id: telegramId,
          message: message,
          created_at: new Date().toISOString(),
        })
        .select();

      if (error) throw error;
      this.logger.log(`✅ Message saved from: ${telegramId}`);
      return data;
    } catch (error: any) {
      this.logger.error(`❌ Error saving message: ${error.message}`);
      throw error;
    }
  }
}