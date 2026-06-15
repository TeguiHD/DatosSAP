import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ImportFileType } from '@prisma/client';

export class UploadFileDto {
  @IsOptional()
  @IsEnum(ImportFileType)
  fileType?: ImportFileType;

  @IsOptional()
  @IsString()
  originalName?: string;

  @IsOptional()
  @IsString()
  storageKey?: string;
}
