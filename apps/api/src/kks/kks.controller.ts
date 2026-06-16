import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { RequestWithUser } from '../access/plant-access.service';
import { KksService } from './kks.service';

@Controller()
export class KksController {
  constructor(private readonly kks: KksService) {}

  @Get('assets/tree')
  assetsTree(@Query() query: Record<string, string | undefined>, @Req() request: RequestWithUser) {
    return this.kks.tree(query, request.user, true);
  }

  @Get('assets/search')
  search(@Query() query: Record<string, string | undefined>, @Req() request: RequestWithUser) {
    return this.kks.search(query, request.user);
  }

  @Get('assets/:id/work-history')
  history(@Param('id') id: string, @Query() query: Record<string, string | undefined>, @Req() request: RequestWithUser) {
    return this.kks.history(id, query, request.user);
  }

  @Get('assets/:id')
  detail(@Param('id') id: string, @Req() request: RequestWithUser) {
    return this.kks.detail(id, request.user);
  }

  @Get('kks/tree')
  legacyTree(@Query() query: Record<string, string | undefined>, @Req() request: RequestWithUser) {
    return this.kks.tree(query, request.user, false);
  }
}
