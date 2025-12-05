/**
 * Seed script for predefined tags
 * Run with: npx tsx scripts/seed-tags.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Linear-inspired design: Clean, professional tags with subtle colors
const predefinedTags = [
  {
    name: 'Hot Lead',
    color: '#ef4444', // Red - urgent/high priority
    description: 'Active sales opportunity, high engagement',
    category: 'sales',
  },
  {
    name: 'Customer',
    color: '#10b981', // Green - positive/established
    description: 'Existing customer relationship',
    category: 'sales',
  },
  {
    name: 'Prospect',
    color: '#3b82f6', // Blue - potential
    description: 'Qualified potential customer',
    category: 'sales',
  },
  {
    name: 'VIP',
    color: '#f59e0b', // Amber - special/important
    description: 'High-value or priority contact',
    category: 'priority',
  },
  {
    name: 'Follow-up',
    color: '#8b5cf6', // Purple - action needed
    description: 'Requires follow-up action',
    category: 'action',
  },
  {
    name: 'Cold',
    color: '#6b7280', // Gray - inactive
    description: 'Inactive or low engagement',
    category: 'sales',
  },
  {
    name: 'Partner',
    color: '#06b6d4', // Cyan - collaboration
    description: 'Business partner or collaborator',
    category: 'relationship',
  },
  {
    name: 'Support',
    color: '#ec4899', // Pink - service
    description: 'Support or service inquiry',
    category: 'service',
  },
];

async function main() {
  console.log('🏷️  Seeding tags...\n');

  for (const tag of predefinedTags) {
    const existing = await prisma.tag.findUnique({
      where: { name: tag.name },
    });

    if (existing) {
      console.log(`  ⏭️  Tag "${tag.name}" already exists, skipping`);
      continue;
    }

    await prisma.tag.create({
      data: tag,
    });
    console.log(`  ✅ Created tag: ${tag.name}`);
  }

  console.log('\n✨ Tag seeding complete!');

  // Show summary
  const totalTags = await prisma.tag.count();
  console.log(`\n📊 Total tags in database: ${totalTags}`);
}

main()
  .catch((e) => {
    console.error('Error seeding tags:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
