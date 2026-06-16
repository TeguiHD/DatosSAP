import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { RequestWithUser } from '../access/plant-access.service';
import { WorkOrdersService } from './work-orders.service';

interface CreateWorkOrderBody {
  plantId: string;
  title: string;
  assetNodeId?: string;
  description?: string;
  plannedHours?: number;
}

@Controller('work-orders')
export class WorkOrdersController {
  constructor(private readonly workOrders: WorkOrdersService) {}

  @Get()
  list(@Query() query: Record<string, string | undefined>, @Req() request: RequestWithUser) {
    return this.workOrders.list(query, request.user);
  }

  @Post()
  create(@Body() body: CreateWorkOrderBody) {
    return this.workOrders.create(body);
  }

  @Get(':id')
  detail(@Param('id') id: string, @Req() request: RequestWithUser) {
    return this.workOrders.detail(id, request.user);
  }

  @Get(':id/audit-timeline')
  timeline(@Param('id') id: string, @Req() request: RequestWithUser) {
    return this.workOrders.timeline(id, request.user);
  }

  @Get(':id/milestones')
  milestones(@Param('id') id: string, @Req() request: RequestWithUser) {
    return this.workOrders.milestones(id, request.user);
  }

  @Get(':id/comments')
  comments(@Param('id') id: string, @Query() query: Record<string, string | undefined>, @Req() request: RequestWithUser) {
    return this.workOrders.comments(id, query, request.user);
  }

  @Post(':id/assign')
  assign(@Param('id') id: string, @Body() body: { userId?: string; personnelId?: string }) {
    return this.workOrders.assign(id, body);
  }

  @Post(':id/start')
  start(@Param('id') id: string) {
    return this.workOrders.start(id);
  }

  @Post(':id/hh')
  registerHours(@Param('id') id: string, @Body() body: { hours: number; notes?: string; userId?: string }) {
    return this.workOrders.registerHours(id, body);
  }

  @Post(':id/evidence')
  evidence(
    @Param('id') id: string,
    @Body() body: { fileName: string; storageKey: string; checksum: string; mimeType?: string; sizeBytes?: number },
  ) {
    return this.workOrders.attachEvidence(id, body);
  }

  @Post(':id/complete')
  complete(@Param('id') id: string) {
    return this.workOrders.complete(id);
  }

  @Post(':id/approve')
  approve(@Param('id') id: string) {
    return this.workOrders.approve(id);
  }

  @Post(':id/reject')
  reject(@Param('id') id: string) {
    return this.workOrders.reject(id);
  }

  @Post(':id/reopen')
  reopen(@Param('id') id: string) {
    return this.workOrders.reopen(id);
  }

  @Post(':id/sign')
  sign(@Param('id') id: string) {
    return this.workOrders.sign(id);
  }
}
