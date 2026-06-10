import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ImportFileType } from '@prisma/client';
import { ImportsService } from './imports.service';

interface CreateImportJobBody {
  originalName: string;
  fileType: ImportFileType;
  storageKey?: string;
}

@Controller('import/jobs')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Post()
  create(@Body() body: CreateImportJobBody) {
    return this.imports.create(body);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.imports.get(id);
  }

  @Post(':id/dry-run')
  dryRun(@Param('id') id: string) {
    return this.imports.markDryRun(id);
  }

  @Post(':id/resolve-issue')
  resolveIssue(@Param('id') id: string, @Body() body: { issueId: string; resolution: unknown }) {
    return this.imports.resolveIssue(id, body.issueId, body.resolution);
  }

  @Post(':id/apply')
  apply(@Param('id') id: string) {
    return this.imports.apply(id);
  }
}
