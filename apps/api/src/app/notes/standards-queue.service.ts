import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { NotesClientService } from '@icore/notes-client';
import { AiClientService } from '@icore/ai-client';
import type { OrgProfile, StandardControl, StandardsResult } from '@icore/shared';

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

      // Parse URL manually so pg-boss gets individual params.
      // Avoids Windows DNS misrouting the dotted Supabase username as a hostname,
      // and lets us inject ssl + noSupervisor for pooler connections.
      const url = new URL(connectionString);
      const isPooler = url.hostname.includes('pooler.supabase.com');
      this.boss = new PgBoss({
        host: url.hostname,
        port: url.port ? parseInt(url.port, 10) : 5432,
        database: url.pathname.slice(1),
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        ssl: { rejectUnauthorized: false },
        // Pooler connections don't support LISTEN/NOTIFY — use polling only.
        noSupervisor: isPooler,
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

      const controls: StandardControl[] = aiResults.flatMap((r) =>
        r.controls.map((c) => ({
          code: c.id,
          title: c.title,
          description: c.description,
          implementation: c.implementationGuidance,
          evidence: [],
          frameworkMappings: [{ frameworkId: r.frameworkId, controlCode: c.id }],
          priority: 'high' as const,
          category: 'general',
        })),
      );

      await this.notes.saveStandardsDocument(docId, controls);
      this.logger.log(`Standards job ${job.id} completed`);
    } catch (err) {
      this.logger.error(`Standards job ${job.id} failed: ${(err as Error).message}`);
      await this.notes.failStandardsDocument(docId, (err as Error).message);
      throw err;
    }
  }
}
