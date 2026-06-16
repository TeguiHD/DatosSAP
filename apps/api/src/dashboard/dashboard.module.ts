import { Module } from '@nestjs/common';
import { KpiModule } from '../kpi/kpi.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [KpiModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
