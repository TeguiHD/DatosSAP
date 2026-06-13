import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';

@Public()
@Controller('health')
export class HealthController {
  @Get()
  health() {
    return {
      ok: true,
      service: 'datos-api',
      timestamp: new Date().toISOString(),
    };
  }
}
