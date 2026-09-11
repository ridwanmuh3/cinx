import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  // MinLength keeps parity with RegisterDto; MaxLength(72) matches bcrypt's
  // input limit so a huge password can't burn CPU per request (DoS).
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;
}
