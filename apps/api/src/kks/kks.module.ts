import { Module } from '@nestjs/common';
import { KksController } from './kks.controller';
import { KksService } from './kks.service';

@Module({
  controllers: [KksController],
  providers: [KksService],
})
export class KksModule {}
