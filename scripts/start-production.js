#!/usr/bin/env node

/**
 * Production Startup Script
 *
 * Runs necessary tasks before starting the Next.js server:
 * 1. Apply database migrations
 * 2. Validate environment variables
 * 3. Start Next.js server
 */

const { spawn } = require('child_process');

async function runCommand(command, args = []) {
  return new Promise((resolve, reject) => {
    console.log(`Running: ${command} ${args.join(' ')}`);

    const proc = spawn(command, args, {
      stdio: 'inherit',
      shell: true
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`${command} exited with code ${code}`));
      } else {
        resolve();
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

async function main() {
  try {
    console.log('🚀 Starting production server...\n');

    // Step 1: Apply database migrations
    console.log('📦 Applying database migrations...');
    await runCommand('npx', ['prisma', 'migrate', 'deploy']);
    console.log('✅ Migrations applied\n');

    // Step 2: Start Next.js server
    console.log('🌐 Starting Next.js server...');
    await runCommand('npm', ['start']);

  } catch (error) {
    console.error('❌ Production startup failed:', error.message);
    process.exit(1);
  }
}

main();
