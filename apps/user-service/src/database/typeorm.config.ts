import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { buildPgUrl, PG_DBS } from '@ticketing/shared';
import { User } from '../users/user.entity';

export const typeOrmConfig: TypeOrmModuleOptions = {
  type: 'postgres',
  url: buildPgUrl(PG_DBS.USER),
  entities: [User],
  // Development convenience; switch to migrations before production.
  synchronize: true,
  autoLoadEntities: false,
};
