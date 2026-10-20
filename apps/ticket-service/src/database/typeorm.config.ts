import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { buildPgUrl, PG_DBS } from '@ticketing/shared';
import { Ticket } from '../tickets/ticket.entity';

export const typeOrmConfig: TypeOrmModuleOptions = {
  type: 'postgres',
  url: buildPgUrl(PG_DBS.TICKET),
  entities: [Ticket],
  synchronize: true,
  autoLoadEntities: false,
};
