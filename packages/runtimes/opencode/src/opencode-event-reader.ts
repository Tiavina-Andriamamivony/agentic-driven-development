import type { AgentActivity } from '@lou/agent-runtime';
import { parseOpenCodeEvent } from './opencode-events.ts';

export class OpenCodeEventReader {
  private buffer = '';
  private readonly answer: string[] = [];

  constructor(private readonly emit: (activity: AgentActivity) => void) {}

  push(chunk: string): void {
    this.buffer += chunk;
    for (const line of this.takeLines()) {
      this.deliver(line);
    }
  }

  finish(): void {
    const rest = this.buffer;
    this.buffer = '';
    if (rest.trim() !== '') {
      this.deliver(rest);
    }
  }

  answerText(): string {
    return this.answer.join('\n');
  }

  private takeLines(): readonly string[] {
    const segments = this.buffer.split('\n');
    this.buffer = segments.pop() ?? '';
    return segments;
  }

  private deliver(line: string): void {
    const activity = parseOpenCodeEvent(line);
    if (activity === undefined) {
      return;
    }
    if (activity.kind === 'text') {
      this.answer.push(activity.text);
    }
    this.emit(activity);
  }
}
