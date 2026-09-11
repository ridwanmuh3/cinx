import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  // Mirrors user-service: caps bcrypt input so login can't be used for
  // CPU-exhaustion via oversized passwords.
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;
}
