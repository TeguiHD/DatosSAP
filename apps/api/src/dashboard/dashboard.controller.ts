import { Controller, Get, Req } from '@nestjs/common';
import { RequestWithUser } from '../access/plant-access.service';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('kpi-summary')
  kpiSummary(@Req() request: RequestWithUser) {
    return this.dashboard.kpiSummary(request.user);
  }
}
