import { Controller, Get, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('audit')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('events')
  events(@Query('resource') resource?: string) {
    return this.prisma.auditEvent.findMany({
      where: resource ? { resource } : {},
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
