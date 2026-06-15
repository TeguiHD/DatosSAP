import {
  Body,
  Controller,
  Get,
  HttpCode,
  MessageEvent,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Sse,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { interval, map, Observable, startWith, switchMap, takeWhile } from 'rxjs';
import { IssueSeverity, Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { ImportsService, type UploadedImportFile } from './imports.service';
import { ResolveIssueDto } from './dto/resolve-issue.dto';
import { UploadFileDto } from './dto/upload-file.dto';

interface RequestWithUser {
  user?: {
    userId?: string;
    orgId?: string | null;
  };
}

@Roles(Role.SUPERADMIN, Role.ADMIN)
@Controller('import/jobs')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  create(
    @UploadedFile() file: UploadedImportFile | undefined,
    @Body() body: UploadFileDto,
    @Req() request: RequestWithUser,
  ) {
    return this.imports.create({
      ...(body.originalName ? { originalName: body.originalName } : {}),
      ...(body.fileType ? { fileType: body.fileType } : {}),
      ...(body.storageKey ? { storageKey: body.storageKey } : {}),
      ...(file ? { file } : {}),
      ...(request.user?.userId ? { uploadedById: request.user.userId } : {}),
    });
  }

  @Get()
  list(
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('pageSize', new ParseIntPipe({ optional: true })) pageSize = 10,
  ) {
    return this.imports.list({ page, pageSize });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.imports.get(id);
  }

  @Get(':id/issues')
  issues(
    @Param('id') id: string,
    @Query('severity') severity?: IssueSeverity,
    @Query('resolved') resolved?: string,
  ) {
    return this.imports.listIssues(id, {
      ...(severity ? { severity } : {}),
      ...(resolved === undefined ? {} : { resolved: resolved === 'true' }),
    });
  }

  @Get(':id/preview')
  preview(@Param('id') id: string) {
    return this.imports.preview(id);
  }

  @Post(':id/dry-run')
  @HttpCode(200)
  dryRun(@Param('id') id: string, @Req() request: RequestWithUser) {
    return this.imports.enqueue(id, 'dry-run', request.user?.userId);
  }

  @Sse(':id/progress')
  progress(@Param('id') id: string): Observable<MessageEvent> {
    return interval(2_000).pipe(
      startWith(0),
      switchMap(() => this.imports.progress(id)),
      map((data) => ({ data }) satisfies MessageEvent),
      takeWhile((event) => !this.imports.isTerminalProgress(event.data), true),
    );
  }

  @Post(':id/resolve-issue')
  @HttpCode(200)
  resolveIssue(
    @Param('id') id: string,
    @Body() body: ResolveIssueDto,
    @Req() request: RequestWithUser,
  ) {
    const resolution = body.resolution ?? body;
    return this.imports.resolveIssue(id, body.issueId, resolution, request.user?.userId);
  }

  @Post(':id/apply')
  @HttpCode(200)
  apply(@Param('id') id: string, @Req() request: RequestWithUser) {
    return this.imports.enqueue(id, 'apply', request.user?.userId);
  }
}
