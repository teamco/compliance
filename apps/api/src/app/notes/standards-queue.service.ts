import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { NotesClientService } from '@icore/notes-client';
import { AiClientService } from '@icore/ai-client';
import type { DocumentStandard, OrgProfile, StandardsResult } from '@icore/shared';

// pg-boss is ESM-only; loaded via dynamic import at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PgBoss = any;

const QUEUE_NAME = 'standards.generate';

interface StandardsJobData {
  docId: string;
  orgProfile: OrgProfile;
  frameworkIds: string[];
}

@Injectable()
export class StandardsQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StandardsQueueService.name);
  private boss: PgBoss | null = null;

  constructor(
    private readonly notes: NotesClientService,
    private readonly ai: AiClientService,
  ) {}

  async onModuleInit() {
    const connectionString = process.env['DATABASE_URL'];
    if (!connectionString) {
      this.logger.warn('DATABASE_URL not set — standards queue disabled');
      return;
    }

    try {
      this.logger.log('Connecting to pg-boss...');
      const { PgBoss } = await import('pg-boss');

      // Pass connectionString directly — pg's own parser handles dotted Supabase
      // pooler usernames and special-char passwords more reliably than new URL().
      // ssl is required by Supabase (direct host and pooler both).
      this.boss = new PgBoss({
        connectionString,
        ssl: { rejectUnauthorized: false },
        max: 5,
      });

      this.boss.on('error', (err: Error) => this.logger.error(`pg-boss error: ${err.message}`));

      await this.boss.start();
      this.logger.log('pg-boss started, creating queue...');

      await this.boss.createQueue(QUEUE_NAME);
      this.logger.log(`Queue "${QUEUE_NAME}" ready`);

      await this.boss.work(
        QUEUE_NAME,
        { newJobCheckIntervalSeconds: 5 },
        async (jobs: Array<{ id: string; data: StandardsJobData }>) => {
          this.logger.log(`Received ${jobs.length} job(s)`);
          for (const job of jobs) {
            await this.process(job);
          }
        },
      );

      this.logger.log('Standards queue worker started — waiting for jobs');
    } catch (err) {
      this.logger.error(
        `Standards queue failed to start (queue disabled): ${(err as Error).message}`,
      );
    }
  }

  async onModuleDestroy() {
    await this.boss?.stop({ graceful: true });
  }

  async enqueue(docId: string, orgProfile: OrgProfile, frameworkIds: string[]): Promise<void> {
    if (!this.boss) {
      this.logger.warn(`Queue not available — job for doc ${docId} dropped`);
      return;
    }
    const jobId = await this.boss.send(QUEUE_NAME, { docId, orgProfile, frameworkIds });
    this.logger.log(`Enqueued job ${jobId} for doc ${docId}`);
  }

  private async process(job: { id: string; data: StandardsJobData }): Promise<void> {
    const { docId, orgProfile, frameworkIds } = job.data;
    this.logger.log(`Processing standards job ${job.id} for doc ${docId}`);

    try {
      const aiResults: StandardsResult[] = await this.ai.generateStandards(
        orgProfile,
        frameworkIds,
      );

      const standards: DocumentStandard[] = aiResults.flatMap((r) =>
        r.standards.map((s) => ({
          code: s.id,
          title: s.title,
          objective: s.objective,
          scope: s.scope,
          requirements: s.requirements,
          frameworkMappings: [{ frameworkId: r.frameworkId, standardCode: s.id }],
        })),
      );

      await this.notes.saveStandardsDocument(docId, standards);
      this.logger.log(`Standards job ${job.id} completed`);
    } catch (err) {
      this.logger.error(`Standards job ${job.id} failed: ${(err as Error).message}`);
      await this.notes.failStandardsDocument(docId, (err as Error).message);
      throw err;
    }
  }
}
