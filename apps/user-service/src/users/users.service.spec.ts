import { JwtService } from '@nestjs/jwt';
import { RpcException } from '@nestjs/microservices';
import { compare, hash } from 'bcryptjs';
import { mock } from 'jest-mock-extended';
import { DeepPartial, Repository } from 'typeorm';
import { User } from './user.entity';
import { UsersService } from './users.service';

describe('UsersService', () => {
  const repo = mock<Repository<User>>();
  const jwt = mock<JwtService>();
  let service: UsersService;

  const createdAt = new Date('2026-01-01T00:00:00.000Z');
  const updatedAt = new Date('2026-01-01T00:00:00.000Z');

  async function expectStatus(promise: Promise<unknown>, statusCode: number) {
    try {
      await promise;
    } catch (err) {
      const payload = err instanceof RpcException ? err.getError() : err;
      const code = (payload as { statusCode?: number } | null)?.statusCode;
      expect(code).toBe(statusCode);
      return;
    }
    throw new Error('expected the promise to reject');
  }

  function makeUser(overrides: DeepPartial<User> = {}): User {
    return {
      id: (overrides.id as string) ?? '11111111-1111-1111-1111-111111111111',
      email: (overrides.email as string) ?? 'budi@example.com',
      name:
        overrides.name === undefined
          ? 'Budi'
          : (overrides.name as string | null),
      passwordHash: (overrides.passwordHash as string) ?? 'not-a-real-hash',
      role: (overrides.role as User['role']) ?? 'user',
      createdAt: (overrides.createdAt as Date) ?? createdAt,
      updatedAt: (overrides.updatedAt as Date) ?? updatedAt,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UsersService(repo, jwt);
  });

  describe('register', () => {
    it('creates a user with a hashed password and returns a UserDto without the hash', async () => {
      const password = 'password123';
      repo.findOne.mockResolvedValue(null);
      repo.create.mockImplementation((data) =>
        makeUser({ ...data, passwordHash: 'stub' }),
      );
      repo.save.mockImplementation((user) => Promise.resolve(user as User));

      const result = await service.register({
        email: 'budi@example.com',
        password,
        name: 'Budi',
      });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'budi@example.com',
          name: 'Budi',
          role: 'user',
        }),
      );
      const created = repo.create.mock.calls[0][0] as DeepPartial<User>;
      expect(created.passwordHash).toBeDefined();
      expect(created.passwordHash).not.toBe(password);
      await expect(compare(password, created.passwordHash!)).resolves.toBe(
        true,
      );

      expect(result).toEqual({
        id: expect.any(String),
        email: 'budi@example.com',
        name: 'Budi',
        role: 'user',
        createdAt: createdAt.toISOString(),
      });
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('defaults name to null when omitted', async () => {
      repo.findOne.mockResolvedValue(null);
      repo.create.mockImplementation((data) =>
        makeUser({ ...data, name: null }),
      );
      repo.save.mockImplementation((user) => Promise.resolve(user as User));

      const result = await service.register({
        email: 'budi@example.com',
        password: 'password123',
      });

      expect(result.name).toBeNull();
    });

    it('rejects with 422 when the email is already registered', async () => {
      repo.findOne.mockResolvedValue(makeUser());

      const promise = service.register({
        email: 'budi@example.com',
        password: 'password123',
      });

      await expect(promise).rejects.toThrow(RpcException);
      await expectStatus(promise, 422);
    });

    it('rejects with 422 on a concurrent unique violation', async () => {
      repo.findOne.mockResolvedValue(null);
      repo.create.mockReturnValue(makeUser());
      repo.save.mockRejectedValue({ code: '23505' });

      const promise = service.register({
        email: 'budi@example.com',
        password: 'password123',
      });

      await expectStatus(promise, 422);
    });
  });

  describe('login', () => {
    it('returns an access token and the user when credentials are valid', async () => {
      const password = 'password123';
      const passwordHash = await hash(password, 10);
      const user = makeUser({ passwordHash });
      repo.findOne.mockResolvedValue(user);
      jwt.sign.mockReturnValue('signed-jwt');

      const result = await service.login({ email: user.email, password });

      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: user.id,
          email: user.email,
          role: user.role,
        }),
        expect.objectContaining({ expiresIn: 3600 }),
      );
      expect(result).toEqual({
        accessToken: 'signed-jwt',
        tokenType: 'Bearer',
        expiresIn: 3600,
        user: expect.objectContaining({ id: user.id, email: user.email }),
      });
    });

    it('rejects with 401 on a wrong password', async () => {
      repo.findOne.mockResolvedValue(
        makeUser({ passwordHash: await hash('right', 10) }),
      );

      const promise = service.login({
        email: 'budi@example.com',
        password: 'wrong',
      });

      await expectStatus(promise, 401);
    });

    it('rejects with 401 when the email does not exist', async () => {
      repo.findOne.mockResolvedValue(null);

      const promise = service.login({
        email: 'ghost@example.com',
        password: 'password123',
      });

      await expectStatus(promise, 401);
    });
  });

  describe('me', () => {
    it('returns the user for a known id', async () => {
      const user = makeUser();
      repo.findOne.mockResolvedValue(user);

      const result = await service.me({ userId: user.id });

      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: user.id } });
      expect(result).toEqual(
        expect.objectContaining({ id: user.id, email: user.email }),
      );
    });

    it('rejects with 401 for an unknown id', async () => {
      repo.findOne.mockResolvedValue(null);

      const promise = service.me({
        userId: '00000000-0000-0000-0000-000000000000',
      });

      await expectStatus(promise, 401);
    });
  });
});
