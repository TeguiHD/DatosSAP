import { Controller, Get, Param, Query } from '@nestjs/common';
import { KksService } from './kks.service';

@Controller()
export class KksController {
  constructor(private readonly kks: KksService) {}

  @Get('kks/tree')
  tree(@Query('plantId') plantId?: string, @Query('q') q?: string) {
    return this.kks.tree({
      ...(plantId ? { plantId } : {}),
      ...(q ? { q } : {}),
    });
  }

  @Get('assets/:id/work-history')
  history(@Param('id') id: string) {
    return this.kks.history(id);
  }
}
