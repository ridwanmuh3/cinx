import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';

export class HoldSeatsDto {
  @IsString()
  showtimeId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @IsString({ each: true })
  seatIds: string[];
}
