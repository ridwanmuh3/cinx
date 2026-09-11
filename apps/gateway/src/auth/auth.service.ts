import { Inject, Injectable } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import {
  grpcSend,
  LoginResponse,
  SERVICE_NAMES,
  UserDto,
  UserServiceStub,
} from '@ticketing/shared';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  private readonly users: UserServiceStub;

  constructor(@Inject(SERVICE_NAMES.USER) client: ClientGrpc) {
    this.users = client.getService<UserServiceStub>('UserService');
  }

  register(dto: RegisterDto): Promise<UserDto> {
    return grpcSend(
      this.users.Register({
        email: dto.email,
        password: dto.password,
        name: dto.name,
      }),
    );
  }

  login(dto: LoginDto): Promise<LoginResponse> {
    return grpcSend(
      this.users.Login({ email: dto.email, password: dto.password }),
    );
  }

  me(userId: string): Promise<UserDto> {
    return grpcSend(this.users.Me({ userId }));
  }
}
