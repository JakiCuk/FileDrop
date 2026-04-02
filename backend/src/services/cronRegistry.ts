import cron, { ScheduledTask } from "node-cron";
import { PrismaClient } from "@prisma/client";
import { sendAdminNotification } from "./adminNotify";

const prisma = new PrismaClient();

interface JobDefinition {
  id: string;
  name: string;
  description: string;
  defaultSchedule: string;
  handler: () => Promise<void> | void;
}

interface ActiveJob {
  def: JobDefinition;
  task: ScheduledTask | null;
  schedule: string;
  enabled: boolean;
  lastRunAt: Date | null;
}

class CronRegistry {
  private jobs = new Map<string, ActiveJob>();
  private definitions: JobDefinition[] = [];

  register(def: JobDefinition): void {
    this.definitions.push(def);
  }

  async init(): Promise<void> {
    for (const def of this.definitions) {
      const row = await prisma.cronJob.findUnique({ where: { id: def.id } });

      if (row) {
        const schedule = row.schedule;
        const enabled = row.enabled;
        const job: ActiveJob = {
          def,
          task: null,
          schedule,
          enabled,
          lastRunAt: null,
        };
        this.jobs.set(def.id, job);
        if (enabled) this.startTask(job);
      } else {
        await prisma.cronJob.create({
          data: {
            id: def.id,
            name: def.name,
            description: def.description,
            schedule: def.defaultSchedule,
            enabled: true,
          },
        });
        const job: ActiveJob = {
          def,
          task: null,
          schedule: def.defaultSchedule,
          enabled: true,
          lastRunAt: null,
        };
        this.jobs.set(def.id, job);
        this.startTask(job);
      }

      console.log(`[CronRegistry] Registered: ${def.id} (${this.jobs.get(def.id)!.schedule})`);
    }
  }

  private startTask(job: ActiveJob): void {
    if (job.task) {
      job.task.stop();
      job.task = null;
    }
    if (!cron.validate(job.schedule)) {
      console.error(`[CronRegistry] Invalid schedule for ${job.def.id}: ${job.schedule}`);
      return;
    }
    job.task = cron.schedule(job.schedule, async () => {
      job.lastRunAt = new Date();
      console.log(`[CronRegistry] Running: ${job.def.id}`);
      try {
        await job.def.handler();
      } catch (err) {
        console.error(`[CronRegistry] Error in ${job.def.id}:`, err);
        sendAdminNotification("cron_error", {
          jobId: job.def.id,
          jobName: job.def.name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });
  }

  async updateJob(
    id: string,
    updates: { schedule?: string; enabled?: boolean },
  ): Promise<{ schedule: string; enabled: boolean } | null> {
    const job = this.jobs.get(id);
    if (!job) return null;

    if (updates.schedule !== undefined) {
      if (!cron.validate(updates.schedule)) {
        throw new Error(`Invalid cron expression: ${updates.schedule}`);
      }
      job.schedule = updates.schedule;
    }
    if (updates.enabled !== undefined) {
      job.enabled = updates.enabled;
    }

    await prisma.cronJob.update({
      where: { id },
      data: {
        schedule: job.schedule,
        enabled: job.enabled,
      },
    });

    if (job.task) {
      job.task.stop();
      job.task = null;
    }
    if (job.enabled) {
      this.startTask(job);
    }

    return { schedule: job.schedule, enabled: job.enabled };
  }

  async runNow(id: string): Promise<boolean> {
    const job = this.jobs.get(id);
    if (!job) return false;
    job.lastRunAt = new Date();
    await job.def.handler();
    return true;
  }

  getAll(): Array<{
    id: string;
    name: string;
    description: string;
    schedule: string;
    enabled: boolean;
    lastRunAt: Date | null;
    nextRunAt: string;
  }> {
    const result: Array<{
      id: string;
      name: string;
      description: string;
      schedule: string;
      enabled: boolean;
      lastRunAt: Date | null;
      nextRunAt: string;
    }> = [];

    for (const [, job] of this.jobs) {
      result.push({
        id: job.def.id,
        name: job.def.name,
        description: job.def.description,
        schedule: job.schedule,
        enabled: job.enabled,
        lastRunAt: job.lastRunAt,
        nextRunAt: job.enabled ? this.computeNextRun(job.schedule) : "",
      });
    }

    return result;
  }

  getJob(id: string): ActiveJob | undefined {
    return this.jobs.get(id);
  }

  private computeNextRun(schedule: string): string {
    try {
      const parts = schedule.split(/\s+/);
      if (parts.length !== 5) return "";
      const [minute, hour, , ,] = parts;
      const now = new Date();

      if (hour.startsWith("*/")) {
        const interval = parseInt(hour.slice(2), 10);
        const min = minute === "*" ? 0 : parseInt(minute, 10);
        const next = new Date(now);
        const currentHour = now.getHours();
        const nextHour = Math.ceil((currentHour + (now.getMinutes() > min ? 1 : 0)) / interval) * interval;
        next.setHours(nextHour, min, 0, 0);
        if (next <= now) next.setHours(next.getHours() + interval);
        return next.toISOString();
      }

      if (minute.startsWith("*/")) {
        const interval = parseInt(minute.slice(2), 10);
        const next = new Date(now);
        const currentMin = now.getMinutes();
        const nextMin = Math.ceil((currentMin + 1) / interval) * interval;
        next.setMinutes(nextMin, 0, 0);
        if (next <= now) next.setMinutes(next.getMinutes() + interval);
        return next.toISOString();
      }

      if (/^\d+$/.test(minute) && /^\d+$/.test(hour)) {
        const h = parseInt(hour, 10);
        const m = parseInt(minute, 10);
        const next = new Date(now);
        next.setHours(h, m, 0, 0);
        if (next <= now) next.setDate(next.getDate() + 1);
        return next.toISOString();
      }

      return "";
    } catch {
      return "";
    }
  }
}

export const cronRegistry = new CronRegistry();
