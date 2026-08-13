import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { hash } from 'bcryptjs';
import { buildPgUrl, PG_DBS } from '@ticketing/shared';
import { User } from '../users/user.entity';

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'admin1234';
const ADMIN_NAME = process.env.SEED_ADMIN_NAME ?? 'Admin';

async function main() {
  const dataSource = new DataSource({
    type: 'postgres',
    url: buildPgUrl(PG_DBS.USER),
    entities: [User],
    synchronize: true,
  });
  await dataSource.initialize();

  const users = dataSource.getRepository(User);
  const existing = await users.findOne({ where: { email: ADMIN_EMAIL } });
  if (existing) {
    existing.role = 'admin';
    existing.name = ADMIN_NAME;
    await users.save(existing);
    console.log(
      `[seed] admin already exists, ensured role=admin: ${ADMIN_EMAIL}`,
    );
  } else {
    const user = users.create({
      email: ADMIN_EMAIL,
      name: ADMIN_NAME,
      passwordHash: await hash(ADMIN_PASSWORD, 10),
      role: 'admin',
    });
    await users.save(user);
    console.log(`[seed] created admin: ${ADMIN_EMAIL}`);
  }

  await dataSource.destroy();
}

void main().catch((err) => {
  console.error('[seed] FAILED', err);
  process.exitCode = 1;
});
