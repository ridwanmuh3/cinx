import { IsUUID } from 'class-validator';

export class MeDto {
  @IsUUID()
  userId: string;
}
