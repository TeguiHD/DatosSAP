import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AssignmentsService } from './assignments.service';

@Controller()
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Get('assignments/week')
  week(@Query('from') from?: string) {
    return this.assignments.week(from);
  }

  @Post('assignments')
  create(@Body() body: { workOrderId: string; personnelId?: string; userId?: string; startsAt?: string; endsAt?: string; notes?: string }) {
    return this.assignments.create(body);
  }

  @Patch('assignments/:id')
  update(@Param('id') id: string, @Body() body: { startsAt?: string; endsAt?: string; notes?: string }) {
    return this.assignments.update(id, body);
  }

  @Post('assignments/:id/release')
  release(@Param('id') id: string) {
    return this.assignments.release(id);
  }
}
