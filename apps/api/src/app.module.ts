import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AccessModule } from './access/access.module';
import { AssignmentsModule } from './assignments/assignments.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RbacGuard } from './auth/guards/rbac.guard';
import { DashboardModule } from './dashboard/dashboard.module';
import { HealthModule } from './health/health.module';
import { ImportsModule } from './imports/imports.module';
import { KksModule } from './kks/kks.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PlanningModule } from './planning/planning.module';
import { PlantsModule } from './plants/plants.module';
import { PrismaModule } from './prisma/prisma.module';
import { RbacModule } from './rbac/rbac.module';
import { ReportsModule } from './reports/reports.module';
import { WorkOrdersModule } from './work-orders/work-orders.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 120,
      },
    ]),
    PrismaModule,
    AccessModule,
    AuthModule,
    HealthModule,
    DashboardModule,
    PlantsModule,
    KksModule,
    ImportsModule,
    PlanningModule,
    WorkOrdersModule,
    AssignmentsModule,
    ReportsModule,
    AuditModule,
    NotificationsModule,
    RbacModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RbacGuard,
    },
  ],
})
export class AppModule {}
