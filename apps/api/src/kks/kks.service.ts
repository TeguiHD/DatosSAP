import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AssetNodeType, Prisma, WorkOrderStatus } from '@prisma/client';
import { AuthenticatedRequestUser, PlantAccessService } from '../access/plant-access.service';
import { normalizePagination, paginated } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';

const TERMINAL_WORK_ORDER_STATUSES: WorkOrderStatus[] = [
  WorkOrderStatus.COMPLETED,
  WorkOrderStatus.CLOSED,
  WorkOrderStatus.SIGNED,
  WorkOrderStatus.CANCELLED,
  WorkOrderStatus.SKIPPED,
];

@Injectable()
export class KksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PlantAccessService,
  ) {}

  async tree(query: Record<string, string | undefined>, maybeUser?: AuthenticatedRequestUser, requirePlant = false) {
    const user = this.access.requireUser(maybeUser);
    const plantId = query.plantId;
    if (requirePlant && !plantId) {
      throw new BadRequestException('plantId is required');
    }
    const plantIds = await this.access.plantIdFilter(user, plantId);
    if (plantIds?.length === 0) return [];

    const parentId = this.normalizeParentId(query.parentId);
    const where: Prisma.AssetKksNodeWhereInput = {};
    if (plantIds) where.plantId = { in: plantIds };
    if (plantId && parentId === null) {
      where.OR = [{ parentId: null }, { parent: { is: { plantId: { not: plantId } } } }, { parent: { is: { plantId: null } } }];
    } else if (parentId !== undefined) {
      where.parentId = parentId;
    } else {
      where.parentId = null;
    }
    if (query.objectType && this.isAssetNodeType(query.objectType)) {
      where.nodeType = query.objectType;
    }

    const nodes = await this.prisma.assetKksNode.findMany({
      where,
      select: this.assetNodeSelect(),
      orderBy: { technicalObject: 'asc' },
      take: 50,
    });
    return nodes.map((node) => this.toAssetNode(node));
  }

  async search(query: Record<string, string | undefined>, maybeUser?: AuthenticatedRequestUser) {
    const user = this.access.requireUser(maybeUser);
    const q = query.q?.trim();
    if (!q || q.length < 3) {
      return [];
    }
    const plantIds = await this.access.plantIdFilter(user, query.plantId);
    if (plantIds?.length === 0) return [];

    const limit = Math.min(20, Math.max(1, Number(query.limit ?? 20) || 20));
    const where: Prisma.AssetKksNodeWhereInput = {
      OR: [
        { kks: { contains: q, mode: 'insensitive' } },
        { technicalObject: { contains: q, mode: 'insensitive' } },
        { kksDescription: { contains: q, mode: 'insensitive' } },
        { equipmentCode: { contains: q, mode: 'insensitive' } },
        { equipmentDescription: { contains: q, mode: 'insensitive' } },
      ],
    };
    if (plantIds) where.plantId = { in: plantIds };
    if (query.objectType && this.isAssetNodeType(query.objectType)) where.nodeType = query.objectType;

    const nodes = await this.prisma.assetKksNode.findMany({
      where,
      select: this.assetNodeSelect(),
      orderBy: { technicalObject: 'asc' },
      take: limit,
    });
    return nodes.map((node) => this.toAssetNode(node));
  }

  async detail(id: string, maybeUser?: AuthenticatedRequestUser) {
    const user = this.access.requireUser(maybeUser);
    const node = await this.prisma.assetKksNode.findUnique({
      where: { id },
      include: {
        plant: { include: { client: true } },
        parent: { select: this.assetNodeSelect() },
        children: { select: this.assetNodeSelect(), orderBy: { technicalObject: 'asc' }, take: 5 },
        workOrders: {
          orderBy: [{ plannedStart: 'desc' }, { createdAt: 'desc' }],
          take: 3,
          select: { id: true, code: true, title: true, status: true, plannedStart: true, plannedEnd: true },
        },
        _count: { select: { children: true, workOrders: true } },
      },
    });
    if (!node) throw new NotFoundException('Asset not found');
    if (!node.plantId) {
      if (!this.access.isUnrestricted(user)) throw new NotFoundException('Asset not found');
    } else {
      await this.access.ensurePlantAccess(node.plantId, user);
    }
    return {
      ...this.toAssetNode(node),
      plant: node.plant ? { id: node.plant.id, name: node.plant.name, code: node.plant.code, clientName: node.plant.client.name } : null,
      parent: node.parent ? this.toAssetNode(node.parent) : null,
      children: node.children.map((child) => this.toAssetNode(child)),
      workHistoryPreview: node.workOrders,
      counts: { children: node._count.children, workOrders: node._count.workOrders },
    };
  }

  async history(id: string, query: Record<string, string | undefined>, maybeUser?: AuthenticatedRequestUser) {
    const user = this.access.requireUser(maybeUser);
    const asset = await this.prisma.assetKksNode.findUnique({ where: { id }, select: { plantId: true } });
    if (!asset) throw new NotFoundException('Asset not found');
    if (!asset.plantId) {
      if (!this.access.isUnrestricted(user)) throw new NotFoundException('Asset not found');
    } else {
      await this.access.ensurePlantAccess(asset.plantId, user);
    }
    const { page, limit, skip } = normalizePagination(query);
    const where: Prisma.WorkOrderWhereInput = { assetNodeId: id };
    const [total, data] = await this.prisma.$transaction([
      this.prisma.workOrder.count({ where }),
      this.prisma.workOrder.findMany({
        where,
        select: {
          id: true,
          code: true,
          title: true,
          status: true,
          criticality: true,
          plannedStart: true,
          plannedEnd: true,
          progress: true,
          plant: { select: { id: true, name: true, code: true } },
          _count: { select: { evidenceFiles: true, hhEntries: true } },
        },
        orderBy: [
          { status: 'desc' },
          { plannedStart: 'desc' },
          { createdAt: 'desc' },
        ],
        skip,
        take: limit,
      }),
    ]);
    return paginated(
      data.map((row) => ({ ...row, isOverdue: Boolean(row.plannedEnd && row.plannedEnd < new Date() && !this.isTerminalWorkOrder(row.status)) })),
      total,
      page,
      limit,
    );
  }

  private assetNodeSelect() {
    return {
      id: true,
      plantId: true,
      parentId: true,
      nodeType: true,
      technicalObject: true,
      kks: true,
      kksDescription: true,
      equipmentCode: true,
      equipmentDescription: true,
      systemStatus: true,
      _count: { select: { children: true } },
    } satisfies Prisma.AssetKksNodeSelect;
  }

  private toAssetNode(node: {
    id: string;
    plantId: string | null;
    parentId: string | null;
    nodeType: AssetNodeType;
    technicalObject: string;
    kks: string | null;
    kksDescription: string | null;
    equipmentCode: string | null;
    equipmentDescription: string | null;
    systemStatus: string | null;
    _count?: { children: number };
  }) {
    return {
      id: node.id,
      plantId: node.plantId,
      parentId: node.parentId,
      objectType: node.nodeType,
      kksCode: node.kks ?? node.technicalObject,
      technicalObject: node.technicalObject,
      kksDescription: node.kksDescription,
      equipmentNumber: node.equipmentCode,
      equipmentDescription: node.equipmentDescription,
      systemStatus: node.systemStatus,
      hasChildren: (node._count?.children ?? 0) > 0,
    };
  }

  private normalizeParentId(value?: string) {
    if (value === undefined) return undefined;
    if (value === '' || value === 'null') return null;
    return value;
  }

  private isAssetNodeType(value: string): value is AssetNodeType {
    return Object.values(AssetNodeType).includes(value as AssetNodeType);
  }

  private isTerminalWorkOrder(status: WorkOrderStatus) {
    return TERMINAL_WORK_ORDER_STATUSES.includes(status);
  }
}
