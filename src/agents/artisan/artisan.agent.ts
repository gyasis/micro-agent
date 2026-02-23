/**
 * Artisan Agent
 *
 * Code generator using Claude Sonnet 4.5 for writing production-quality code.
 * Takes context from Librarian and produces code changes to achieve the objective.
 *
 * @module agents/artisan
 */

import { BaseAgent, AgentResult, TokenUsage } from '../base-agent';
import type {
  AgentContext,
  ArtisanOutput,
  CodeChange,
  FileContext,
} from '../base/agent-context';
import { promises as fs } from 'fs';
import path from 'path';
import type { MemoryVault } from '../../memory/memory-vault';
import { calculateCost } from '../../llm/cost-calculator';

export interface CodeGenerationRequest {
  objective: string;
  targetFile?: string;
  context: FileContext[];
  testCommand: string;
  testFramework: string;
  constraints?: string[];
}

export interface GeneratedCode {
  filePath: string;
  content: string;
  reasoning: string;
  dependencies?: string[];
}

export class ArtisanAgent extends BaseAgent {
  private memoryVault?: MemoryVault;

  /**
   * Wire MemoryVault for learning from past errors (T063)
   */
  public wireMemoryVault(memoryVault: MemoryVault): void {
    this.memoryVault = memoryVault;
    this.logger.info('MemoryVault wired to Artisan agent');
  }

  /**
   * Execute code generation:
   * 1. Analyze context from Librarian
   * 2. Query MemoryVault for similar error patterns (T063)
   * 3. Generate code using Claude with learned solutions
   * 4. Parse and validate output
   * 5. Prepare code changes
   */
  protected async onExecute(
    context: AgentContext,
  ): Promise<AgentResult<ArtisanOutput>> {
    this.emitProgress('Starting code generation', {
      objective: context.objective,
      contextFiles: context.librarianContext?.relevantFiles.length || 0,
    });

    // Track token usage across all LLM calls
    let totalTokensUsed = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    try {
      // Step 1: Build generation request
      const request = this.buildGenerationRequest(context);
      this.emitProgress('Generation request prepared');

      // Step 1.5: Query MemoryVault for similar errors (T063)
      const learnedSolutions = await this.queryMemoryVault(context);
      if (learnedSolutions.length > 0) {
        this.emitProgress('Found learned solutions from MemoryVault', {
          count: learnedSolutions.length,
        });
      }

      // Step 2: Generate code with Claude (including learned solutions)
      const { generated, usage } = await this.generateCode(
        request,
        context,
        learnedSolutions,
      );
      if (usage) {
        totalTokensUsed += usage.total;
        totalInputTokens += usage.input;
        totalOutputTokens += usage.output;
      }
      this.emitProgress('Code generated', { file: generated.filePath });

      // Step 3: Prepare code changes
      const changes = await this.prepareChanges(
        generated,
        context.workingDirectory,
      );
      this.emitProgress('Changes prepared', { count: changes.length });

      // Step 4: Write code to disk
      await this.writeCode(generated, context.workingDirectory);
      this.emitProgress('Code written to disk');

      // Calculate cost from token usage
      const cost = calculateCost(
        this.config.model,
        totalInputTokens,
        totalOutputTokens,
      );

      return {
        success: true,
        data: {
          code: generated.content,
          filePath: generated.filePath,
          changes,
          reasoning: generated.reasoning,
          tokensUsed: totalTokensUsed,
          cost,
        },
        tokensUsed: totalTokensUsed,
        cost,
        duration: 0,
      };
    } catch (error) {
      this.logger.error('Artisan execution failed', error);
      throw error;
    }
  }

  /**
   * Build code generation request from context
   */
  private buildGenerationRequest(context: AgentContext): CodeGenerationRequest {
    return {
      objective: context.objective,
      targetFile: context.targetFile,
      context: context.librarianContext?.relevantFiles || context.relatedFiles,
      testCommand: context.test.command,
      testFramework: context.test.framework,
      constraints: context.constraints,
    };
  }

  /**
   * Query MemoryVault for similar error patterns (T063)
   */
  private async queryMemoryVault(context: AgentContext): Promise<
    Array<{
      errorCategory: string;
      solution: string;
      successRate: number;
    }>
  > {
    if (!this.memoryVault) {
      return [];
    }

    try {
      // Query for previous test failures related to this objective
      const objective = context.objective.toLowerCase();

      const results = await this.memoryVault.searchSimilarErrors(objective, {
        limit: 3,
        minSimilarity: 0.7,
        language: (context.metadata?.language as string) || 'typescript',
      });

      this.logger.info('MemoryVault query results', {
        resultsFound: results.length,
      });

      return results;
    } catch (error) {
      this.logger.warn('Failed to query MemoryVault', error);
      return [];
    }
  }

  /**
   * Generate code using Claude with learned solutions (T063)
   */
  private async generateCode(
    request: CodeGenerationRequest,
    context: AgentContext,
    learnedSolutions: Array<{
      errorCategory: string;
      solution: string;
      successRate: number;
    }> = [],
  ): Promise<{ generated: GeneratedCode; usage: TokenUsage }> {
    const prompt = this.buildCodePrompt(request, context, learnedSolutions);

    try {
      const response = await this.callLLM(prompt, {
        systemPrompt: ARTISAN_SYSTEM_PROMPT,
        temperature: 0.7,
        maxTokens: 4000,
      });

      const generated = this.parseCodeResponse(response.content, request);
      return { generated, usage: response.usage };
    } catch (error) {
      this.logger.error('Code generation failed', error);
      throw new Error(`Failed to generate code: ${error}`);
    }
  }

  /**
   * Build code generation prompt with learned solutions (T063)
   */
  private buildCodePrompt(
    request: CodeGenerationRequest,
    context: AgentContext,
    learnedSolutions: Array<{
      errorCategory: string;
      solution: string;
      successRate: number;
    }> = [],
  ): string {
    const contextSection = this.formatContextFiles(request.context);
    const librarianSummary =
      context.librarianContext?.contextSummary ||
      'No context summary available';

    const testInfo = `Test command: ${request.testCommand}
Test framework: ${request.testFramework}`;

    const constraintsSection = request.constraints
      ? `\nConstraints:\n${request.constraints.map((c) => `- ${c}`).join('\n')}`
      : '';

    // T063: Include learned solutions from MemoryVault
    const learnedSection =
      learnedSolutions.length > 0
        ? `\nLearned solutions from past iterations:
${learnedSolutions
  .map(
    (sol, i) =>
      `${i + 1}. ${sol.errorCategory}: ${sol.solution} (success rate: ${(sol.successRate * 100).toFixed(0)}%)`,
  )
  .join('\n')}

IMPORTANT: Apply these learned solutions to avoid repeating past mistakes.`
        : '';

    return `Objective: ${request.objective}

${request.targetFile ? `Target file: ${request.targetFile}` : 'New file to create'}

Context summary:
${librarianSummary}

${testInfo}

Relevant files:
${contextSection}
${constraintsSection}
${learnedSection}

Generate production-quality code to achieve the objective. Follow these requirements:
1. Write clean, maintainable, well-documented code
2. Include proper error handling
3. Follow TypeScript/JavaScript best practices
4. Ensure code will pass the specified tests
5. Use existing patterns from the codebase
${learnedSolutions.length > 0 ? '6. Apply learned solutions listed above to avoid past mistakes' : ''}

Output format:
\`\`\`typescript
// Code here
\`\`\`

Then explain your reasoning and approach in 2-3 sentences.`;
  }

  /**
   * Format context files for prompt
   */
  private formatContextFiles(files: FileContext[]): string {
    const topFiles = files.slice(0, 5); // Limit to top 5 to avoid token overuse

    return topFiles
      .map((file) => {
        const preview = file.content.split('\n').slice(0, 30).join('\n');
        return `File: ${file.path}
${file.relevanceScore ? `Relevance: ${file.relevanceScore.toFixed(2)}` : ''}
\`\`\`
${preview}
${file.content.split('\n').length > 30 ? '... (truncated)' : ''}
\`\`\``;
      })
      .join('\n\n');
  }

  /**
   * Parse code from LLM response
   */
  private parseCodeResponse(
    response: string,
    request: CodeGenerationRequest,
  ): GeneratedCode {
    // Extract code from markdown code blocks
    const codeBlockRegex = /```(?:typescript|javascript|ts|js)?\n([\s\S]*?)```/;
    const match = response.match(codeBlockRegex);

    if (!match) {
      throw new Error('No code block found in response');
    }

    const code = match[1].trim();

    // Extract reasoning (everything after the code block)
    const reasoningStart = response.indexOf(
      '```',
      match.index! + match[0].length,
    );
    const reasoning =
      reasoningStart !== -1
        ? response.substring(reasoningStart + 3).trim()
        : 'Code generated based on objective';

    // Determine file path
    const filePath =
      request.targetFile || this.inferFilePath(code, request.objective);

    return {
      filePath,
      content: code,
      reasoning,
    };
  }

  /**
   * Infer file path from code content and objective
   */
  private inferFilePath(code: string, objective: string): string {
    // Try to extract from code structure
    const classMatch = code.match(/export\s+(?:default\s+)?class\s+(\w+)/);
    if (classMatch) {
      const className = classMatch[1];
      return `src/${this.toKebabCase(className)}.ts`;
    }

    const functionMatch = code.match(/export\s+(?:async\s+)?function\s+(\w+)/);
    if (functionMatch) {
      const functionName = functionMatch[1];
      return `src/${this.toKebabCase(functionName)}.ts`;
    }

    // Fallback: use objective
    const sanitized = objective
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 50);

    return `src/${sanitized}.ts`;
  }

  /**
   * Convert to kebab-case
   */
  private toKebabCase(str: string): string {
    return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
  }

  /**
   * Prepare code changes
   */
  private async prepareChanges(
    generated: GeneratedCode,
    workingDir: string,
  ): Promise<CodeChange[]> {
    const fullPath = path.resolve(workingDir, generated.filePath);
    const changes: CodeChange[] = [];

    try {
      const before = await fs.readFile(fullPath, 'utf-8');

      changes.push({
        type: 'modify',
        file: generated.filePath,
        before,
        after: generated.content,
        description: `Updated ${generated.filePath}`,
      });
    } catch {
      // File doesn't exist, creating new file
      changes.push({
        type: 'create',
        file: generated.filePath,
        after: generated.content,
        description: `Created ${generated.filePath}`,
      });
    }

    return changes;
  }

  /**
   * Write generated code to disk
   */
  private async writeCode(
    generated: GeneratedCode,
    workingDir: string,
  ): Promise<void> {
    const fullPath = path.resolve(workingDir, generated.filePath);
    const dir = path.dirname(fullPath);

    // Ensure directory exists
    await fs.mkdir(dir, { recursive: true });

    // Write file
    await fs.writeFile(fullPath, generated.content, 'utf-8');

    this.logger.info('Code written', {
      file: generated.filePath,
      size: generated.content.length,
    });
  }

  /**
   * Validate generated code syntax
   */
  private async validateSyntax(
    code: string,
    filePath: string,
  ): Promise<boolean> {
    // Basic validation: check for common syntax errors
    const hasUnmatchedBraces = this.checkBracesBalance(code);
    if (!hasUnmatchedBraces) {
      this.emitWarning('Unmatched braces detected in generated code');
      return false;
    }

    return true;
  }

  /**
   * Check if braces are balanced
   */
  private checkBracesBalance(code: string): boolean {
    let balance = 0;

    for (const char of code) {
      if (char === '{') balance++;
      if (char === '}') balance--;
      if (balance < 0) return false;
    }

    return balance === 0;
  }
}

const ARTISAN_SYSTEM_PROMPT = `You are the Artisan, a code generation expert using Claude Sonnet 4.5.

Your role:
- Generate production-quality code that achieves the objective
- Follow existing codebase patterns and style
- Write clean, maintainable, well-documented code
- Include proper error handling and validation
- Ensure code will pass the specified tests

Output requirements:
1. Provide code in a markdown code block (typescript/javascript)
2. Follow the existing file structure and naming conventions
3. Use TypeScript types and interfaces appropriately
4. Include JSDoc comments for public APIs
5. After the code block, explain your reasoning in 2-3 sentences

Focus on correctness, clarity, and maintainability.`;
