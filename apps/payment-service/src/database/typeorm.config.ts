import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { buildPgUrl, PG_DBS } from '@ticketing/shared';
import { Payment } from '../payments/payment.entity';

export const typeOrmConfig: TypeOrmModuleOptions = {
  type: 'postgres',
  url: buildPgUrl(PG_DBS.PAYMENT),
  entities: [Payment],
  synchronize: true,
  autoLoadEntities: false,
};
