import { Global, Module } from '@nestjs/common';
import { PlantAccessService } from './plant-access.service';

@Global()
@Module({
  providers: [PlantAccessService],
  exports: [PlantAccessService],
})
export class AccessModule {}
