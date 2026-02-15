// Direct test of our new test runner
import { createTestRunner } from './src/testing/test-runner';
import { createLogger } from './src/utils/logger';

const logger = createLogger();
const runner = createTestRunner(logger);

// Test with the simple example we created
async function demo() {
  console.log('🧪 Testing new test runner...\n');

  const result = await runner.runTests({
    workingDirectory: './test-example',
    testCommand: 'npx vitest run simple.test.ts --reporter=json',
    timeout: 30000,
  });

  console.log('\n📊 Results:');
  console.log(`Success: ${result.success}`);
  console.log(`Framework: ${result.results.framework}`);
  console.log(`Total tests: ${result.results.summary.total}`);
  console.log(`Passed: ${result.results.summary.passed}`);
  console.log(`Failed: ${result.results.summary.failed}`);
  console.log(`Duration: ${result.duration}ms`);
}

demo().catch(console.error);
