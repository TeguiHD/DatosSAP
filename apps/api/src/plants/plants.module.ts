import { Module } from '@nestjs/common';
import { KpiModule } from '../kpi/kpi.module';
import { PlantsController } from './plants.controller';
import { PlantsService } from './plants.service';

@Module({
  imports: [KpiModule],
  controllers: [PlantsController],
  providers: [PlantsService],
})
export class PlantsModule {}
