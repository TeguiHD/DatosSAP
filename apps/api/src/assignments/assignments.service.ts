import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AssignmentStatus, Prisma, WorkOrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AssignmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async week(from?: string) {
    const start = from ? new Date(from) : this.startOfWeek(new Date());
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);

    const [personnel, assignments] = await Promise.all([
      this.prisma.personnel.findMany({
        include: { primarySpecialty: true },
        orderBy: { name: 'asc' },
        take: 200,
      }),
      this.prisma.assignment.findMany({
        where: {
          status: AssignmentStatus.ACTIVE,
          OR: [{ startsAt: null }, { startsAt: { lt: end } }],
        },
        include: {
          personnel: { include: { primarySpecialty: true } },
          user: true,
          workOrder: { include: { plant: true, hhEntries: true } },
        },
        take: 500,
      }),
    ]);

    const rows = personnel.map((person) => {
      const personAssignments = assignments.filter((assignment) => assignment.personnelId === person.id);
      const plannedHours = personAssignments.reduce((sum, assignment) => sum + (assignment.workOrder.plannedHours ?? 0), 0);
      const load = person.weeklyCapacityHours > 0 ? Math.round((plannedHours / person.weeklyCapacityHours) * 100) : 0;
      return {
        personnel: person,
        plannedHours,
        capacityHours: person.weeklyCapacityHours,
        load,
        overloaded: load > 90,
        assignments: personAssignments,
      };
    });

    return { from: start.toISOString(), to: end.toISOString(), rows };
  }

  async create(input: { workOrderId: string; personnelId?: string; userId?: string; startsAt?: string; endsAt?: string; notes?: string }) {
    if (!input.personnelId && !input.userId) {
      throw new BadRequestException('Assignment requires personnelId or userId');
    }
    await this.validateSpecialty(input.workOrderId, input.personnelId);
    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.assignment.create({
        data: {
          workOrderId: input.workOrderId,
          ...(input.personnelId ? { personnelId: input.personnelId } : {}),
          ...(input.userId ? { userId: input.userId } : {}),
          ...(input.startsAt ? { startsAt: new Date(input.startsAt) } : {}),
          ...(input.endsAt ? { endsAt: new Date(input.endsAt) } : {}),
          ...(input.notes ? { notes: input.notes } : {}),
        },
      });
      await tx.workOrder.update({
        where: { id: input.workOrderId },
        data: { status: WorkOrderStatus.ASSIGNED, ...(input.userId ? { assignedUserId: input.userId } : {}) },
      });
      await tx.auditEvent.create({
        data: {
          resource: 'assignment',
          resourceId: assignment.id,
          action: 'created',
          after: this.asJson(assignment),
        },
      });
      return assignment;
    });
  }

  async update(id: string, input: { startsAt?: string; endsAt?: string; notes?: string }) {
    const before = await this.prisma.assignment.findUnique({ where: { id } });
    if (!before) {
      throw new NotFoundException('Assignment not found');
    }
    const after = await this.prisma.assignment.update({
      where: { id },
      data: {
        ...(input.startsAt ? { startsAt: new Date(input.startsAt) } : {}),
        ...(input.endsAt ? { endsAt: new Date(input.endsAt) } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
    });
    await this.prisma.auditEvent.create({
      data: {
        resource: 'assignment',
        resourceId: id,
        action: 'updated',
        before: this.asJson(before),
        after: this.asJson(after),
      },
    });
    return after;
  }

  async release(id: string) {
    const before = await this.prisma.assignment.findUnique({ where: { id } });
    if (!before) {
      throw new NotFoundException('Assignment not found');
    }
    const after = await this.prisma.assignment.update({ where: { id }, data: { status: AssignmentStatus.RELEASED } });
    await this.prisma.auditEvent.create({
      data: {
        resource: 'assignment',
        resourceId: id,
        action: 'released',
        before: this.asJson(before),
        after: this.asJson(after),
      },
    });
    return after;
  }

  private async validateSpecialty(workOrderId: string, personnelId?: string) {
    if (!personnelId) {
      return;
    }
    const workOrder = await this.prisma.workOrder.findUnique({
      where: { id: workOrderId },
      include: { occurrence: { include: { template: true } } },
    });
    const requiredSpecialtyId = workOrder?.occurrence?.template.requiredSpecialtyId;
    if (!requiredSpecialtyId) {
      return;
    }
    const personnel = await this.prisma.personnel.findUnique({ where: { id: personnelId } });
    if (personnel?.primarySpecialtyId !== requiredSpecialtyId) {
      throw new BadRequestException('Personnel specialty does not match the work order requirement');
    }
  }

  private startOfWeek(date: Date) {
    const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const day = result.getUTCDay() || 7;
    result.setUTCDate(result.getUTCDate() - day + 1);
    return result;
  }

  private asJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
