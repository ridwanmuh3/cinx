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
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'dev-secret-change-me',
    });
  }

  validate(payload: JwtPayload): AuthenticatedUser {
    return { userId: payload.sub, email: payload.email, role: payload.role };
  }
}
