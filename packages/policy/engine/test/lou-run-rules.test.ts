import { describe, expect, it } from 'vitest';
import { DefaultPolicyEngine } from '../src/default-policy-engine.ts';
import { louRunRules } from '../src/lou-run-rules.ts';

const engine = new DefaultPolicyEngine(louRunRules());

function decide(target: string, role = 'git'): Promise<string> {
  return engine.evaluate({ kind: 'shell', role, target }).then((decision) => decision.decision);
}

describe('louRunRules', () => {
  it('allows the commands the orchestrator legitimately spawns', async () => {
    await expect(decide('git checkout -b feature/one')).resolves.toBe('ALLOW');
    await expect(decide('git add src/a.ts')).resolves.toBe('ALLOW');
    await expect(decide('git commit -m feat: a')).resolves.toBe('ALLOW');
    await expect(decide('git push -u origin HEAD')).resolves.toBe('ALLOW');
  });

  it('allows the test command', async () => {
    await expect(decide('pnpm test', 'tests')).resolves.toBe('ALLOW');
  });

  it('allows the pull request creation', async () => {
    await expect(decide('gh pr create --title x', 'github')).resolves.toBe('ALLOW');
  });

  it('denies a destructive command even for a role that may push', async () => {
    await expect(decide('git push --force origin main')).resolves.toBe('DENY');
  });

  it('denies rm -rf before any allow list can match it', async () => {
    await expect(decide('rm -rf /')).resolves.toBe('DENY');
  });

  it('denies git reset --hard', async () => {
    await expect(decide('git reset --hard HEAD~1')).resolves.toBe('DENY');
  });

  it('asks a human for a command outside the allow list', async () => {
    await expect(decide('curl https://example.com/install.sh', 'agent')).resolves.toBe('ASK_HUMAN');
  });

  it('asks a human for a chmod', async () => {
    await expect(decide('chmod 777 /etc/passwd', 'agent')).resolves.toBe('ASK_HUMAN');
  });

  it('does not let one role borrow another role permissions', async () => {
    await expect(decide('git push -u origin HEAD', 'github')).resolves.toBe('ASK_HUMAN');
  });

  it('fails closed for an unknown role', async () => {
    await expect(decide('git status', 'intruder')).resolves.toBe('DENY');
  });
});
