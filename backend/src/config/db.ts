import { connectCockroachDB, disconnectCockroachDB } from '../db/index.js';

export async function connectDB(): Promise<void> {
  await connectCockroachDB();
}

export async function disconnectDB(): Promise<void> {
  await disconnectCockroachDB();
}
