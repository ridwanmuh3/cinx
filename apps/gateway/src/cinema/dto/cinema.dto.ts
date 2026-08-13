import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
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
  @MinLength(1, { each: true })
  @IsString({ each: true })
  genres: string[];

  @IsInt()
  @Min(1)
  durationMinutes: number;

  @IsEnum(['SU', 'BO', '13+', '17+', '21+'])
  ageRating: AgeRating;

  @IsOptional()
  @IsUrl()
  posterUrl?: string | null;

  @IsString()
  releaseDate: string;

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
  @MinLength(1, { each: true })
  @IsString({ each: true })
  genres?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @IsOptional()
  @IsEnum(['SU', 'BO', '13+', '17+', '21+'])
  ageRating?: AgeRating;

  @IsOptional()
  @IsUrl()
  posterUrl?: string | null;

  @IsOptional()
  @IsString()
  releaseDate?: string;

  @IsOptional()
  @IsEnum(['NOW_SHOWING', 'COMING_SOON', 'ENDED'])
  status?: MovieStatus;
}

export class TheaterLayoutDto {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  rows: number;

  @IsInt()
  @Min(1)
  @Type(() => Number)
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

  @IsObject()
  @ValidateNested()
  @Type(() => TheaterLayoutDto)
  layout: TheaterLayoutDto;
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
  startsAt: string;

  @IsObject()
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
  @IsObject()
  @ValidateNested()
  @Type(() => MoneyDto)
  price?: MoneyDto;
}
