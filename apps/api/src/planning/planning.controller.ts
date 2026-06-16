import { Controller, Get, Query, Req } from '@nestjs/common';
import { RequestWithUser } from '../access/plant-access.service';
import { PlanningService } from './planning.service';

@Controller('planning')
export class PlanningController {
  constructor(private readonly planning: PlanningService) {}

  @Get()
  operational(@Query() query: Record<string, string | undefined>, @Req() request: RequestWithUser) {
    return this.planning.operational(query, request.user);
  }

  @Get('month')
  month(@Query() query: Record<string, string | undefined>, @Req() request: RequestWithUser) {
    return this.planning.month(query, request.user);
  }

  @Get('list')
  list(@Query() query: Record<string, string | undefined>, @Req() request: RequestWithUser) {
    return this.planning.legacyList(query, request.user);
  }

  @Get('gantt')
  gantt(@Query() query: Record<string, string | undefined>, @Req() request: RequestWithUser) {
    return this.planning.legacyGantt(query, request.user);
  }
}
