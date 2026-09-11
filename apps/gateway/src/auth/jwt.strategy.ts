import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedUser } from '../common/auth/current-user.decorator';

export interface JwtPayload {
  sub: string;
  email: string;
  role: 'admin' | 'user';
}

/**
 * The gateway shares the JWT secret with user-service (which signs the
 * tokens), so it can verify tokens locally without a round-trip. `sub` is
 * the userId. role is embedded in the token so the admin guard is cheap.
 */
// Shared secret with user-service (which signs tokens). Fail fast rather
// than silently trusting a known dev secret — OWASP A02/A07.
const JWT_SECRET = process.env.JWT_SECRET ?? '';
if (JWT_SECRET.length < 32) {
  throw new Error(
    'JWT_SECRET must be set to at least 32 characters (openssl rand -base64 32)',
  );
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: JWT_SECRET,
      algorithms: ['HS256'],
    });
  }

  validate(payload: JwtPayload): AuthenticatedUser {
    return { userId: payload.sub, email: payload.email, role: payload.role };
  }
}
