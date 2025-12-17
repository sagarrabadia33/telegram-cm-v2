const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Get Bluelith group members
  const cloudlet = await prisma.conversation.findFirst({
    where: { title: 'Bluelith | Beast Insight' },
    select: {
      members: {
        select: { externalUserId: true, firstName: true, lastName: true, username: true }
      }
    }
  });

  if (!cloudlet) {
    console.log('Cloudlet not found');
    return;
  }

  // Filter team usernames
  const teamUsernames = ['shaaborwal', 'jesalbo', 'prathamesh_sranalytics'];
  const customerMembers = cloudlet.members.filter(m => {
    const username = (m.username || '').toLowerCase();
    return !teamUsernames.some(t => username.includes(t));
  });

  console.log('Cloudlet customer members:', customerMembers.map(m => m.firstName + ' ' + (m.lastName||'') + ' (@' + (m.username||'N/A') + ')'));

  const customerIds = customerMembers.map(m => m.externalUserId);
  console.log('Customer IDs:', customerIds);

  // Find private chats with these customers
  const privateChats = await prisma.conversation.findMany({
    where: {
      type: 'private',
      OR: [
        { members: { some: { externalUserId: { in: customerIds } } } },
        { externalChatId: { in: customerIds } }
      ]
    },
    select: {
      id: true,
      title: true,
      messages: {
        orderBy: { sentAt: 'desc' },
        take: 10,
        select: { body: true, direction: true, sentAt: true }
      }
    }
  });

  console.log('\nFound', privateChats.length, 'private chats with Cloudlet members');

  for (const chat of privateChats) {
    console.log('\n--- Private chat:', chat.title, '---');
    chat.messages.slice(0, 5).reverse().forEach(m => {
      const date = m.sentAt.toISOString().split('T')[0];
      const sender = m.direction === 'outbound' ? 'Shalin' : chat.title;
      console.log('[' + date + '] ' + sender + ': ' + (m.body || '').slice(0,100));
    });
  }

  await prisma.$disconnect();
}
main();
