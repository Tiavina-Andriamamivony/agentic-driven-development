import type { ApprovalDecision, ApprovalRequest, HumanKeeper } from '@lou/orchestrator';
import type { Styler } from '../ux/style.ts';
import { createStyler } from '../ux/style.ts';
import { gateLines } from './trace-render.ts';

interface TerminalKeeperOptions {
  readonly ask: (question: string) => Promise<string>;
  readonly out: (line: string) => void;
  readonly style?: Styler;
}

export function createTerminalKeeper(options: TerminalKeeperOptions): HumanKeeper {
  const style = options.style ?? createStyler(false);
  return {
    async askClarifications(questions: readonly string[]): Promise<readonly string[]> {
      const answers: string[] = [];
      for (const question of questions) {
        answers.push(await options.ask(`${question} `));
      }
      return answers;
    },
    async decide(request: ApprovalRequest): Promise<ApprovalDecision> {
      for (const line of gateLines({
        kind: request.kind,
        subject: request.subject,
        details: request.details,
        style,
      })) {
        options.out(line);
      }
      const answer = await options.ask(`Approve ${request.kind}? [y/N] `);
      return { approved: isApproval(answer) };
    },
  };
}

function isApproval(answer: string): boolean {
  return /^y(?:es)?$/i.test(answer.trim());
}
