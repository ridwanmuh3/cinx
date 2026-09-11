import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { UserPatterns, validateDto } from '@ticketing/shared';
import { UsersService } from './users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { MeDto } from './dto/me.dto';

@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @GrpcMethod('UserService', UserPatterns.REGISTER)
  async register(req: RegisterDto) {
    await validateDto(req, RegisterDto);
    return this.users.register(req);
  }

  @GrpcMethod('UserService', UserPatterns.LOGIN)
  async login(req: LoginDto) {
    await validateDto(req, LoginDto);
    return this.users.login(req);
  }

  @GrpcMethod('UserService', UserPatterns.ME)
  async me(req: MeDto) {
    await validateDto(req, MeDto);
    return this.users.me(req);
  }

  @GrpcMethod('UserService', UserPatterns.GET)
  async get(req: { userId: string }) {
    return this.users.get(req.userId);
  }

  @GrpcMethod('UserService', UserPatterns.PING)
  ping() {
    return {
      service: 'user-service',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
