import { Controller, Get, Param } from '@nestjs/common';
import { PlantsService } from './plants.service';

@Controller('plants')
export class PlantsController {
  constructor(private readonly plants: PlantsService) {}

  @Get()
  list() {
    return this.plants.list();
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.plants.detail(id);
  }
}
