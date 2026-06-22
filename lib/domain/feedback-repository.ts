import { randomUUID } from 'crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { Feedback } from './feedback-types';

const DATA_DIR = join(process.cwd(), '.data');
const DATA_FILE = join(DATA_DIR, 'feedback.json');

function readAll(): Feedback[] {
  try {
    return JSON.parse(readFileSync(DATA_FILE, 'utf-8')) as Feedback[];
  } catch {
    return [];
  }
}

function writeAll(items: Feedback[]): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(DATA_FILE, JSON.stringify(items, null, 2));
}

export interface FeedbackRepository {
  listByOrg(orgId: string): Promise<Feedback[]>;
  create(orgId: string, period: string, body: string, receipt?: string): Promise<Feedback>;
}

class JsonFeedbackRepository implements FeedbackRepository {
  async listByOrg(orgId: string): Promise<Feedback[]> {
    return readAll().filter((f) => f.orgId === orgId);
  }

  async create(orgId: string, period: string, body: string, receipt?: string): Promise<Feedback> {
    const all = readAll();
    const feedback: Feedback = {
      id: randomUUID(),
      orgId,
      period,
      body,
      receipt,
      createdAt: new Date().toISOString(),
    };
    writeAll([...all, feedback]);
    return feedback;
  }
}

export const feedbackRepository: FeedbackRepository = new JsonFeedbackRepository();
