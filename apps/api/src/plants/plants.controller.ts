import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { RequestWithUser } from '../access/plant-access.service';
import { PlantsService } from './plants.service';

@Controller('plants')
export class PlantsController {
  constructor(private readonly plants: PlantsService) {}

  @Get()
  list(@Query() query: Record<string, string | undefined>, @Req() request: RequestWithUser) {
    return this.plants.list(query, request.user);
  }

  @Get(':id/summary')
  summary(@Param('id') id: string, @Req() request: RequestWithUser) {
    return this.plants.summary(id, request.user);
  }

  @Get(':id/maintenance')
  maintenance(@Param('id') id: string, @Query() query: Record<string, string | undefined>, @Req() request: RequestWithUser) {
    return this.plants.maintenance(id, query, request.user);
  }

  @Get(':id/recertifications')
  recertifications(@Param('id') id: string, @Req() request: RequestWithUser) {
    return this.plants.recertifications(id, request.user);
  }

  @Get(':id')
  detail(@Param('id') id: string, @Req() request: RequestWithUser) {
    return this.plants.detail(id, request.user);
  }
}
