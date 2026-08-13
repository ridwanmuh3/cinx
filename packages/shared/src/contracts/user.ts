export const UserPatterns = {
  REGISTER: 'user.register',
  LOGIN: 'user.login',
  ME: 'user.me',
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

export interface LoginResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: UserDto;
}
