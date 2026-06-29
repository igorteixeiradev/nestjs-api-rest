import { IsOptional } from 'class-validator';

export class PaginationQueryDto {
  @IsOptional()
  page: number = 1;

  @IsOptional()
  limit: number = 10;
}
