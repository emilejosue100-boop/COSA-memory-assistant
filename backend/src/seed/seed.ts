import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB } from '../config/db.js';
import { ensureDefaultCooperative, ensureDemoAccounts, getDemoAccountCredentials } from '../bootstrap.js';
import { db } from '../db/index.js';
import {
  cooperatives,
  members,
  transactions,
  loanRequests,
  opportunities,
  notes,
} from '../db/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function seed() {
  await connectDB();

  console.log('Resetting CockroachDB to empty cooperative...');
  await db.delete(notes);
  await db.delete(opportunities);
  await db.delete(loanRequests);
  await db.delete(transactions);
  await db.delete(members);
  await db.delete(cooperatives);

  await ensureDefaultCooperative();
  await ensureDemoAccounts();

  const credentials = getDemoAccountCredentials();
  const admin = credentials.find((c) => c.role === 'admin');
  const member = credentials.find((c) => c.role === 'member');

  console.log('\nSeed complete — demo accounts ready.');
  console.log('Demo logins:');
  if (member) {
    console.log(`  Member  — Sign In tab:   ${member.phone} / PIN ${member.pin}`);
  }
  if (admin) {
    console.log(`  Admin   — Committee tab: ${admin.phone} / PIN ${admin.pin}`);
  }

  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
