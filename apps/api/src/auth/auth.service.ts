import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role, User } from '@prisma/client';
import bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

const GENERIC_LOGIN_ERROR = 'Credenciales incorrectas';
const DUMMY_PASSWORD_HASH = '$2b$12$5Wrjh7JWvZkMwaBNb9eFQOSAvA.nL8jCIrrN1rMMF1AZ1k/QsQj2a';
const ACCESS_TOKEN_EXPIRES_IN = '8h';
const REFRESH_TOKEN_DAYS = 7;
const LOCK_THRESHOLD = 10;
const LOCK_MINUTES = 15;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LIMIT = 5;

interface AuthenticatedUser {
  userId: string;
  email: string;
  role: Role;
  orgId: string | null;
  sessionId?: string;
}

interface LoginRateBucket {
  count: number;
  resetAt: number;
}

@Injectable()
export class AuthService {
  private readonly loginAttempts = new Map<string, LoginRateBucket>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  consumeLoginAttempt(ip: string) {
    const now = Date.now();
    const current = this.loginAttempts.get(ip);
    if (!current || current.resetAt <= now) {
      this.loginAttempts.set(ip, {
        count: 1,
        resetAt: now + LOGIN_WINDOW_MS,
      });
      return { allowed: true, retryAfter: 0 };
    }

    if (current.count >= LOGIN_LIMIT) {
      return {
        allowed: false,
        retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
      };
    }

    current.count += 1;
    return { allowed: true, retryAfter: 0 };
  }

  async login(input: LoginDto, context: { ip?: string | undefined; userAgent?: string | undefined }) {
    const email = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
        role: true,
        organizationId: true,
        failedLoginAttempts: true,
        lockedUntil: true,
      },
    });

    if (!user) {
      await bcrypt.compare(input.password, DUMMY_PASSWORD_HASH);
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    }

    const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);
    if (!passwordMatches) {
      await this.recordFailedLogin(user);
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    }

    const refreshToken = this.createRefreshToken();
    const refreshHash = this.hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);
    const session = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLoginAt: new Date(),
        },
      });
      return tx.userSession.create({
        data: {
          userId: user.id,
          refreshHash,
          userAgent: context.userAgent ?? null,
          ip: context.ip ?? null,
          expiresAt,
        },
      });
    });

    const accessToken = await this.signAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      orgId: user.organizationId,
      sessionId: session.id,
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TOKEN_EXPIRES_IN,
      user: this.toPublicUser(user),
    };
  }

  async refresh(refreshToken: string) {
    const refreshHash = this.hashToken(refreshToken);
    const session = await this.prisma.userSession.findUnique({
      where: { refreshHash },
      include: { user: true },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    }

    const accessToken = await this.signAccessToken({
      userId: session.user.id,
      email: session.user.email,
      role: session.user.role,
      orgId: session.user.organizationId,
      sessionId: session.id,
    });

    return {
      accessToken,
      expiresIn: ACCESS_TOKEN_EXPIRES_IN,
      user: this.toPublicUser(session.user),
    };
  }

  async logout(user: AuthenticatedUser, refreshToken?: string | null) {
    if (refreshToken) {
      await this.prisma.userSession.updateMany({
        where: {
          userId: user.userId,
          refreshHash: this.hashToken(refreshToken),
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      return { ok: true };
    }

    if (user.sessionId) {
      await this.prisma.userSession.updateMany({
        where: { id: user.sessionId, userId: user.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return { ok: true };
    }

    await this.prisma.userSession.updateMany({
      where: { userId: user.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  private async recordFailedLogin(user: Pick<User, 'id' | 'failedLoginAttempts'>) {
    const attempts = user.failedLoginAttempts + 1;
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: attempts,
        lockedUntil: attempts >= LOCK_THRESHOLD
          ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000)
          : null,
      },
    });
  }

  private async signAccessToken(user: AuthenticatedUser) {
    return this.jwt.signAsync(
      {
        sub: user.userId,
        email: user.email,
        role: user.role,
        orgId: user.orgId,
        sid: user.sessionId,
      },
      { expiresIn: ACCESS_TOKEN_EXPIRES_IN },
    );
  }

  private createRefreshToken() {
    return randomBytes(48).toString('base64url');
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private toPublicUser(user: Pick<User, 'id' | 'email' | 'name' | 'role'>) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }
}

export type { AuthenticatedUser };
