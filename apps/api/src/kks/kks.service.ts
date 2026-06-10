import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface TreeQuery {
  plantId?: string;
  q?: string;
}

@Injectable()
export class KksService {
  constructor(private readonly prisma: PrismaService) {}

  async tree(query: TreeQuery) {
    const search = query.q?.trim();
    const where: Prisma.AssetKksNodeWhereInput = {};
    if (query.plantId) {
      where.plantId = query.plantId;
    }
    if (search) {
      where.OR = [
        { technicalObject: { contains: search, mode: 'insensitive' } },
        { kksDescription: { contains: search, mode: 'insensitive' } },
        { equipmentDescription: { contains: search, mode: 'insensitive' } },
        { equipmentCode: { contains: search, mode: 'insensitive' } },
      ];
    } else {
      where.parentId = null;
    }
    return this.prisma.assetKksNode.findMany({
      where,
      include: {
        plant: { include: { client: true } },
        children: { take: 25, orderBy: { technicalObject: 'asc' } },
      },
      orderBy: { technicalObject: 'asc' },
      take: 100,
    });
  }

  async history(id: string) {
    return this.prisma.workOrder.findMany({
      where: { assetNodeId: id },
      include: {
        plant: { include: { client: true } },
        evidenceFiles: true,
        hhEntries: true,
      },
      orderBy: { plannedStart: 'desc' },
      take: 50,
    });
  }
}
