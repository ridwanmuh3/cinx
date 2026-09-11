import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RpcException } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { compare, hash } from 'bcryptjs';
import { Repository } from 'typeorm';
import {
  LoginResponse,
  rpcErrorPayload,
  UserContactDto,
  UserDto,
  UserRole,
} from '@ticketing/shared';
import { User } from './user.entity';
import { LoginDto } from './dto/login.dto';
import { MeDto } from './dto/me.dto';
import { RegisterDto } from './dto/register.dto';

const BCRYPT_ROUNDS = 10;
const TOKEN_TTL_SECONDS = 3600;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<UserDto> {
    const existing = await this.users.findOne({ where: { email: dto.email } });
    if (existing) {
      throw new RpcException(rpcErrorPayload(422, 'Email already registered'));
    }

    const passwordHash = await hash(dto.password, BCRYPT_ROUNDS);
    const user = this.users.create({
      email: dto.email,
      name: dto.name ?? null,
      passwordHash,
      role: 'user',
    });

    try {
      const saved = await this.users.save(user);
      return this.toDto(saved);
    } catch (err: unknown) {
      if (this.isUniqueViolation(err)) {
        throw new RpcException(
          rpcErrorPayload(422, 'Email already registered'),
        );
      }
      throw err;
    }
  }

  async login(dto: LoginDto): Promise<LoginResponse> {
    const user = await this.users.findOne({ where: { email: dto.email } });
    if (!user || !(await compare(dto.password, user.passwordHash))) {
      throw new RpcException(rpcErrorPayload(401, 'Invalid credentials'));
    }
    return this.issueToken(user);
  }

  async me(dto: MeDto): Promise<UserDto> {
    const user = await this.users.findOne({ where: { id: dto.userId } });
    if (!user) {
      throw new RpcException(rpcErrorPayload(401, 'Invalid token'));
    }
    return this.toDto(user);
  }

  async get(userId: string): Promise<UserContactDto> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) {
      throw new RpcException(rpcErrorPayload(404, 'User not found'));
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name,
    };
  }

  private issueToken(user: User): LoginResponse {
    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = this.jwt.sign(payload, {
      expiresIn: TOKEN_TTL_SECONDS,
    });
    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: TOKEN_TTL_SECONDS,
      user: this.toDto(user),
    };
  }

  private toDto(user: User): UserDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as UserRole,
      createdAt: user.createdAt.toISOString(),
    };
  }

  private isUniqueViolation(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      (err as { code?: string }).code === '23505'
    );
  }
}
