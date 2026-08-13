import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  LoginResponse,
  SERVICE_NAMES,
  UserDto,
  UserPatterns,
} from '@ticketing/shared';
import { rpcSend } from '../common/rpc/rpc.util';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    @Inject(SERVICE_NAMES.USER) private readonly userClient: ClientProxy,
  ) {}

  register(dto: RegisterDto): Promise<UserDto> {
    return rpcSend(this.userClient, UserPatterns.REGISTER, dto);
  }

  login(dto: LoginDto): Promise<LoginResponse> {
    return rpcSend(this.userClient, UserPatterns.LOGIN, dto);
  }

  me(userId: string): Promise<UserDto> {
    return rpcSend(this.userClient, UserPatterns.ME, { userId });
  }
}
