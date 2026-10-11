/**
 * @jest-environment node
 *
 * The tenant-isolation audit found that lint had already named the leaking
 * upload-session handlers with "'user' is assigned a value but never used",
 * but the finding was a warning and CI never ran lint. `npm run lint` is
 * `next lint`, and next lint fails the process only when
 * `ESLint.getErrorResults` is non-empty — warnings do not.
 */

import fs from 'fs';
import path from 'path';

const RULE = '@typescript-eslint/no-unused-vars';
const SESSIONS_ROUTE = 'src/app/api/upload/sessions/route.ts';

interface LintMessage {
  ruleId: string | null;
  severity: number;
  message: string;
}
interface LintResult {
  messages: LintMessage[];
  errorCount: number;
  warningCount: number;
}
interface EslintCtor {
  new (opts: { cwd: string }): {
    lintText(code: string, opts: { filePath: string }): Promise<LintResult[]>;
  };
  getErrorResults(results: LintResult[]): LintResult[];
}
const { ESLint } = require('eslint') as { ESLint: EslintCtor };

interface WorkflowStep {
  name?: string;
  run?: string;
  if?: string;
  'continue-on-error'?: boolean;
}
interface WorkflowJob {
  steps?: WorkflowStep[];
  'continue-on-error'?: boolean;
}
interface Workflow {
  on?: {
    push?: { branches?: string[] };
    pull_request?: { branches?: string[] };
  };
  jobs?: Record<string, WorkflowJob>;
}

async function lint(code: string): Promise<LintResult> {
  const eslint = new ESLint({ cwd: process.cwd() });
  const [result] = await eslint.lintText(code, { filePath: SESSIONS_ROUTE });
  return result;
}

function unusedVarMessages(result: LintResult): LintMessage[] {
  return result.messages.filter((message) => message.ruleId === RULE);
}

describe('unused bindings fail the lint step CI runs', () => {
  it('reports an unused user binding as an error that fails next lint', async () => {
    const result = await lint(
      [
        'export async function POST() {',
        "  const user = { id: 'alice' };",
        '  return Response.json({ ok: true });',
        '}',
        '',
      ].join('\n')
    );

    const unused = unusedVarMessages(result);
    expect(unused).toHaveLength(1);
    expect(unused[0].severity).toBe(2);
    expect(unused[0].message).toContain("'user' is assigned a value but never used");
    expect(result.errorCount).toBe(1);
    expect(result.warningCount).toBe(0);
    // Same predicate next lint uses to decide the process should exit 1.
    expect(ESLint.getErrorResults([result])).toHaveLength(1);
  });

  it('accepts a handler that actually uses the binding', async () => {
    const result = await lint(
      [
        'export async function POST() {',
        "  const user = { id: 'alice' };",
        '  return Response.json({ id: user.id });',
        '}',
        '',
      ].join('\n')
    );

    expect(unusedVarMessages(result)).toHaveLength(0);
    expect(ESLint.getErrorResults([result])).toHaveLength(0);
  });

  it('still allows underscore-prefixed bindings', async () => {
    const result = await lint(
      [
        'export async function POST(_request: Request) {',
        "  const _user = { id: 'alice' };",
        '  return Response.json({ ok: true });',
        '}',
        '',
      ].join('\n')
    );

    expect(unusedVarMessages(result)).toHaveLength(0);
    expect(ESLint.getErrorResults([result])).toHaveLength(0);
  });

  it('runs npm run lint on pull requests to main, and a failure fails the job', () => {
    const yaml = require('js-yaml') as { load(source: string): unknown };
    const workflow = yaml.load(
      fs.readFileSync(path.join(process.cwd(), '.github/workflows/ci.yml'), 'utf8')
    ) as Workflow;

    expect(workflow.on?.pull_request?.branches).toContain('main');
    expect(workflow.on?.push?.branches).toContain('main');

    const job = workflow.jobs?.ci;
    expect(job).toBeDefined();
    expect(job?.['continue-on-error']).not.toBe(true);

    const lintSteps = (job?.steps ?? []).filter((step) => step.run?.trim() === 'npm run lint');
    expect(lintSteps).toHaveLength(1);
    expect(lintSteps[0]['continue-on-error']).not.toBe(true);
    expect(lintSteps[0].if).toBeUndefined();

    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')) as {
      scripts?: { lint?: string };
    };
    expect(pkg.scripts?.lint).toBe('next lint');
  });
});
