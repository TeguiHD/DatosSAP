import { IsObject, IsOptional, IsString } from 'class-validator';

export class ResolveIssueDto {
  @IsString()
  issueId!: string;

  @IsOptional()
  @IsString()
  sourceValue?: string;

  @IsOptional()
  @IsString()
  aliasCode?: string;

  @IsOptional()
  @IsString()
  targetPlantId?: string;

  @IsOptional()
  @IsString()
  targetPlantCode?: string;

  @IsOptional()
  @IsString()
  sourceType?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsObject()
  resolution?: Record<string, unknown>;
}
