import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // Check current lock
  const lock = await prisma.syncLock.findUnique({
    where: { lock_type: 'listener' }
  });
  console.log('Current lock:', JSON.stringify(lock, null, 2));

  // Release the lock
  if (lock) {
    await prisma.syncLock.delete({
      where: { lock_type: 'listener' }
    });
    console.log('Lock released!');
  } else {
    console.log('No lock found');
  }
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
