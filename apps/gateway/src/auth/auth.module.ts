import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ServiceClientsModule } from '../clients/service-clients.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [PassportModule, ServiceClientsModule],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [PassportModule],
})
export class AuthModule {}
