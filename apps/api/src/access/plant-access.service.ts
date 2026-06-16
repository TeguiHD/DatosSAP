import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuthenticatedRequestUser {
  userId: string;
  email?: string;
  role: Role;
  orgId?: string | null;
  sessionId?: string;
}

export interface RequestWithUser {
  user?: AuthenticatedRequestUser;
}

@Injectable()
export class PlantAccessService {
  constructor(private readonly prisma: PrismaService) {}

  requireUser(user?: AuthenticatedRequestUser): AuthenticatedRequestUser {
    if (!user?.userId || !user.role) {
      throw new UnauthorizedException('No autenticado');
    }
    return user;
  }

  isUnrestricted(user: AuthenticatedRequestUser) {
    return user.role === Role.SUPERADMIN || user.role === Role.ADMIN;
  }

  async authorizedPlantIds(user: AuthenticatedRequestUser): Promise<string[] | null> {
    if (this.isUnrestricted(user)) {
      return null;
    }
    const scopes = await this.prisma.userPlantScope.findMany({
      where: { userId: user.userId },
      select: { plantId: true },
    });
    return scopes.map((scope) => scope.plantId);
  }

  async ensurePlantAccess(plantId: string, user: AuthenticatedRequestUser) {
    if (this.isUnrestricted(user)) {
      return;
    }
    const scope = await this.prisma.userPlantScope.findUnique({
      where: { userId_plantId: { userId: user.userId, plantId } },
      select: { id: true },
    });
    if (!scope) {
      throw new NotFoundException('Resource not found');
    }
  }

  async plantIdFilter(user: AuthenticatedRequestUser, requestedPlantId?: string) {
    const authorizedPlantIds = await this.authorizedPlantIds(user);
    if (authorizedPlantIds === null) {
      return requestedPlantId ? [requestedPlantId] : null;
    }
    if (requestedPlantId) {
      return authorizedPlantIds.includes(requestedPlantId) ? [requestedPlantId] : [];
    }
    return authorizedPlantIds;
  }
}
