import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB, disconnectDB } from '../src/config/db.js';
import {
  memberNameAppearsInQuestion,
  questionRequestsCooperativeComparison,
  resolveMembersByName,
} from '../src/services/namedMemberSearch.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const nameMatchCases = [
  { question: 'Compare Josue and Bonaventure', expected: ['Josue', 'Bonaventure'] },
  { question: 'How does Jardel compare to Demo Member?', expected: ['Jardel Bayanza', 'Demo Member'] },
  { question: 'Tell me about Bonaventure loan history', expected: ['Bonaventure'] },
  {
    question: 'Has anyone shown a pattern of broken promises?',
    expected: [],
  },
];

const cooperativeComparisonCases = [
  {
    question: 'How does Bonaventure compare to all other members of the cooperative',
    expectedNamed: ['Bonaventure'],
    expectsCooperative: true,
  },
  {
    question: 'How does Josue compare to the rest of the cooperative?',
    expectedNamed: ['Josue'],
    expectsCooperative: true,
  },
  {
    question: 'Compare Josue and Bonaventure',
    expectedNamed: ['Bonaventure', 'Josue'],
    expectsCooperative: false,
  },
];

async function main(): Promise<void> {
  await connectDB();

  console.log('=== memberNameAppearsInQuestion smoke ===');
  console.log('Bonaventure:', memberNameAppearsInQuestion('Bonaventure', 'Compare Josue and Bonaventure'));

  console.log('\n=== resolveMembersByName ===');
  for (const { question, expected } of nameMatchCases) {
    const resolved = await resolveMembersByName(question);
    const names = resolved.map((m) => m.name).sort();
    const expectedSorted = [...expected].sort();
    const ok =
      names.length === expectedSorted.length &&
      names.every((n, i) => n === expectedSorted[i]);
    console.log(ok ? 'PASS' : 'FAIL', JSON.stringify({ question, names, expected: expectedSorted }));
  }

  console.log('\n=== cooperative comparison detection ===');
  for (const { question, expectedNamed, expectsCooperative } of cooperativeComparisonCases) {
    const resolved = await resolveMembersByName(question);
    const names = resolved.map((m) => m.name).sort();
    const expectedSorted = [...expectedNamed].sort();
    const namesOk =
      names.length === expectedSorted.length &&
      names.every((n, i) => n === expectedSorted[i]);
    const coopOk = questionRequestsCooperativeComparison(question) === expectsCooperative;
    const routeOk =
      resolved.length === 1
        ? expectsCooperative && coopOk
        : !expectsCooperative || !coopOk;
    console.log(
      namesOk && coopOk ? 'PASS' : 'FAIL',
      JSON.stringify({ question, names, expectsCooperative, coopDetected: questionRequestsCooperativeComparison(question), routeOk })
    );
  }

  await disconnectDB();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
