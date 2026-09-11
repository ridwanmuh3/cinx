import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AgeRating, MovieStatus } from '@ticketing/shared';

export class MoneyDto {
  @IsInt()
  @Min(0)
  amount: number;

  @IsString()
  currency: 'IDR';
}

export class CreateMovieDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @IsString()
  @MaxLength(5000)
  synopsis: string;

  @IsArray()
  @IsString({ each: true })
  genres: string[];

  @IsInt()
  durationMinutes: number;

  @IsEnum(['SU', 'BO', '13+', '17+', '21+'])
  ageRating: AgeRating;

  @IsOptional()
  @IsString()
  @IsUrl()
  posterUrl?: string;

  @IsString()
  releaseDate: string; // ISO date YYYY-MM-DD

  @IsOptional()
  @IsEnum(['NOW_SHOWING', 'COMING_SOON', 'ENDED'])
  status?: MovieStatus;
}

export class UpdateMovieDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  synopsis?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  genres?: string[];

  @IsOptional()
  @IsInt()
  durationMinutes?: number;

  @IsOptional()
  @IsEnum(['SU', 'BO', '13+', '17+', '21+'])
  ageRating?: AgeRating;

  @IsOptional()
  @IsString()
  @IsUrl()
  posterUrl?: string;

  @IsOptional()
  @IsString()
  releaseDate?: string;

  @IsOptional()
  @IsEnum(['NOW_SHOWING', 'COMING_SOON', 'ENDED'])
  status?: MovieStatus;
}

export class LayoutDto {
  @IsInt()
  rows: number;

  @IsInt()
  cols: number;
}

export class CreateTheaterDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  address: string;

  @ValidateNested()
  @Type(() => LayoutDto)
  layout: LayoutDto;

  /** Flat proto-wire fields, populated when the request arrives over gRPC. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  rows?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  cols?: number;
}

export class UpdateTheaterDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  address?: string;
}

export class CreateShowtimeDto {
  @IsString()
  movieId: string;

  @IsString()
  theaterId: string;

  @IsString()
  startsAt: string; // ISO date-time

  @ValidateNested()
  @Type(() => MoneyDto)
  price: MoneyDto;
}

export class UpdateShowtimeDto {
  @IsOptional()
  @IsString()
  movieId?: string;

  @IsOptional()
  @IsString()
  theaterId?: string;

  @IsOptional()
  @IsString()
  startsAt?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => MoneyDto)
  price?: MoneyDto;
}

export class ListMoviesQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  genre?: string;

  @IsOptional()
  @IsEnum([true, false])
  nowPlaying?: boolean;
}

export class ListShowtimesQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  movieId?: string;

  @IsOptional()
  @IsString()
  theaterId?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}
