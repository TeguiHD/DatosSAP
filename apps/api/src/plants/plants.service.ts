import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PlantsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return this.prisma.plant.findMany({
      orderBy: [{ healthScore: 'asc' }, { name: 'asc' }],
      include: { client: true },
      take: 100,
    });
  }

  async detail(id: string) {
    const plant = await this.prisma.plant.findUnique({
      where: { id },
      include: {
        client: true,
        aliases: true,
        recertifications: { orderBy: { dueDate: 'asc' } },
        _count: {
          select: {
            assetNodes: true,
            occurrences: true,
            workOrders: true,
          },
        },
      },
    });
    if (!plant) {
      throw new NotFoundException('Plant not found');
    }
    return plant;
  }
}
