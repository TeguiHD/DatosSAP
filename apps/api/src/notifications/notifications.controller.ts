import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { NotificationSeverity } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Controller()
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('notifications/events')
  events(@Query('severity') severity?: NotificationSeverity) {
    return this.prisma.notificationEvent.findMany({
      where: severity ? { severity } : {},
      include: { plant: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  @Post('notifications/events/:id/dispatch')
  async dispatch(@Param('id') id: string) {
    const event = await this.prisma.notificationEvent.update({
      where: { id },
      data: { dispatchedAt: new Date() },
    });
    return { id: event.id, dispatched: true, dispatchedAt: event.dispatchedAt };
  }

  @Get('users/:id/notification-preferences')
  async preferences(@Param('id') id: string) {
    return (
      (await this.prisma.notificationPreference.findUnique({ where: { userId: id } })) ?? {
        userId: id,
        pushEnabled: false,
        minimumSeverity: NotificationSeverity.WARNING,
        quietHoursStart: null,
        quietHoursEnd: null,
      }
    );
  }

  @Patch('users/:id/notification-preferences')
  updatePreferences(
    @Param('id') id: string,
    @Body()
    body: {
      pushEnabled?: boolean;
      minimumSeverity?: NotificationSeverity;
      quietHoursStart?: string | null;
      quietHoursEnd?: string | null;
    },
  ) {
    return this.prisma.notificationPreference.upsert({
      where: { userId: id },
      update: body,
      create: {
        userId: id,
        pushEnabled: body.pushEnabled ?? false,
        minimumSeverity: body.minimumSeverity ?? NotificationSeverity.WARNING,
        quietHoursStart: body.quietHoursStart ?? null,
        quietHoursEnd: body.quietHoursEnd ?? null,
      },
    });
  }
}
