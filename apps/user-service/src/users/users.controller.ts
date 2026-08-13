import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { UserPatterns, UserDto, LoginResponse } from '@ticketing/shared';
import { UsersService } from './users.service';
import { LoginDto } from './dto/login.dto';
import { MeDto } from './dto/me.dto';
import { RegisterDto } from './dto/register.dto';

@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @MessagePattern(UserPatterns.REGISTER)
  register(@Payload() dto: RegisterDto): Promise<UserDto> {
    return this.users.register(dto);
  }

  @MessagePattern(UserPatterns.LOGIN)
  login(@Payload() dto: LoginDto): Promise<LoginResponse> {
    return this.users.login(dto);
  }

  @MessagePattern(UserPatterns.ME)
  me(@Payload() dto: MeDto): Promise<UserDto> {
    return this.users.me(dto);
  }
}
