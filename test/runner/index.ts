import * as fs from "node:fs";
import * as path from "node:path";

/** Default timeout in milliseconds for each test and hook. */
const DEFAULT_TIMEOUT_MS = 60000;

/** The `this` value of a test or hook callback; only `timeout` is supported. */
interface RunnerContext {
  timeout(ms: number): void;
}

/** A test or hook callback; may return a promise. */
type Callback = (this: RunnerContext) => unknown;

/** One registered test. */
interface TestCase {
  title: string;
  fn: Callback;
}

/** A suite with its hooks, tests, and nested suites. */
interface Suite {
  title: string;
  parent: Suite | undefined;
  suiteSetups: Callback[];
  suiteTeardowns: Callback[];
  setups: Callback[];
  teardowns: Callback[];
  tests: TestCase[];
  children: Suite[];
}

/** Creates an empty suite. */
function newSuite(title: string, parent: Suite | undefined): Suite {
  return {
    title,
    parent,
    suiteSetups: [],
    suiteTeardowns: [],
    setups: [],
    teardowns: [],
    tests: [],
    children: [],
  };
}

/** Result counters for the whole run. */
interface Counts {
  passing: number;
  failing: number;
}

/** Recursively lists files under `dir` whose name ends in `.test.js`, sorted. */
function findTestFiles(dir: string): string[] {
  const found: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...findTestFiles(full));
    } else if (entry.name.endsWith(".test.js")) {
      found.push(full);
    }
  }
  return found;
}

/** Runs one callback with a timeout; rejects on throw, rejection, or timeout. */
async function runCallback(fn: Callback, label: string): Promise<void> {
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  const ctx: RunnerContext = {
    timeout(ms: number): void {
      timeoutMs = ms;
    },
  };
  let timer: NodeJS.Timeout | undefined;
  // The callback runs first so that this.timeout() inside it is read before the timer starts.
  const result = Promise.resolve().then(() => fn.call(ctx));
  const limit = new Promise<never>((_, reject) => {
    // Start the timer on the next tick, after a synchronous this.timeout() call.
    setImmediate(() => {
      if (timeoutMs > 0) {
        timer = setTimeout(
          () => reject(new Error(`Timeout of ${timeoutMs}ms exceeded: ${label}`)),
          timeoutMs,
        );
      }
    });
  });
  try {
    await Promise.race([result, limit]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

/** Formats an error for the one-line report. */
function describeError(err: unknown): string {
  return err instanceof Error ? (err.stack ?? err.message) : String(err);
}

/** Runs a suite: suiteSetup, tests (each with setup and teardown), children, suiteTeardown. */
async function runSuite(suite: Suite, counts: Counts, depth: number): Promise<void> {
  const indent = "  ".repeat(depth);
  if (suite.title) {
    console.log(`${indent}${suite.title}`);
  }
  const inner = suite.title ? depth + 1 : depth;
  const pad = "  ".repeat(inner);

  // Hooks that run before every test in this suite include those of its ancestors.
  const eachSetups: Callback[] = [];
  const eachTeardowns: Callback[] = [];
  for (let s: Suite | undefined = suite; s; s = s.parent) {
    eachSetups.unshift(...s.setups);
    eachTeardowns.push(...s.teardowns);
  }

  let setupFailed = false;
  for (const hook of suite.suiteSetups) {
    try {
      await runCallback(hook, `${suite.title} suiteSetup`);
    } catch (err) {
      counts.failing++;
      setupFailed = true;
      console.log(`${pad}FAIL suiteSetup hook: ${describeError(err)}`);
      break;
    }
  }

  if (!setupFailed) {
    for (const t of suite.tests) {
      try {
        for (const hook of eachSetups) {
          await runCallback(hook, `${suite.title} setup`);
        }
        await runCallback(t.fn, t.title);
        counts.passing++;
        console.log(`${pad}PASS ${t.title}`);
      } catch (err) {
        counts.failing++;
        console.log(`${pad}FAIL ${t.title}: ${describeError(err)}`);
      }
      // Teardown hooks always run, even after a failed test.
      for (const hook of eachTeardowns) {
        try {
          await runCallback(hook, `${suite.title} teardown`);
        } catch (err) {
          counts.failing++;
          console.log(`${pad}FAIL teardown hook: ${describeError(err)}`);
        }
      }
    }
    for (const child of suite.children) {
      await runSuite(child, counts, inner);
    }
  }

  for (const hook of suite.suiteTeardowns) {
    try {
      await runCallback(hook, `${suite.title} suiteTeardown`);
    } catch (err) {
      counts.failing++;
      console.log(`${pad}FAIL suiteTeardown hook: ${describeError(err)}`);
    }
  }
}

/** Installs the TDD globals, loads every integration spec, runs them, and rejects on any failure. */
export async function run(): Promise<void> {
  const root = newSuite("", undefined);
  let current = root;
  const g = globalThis as unknown as Record<string, unknown>;

  g.suite = (title: string, fn: () => void): void => {
    const child = newSuite(title, current);
    current.children.push(child);
    const saved = current;
    current = child;
    try {
      fn.call({});
    } finally {
      current = saved;
    }
  };
  g.test = (title: string, fn: Callback): void => {
    current.tests.push({ title, fn });
  };
  g.suiteSetup = (fn: Callback): void => {
    current.suiteSetups.push(fn);
  };
  g.suiteTeardown = (fn: Callback): void => {
    current.suiteTeardowns.push(fn);
  };
  g.setup = (fn: Callback): void => {
    current.setups.push(fn);
  };
  g.teardown = (fn: Callback): void => {
    current.teardowns.push(fn);
  };

  // This file compiles to out-test/test/runner/index.js; specs are in ../integration.
  const specDir = path.resolve(__dirname, "..", "integration");
  for (const file of findTestFiles(specDir)) {
    require(file);
  }

  const counts: Counts = { passing: 0, failing: 0 };
  await runSuite(root, counts, 0);
  console.log(`${counts.passing} passing, ${counts.failing} failing`);
  if (counts.failing > 0) {
    throw new Error(`${counts.failing} test(s) failed`);
  }
}
