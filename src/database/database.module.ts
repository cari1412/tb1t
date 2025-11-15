import { Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { GeoService } from '../utils/geo.service';

@Module({
  providers: [DatabaseService, GeoService],
  exports: [DatabaseService, GeoService],
})
export class DatabaseModule {}