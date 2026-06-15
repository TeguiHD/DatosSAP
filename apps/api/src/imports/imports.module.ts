import { Module } from '@nestjs/common';
import { ImportProcessor } from './import.processor';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';

@Module({
  controllers: [ImportsController],
  providers: [ImportsService, ImportProcessor],
})
export class ImportsModule {}
