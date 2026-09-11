export const UserPatterns = {
  REGISTER: 'Register',
  LOGIN: 'Login',
  ME: 'Me',
  GET: 'Get',
  PING: 'Ping',
} as const;

export type UserRole = 'admin' | 'user';

export interface RegisterRequest {
  email: string;
  password: string;
  name?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface MeRequest {
  userId: string;
}

export interface UserDto {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  createdAt: string;
}

export interface UserContactDto {
  id: string;
  email: string;
  name: string | null;
}

export interface LoginResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: UserDto;
}
