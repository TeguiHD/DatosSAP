import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthService, type AuthenticatedUser } from './auth.service';
import { Public } from './decorators/public.decorator';
import { LoginDto, RefreshDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

const REFRESH_COOKIE = 'datos_refresh_token';
const REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

interface RequestLike {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

interface AuthenticatedRequest extends RequestLike {
  user: AuthenticatedUser;
}

interface CookieResponse {
  setHeader(name: string, value: string): void;
  cookie(name: string, value: string, options: RefreshCookieOptions): void;
  clearCookie(name: string, options: { path: string }): void;
}

interface RefreshCookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax';
  path: string;
  maxAge: number;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  async login(
    @Body() body: LoginDto,
    @Req() request: RequestLike,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    const rate = this.auth.consumeLoginAttempt(request.ip ?? 'unknown');
    if (!rate.allowed) {
      response.setHeader('Retry-After', String(rate.retryAfter));
      throw new HttpException('Demasiados intentos. Intenta nuevamente mas tarde.', HttpStatus.TOO_MANY_REQUESTS);
    }

    const userAgent = normalizeHeader(request.headers['user-agent']);
    const result = await this.auth.login(body, {
      ip: request.ip,
      userAgent,
    });
    this.setRefreshCookie(response, result.refreshToken);
    return result;
  }

  @Public()
  @Post('refresh')
  async refresh(
    @Body() body: Partial<RefreshDto>,
    @Req() request: RequestLike,
  ) {
    const refreshToken = body.refreshToken ?? this.readCookie(request, REFRESH_COOKIE);
    return this.auth.refresh(refreshToken ?? '');
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(
    @Body() body: Partial<RefreshDto>,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    const refreshToken = body.refreshToken ?? this.readCookie(request, REFRESH_COOKIE);
    const result = await this.auth.logout(request.user, refreshToken);
    response.clearCookie(REFRESH_COOKIE, { path: '/auth' });
    return result;
  }

  private setRefreshCookie(response: CookieResponse, refreshToken: string) {
    response.cookie(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/auth',
      maxAge: REFRESH_COOKIE_MAX_AGE,
    });
  }

  private readCookie(request: RequestLike, key: string) {
    const cookieHeader = request.headers.cookie;
    if (!cookieHeader || Array.isArray(cookieHeader)) {
      return null;
    }
    const cookies = cookieHeader.split(';').map((cookie) => cookie.trim());
    const match = cookies.find((cookie) => cookie.startsWith(`${key}=`));
    return match ? decodeURIComponent(match.slice(key.length + 1)) : null;
  }
}

function normalizeHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
