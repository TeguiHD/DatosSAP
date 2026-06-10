import { Controller, Get, Header, Query } from '@nestjs/common';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('executive')
  executive(@Query('plantId') plantId?: string) {
    return this.reports.executive({ ...(plantId ? { plantId } : {}) });
  }

  @Get('export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  exportCsv(@Query('plantId') plantId?: string) {
    return this.reports.exportCsv({ ...(plantId ? { plantId } : {}) });
  }
}
