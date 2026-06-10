import { Controller, Get, Query } from '@nestjs/common';
import { PlanningService } from './planning.service';

@Controller('planning')
export class PlanningController {
  constructor(private readonly planning: PlanningService) {}

  @Get('month')
  month(@Query('year') year?: string, @Query('month') month?: string, @Query('plantId') plantId?: string) {
    return this.planning.month({
      year: Number(year ?? new Date().getFullYear()),
      month: Number(month ?? new Date().getMonth() + 1),
      ...(plantId ? { plantId } : {}),
    });
  }

  @Get('list')
  list(@Query('from') from?: string, @Query('to') to?: string, @Query('plantId') plantId?: string) {
    return this.planning.list({
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(plantId ? { plantId } : {}),
    });
  }

  @Get('gantt')
  gantt(@Query('from') from?: string, @Query('to') to?: string, @Query('groupBy') groupBy?: string) {
    return this.planning.gantt({
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(groupBy ? { groupBy } : {}),
    });
  }
}
