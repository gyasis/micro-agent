/**
 * Librarian Agent
 *
 * Context provider using Gemini 2.0 Pro for analyzing codebases and ranking files.
 * Responsible for dependency analysis and context gathering before code generation.
 *
 * @module agents/librarian
 */

import { BaseAgent, AgentResult, TokenUsage } from '../base-agent';
import type { AgentContext, LibrarianOutput, FileContext, DependencyNode } from '../base/agent-context';
import { promises as fs } from 'fs';
import path from 'path';
import { glob } from 'glob';
import { calculateCost } from '../../llm/cost-calculator';

export class LibrarianAgent extends BaseAgent {
  /**
   * Execute librarian analysis:
   * 1. Discover relevant files
   * 2. Build dependency graph
   * 3. Rank files by relevance
   * 4. Summarize context for Artisan
   */
  protected async onExecute(context: AgentContext): Promise<AgentResult<LibrarianOutput>> {
    this.emitProgress('Starting context analysis', {
      workingDir: context.workingDirectory,
      targetFile: context.targetFile,
    });

    // Track token usage across all LLM calls
    let totalTokensUsed = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    try {
      // Step 1: Discover files
      const files = await this.discoverFiles(
        context.workingDirectory,
        context.targetFile
      );
      this.emitProgress(`Discovered ${files.length} files`, { count: files.length });

      // Step 2: Read and analyze files
      const fileContexts = await this.analyzeFiles(files, context.workingDirectory);
      this.emitProgress('Files analyzed', { count: fileContexts.length });

      // Step 3: Build dependency graph
      const dependencyGraph = await this.buildDependencyGraph(fileContexts);
      this.emitProgress('Dependency graph built', {
        nodes: dependencyGraph.length,
      });

      // Step 4: Rank files by relevance
      const { rankedFiles, usage: rankingUsage } = await this.rankFiles(
        fileContexts,
        dependencyGraph,
        context.targetFile,
        context.objective
      );
      if (rankingUsage) {
        totalTokensUsed += rankingUsage.total;
        totalInputTokens += rankingUsage.input;
        totalOutputTokens += rankingUsage.output;
      }
      this.emitProgress('Files ranked', { topFiles: rankedFiles.slice(0, 5).map(f => f.path) });

      // Step 5: Generate context summary (pass escalationContext so prior attempts are included)
      const { summary: contextSummary, usage: summaryUsage } = await this.generateContextSummary(
        rankedFiles,
        dependencyGraph,
        context.objective,
        context.escalationContext
      );
      if (summaryUsage) {
        totalTokensUsed += summaryUsage.total;
        totalInputTokens += summaryUsage.input;
        totalOutputTokens += summaryUsage.output;
      }

      this.emitProgress('Context summary generated');

      // Calculate cost from token usage
      const cost = calculateCost(this.config.model, totalInputTokens, totalOutputTokens);

      return {
        success: true,
        data: {
          relevantFiles: rankedFiles,
          dependencyGraph,
          contextSummary,
          tokensUsed: totalTokensUsed,
          cost,
        },
        tokensUsed: totalTokensUsed,
        cost,
        duration: 0,
      };
    } catch (error) {
      this.logger.error('Librarian execution failed', error);
      throw error;
    }
  }

  /**
   * Discover relevant files in working directory
   */
  private async discoverFiles(
    workingDir: string,
    targetFile?: string
  ): Promise<string[]> {
    const patterns = [
      '**/*.ts',
      '**/*.tsx',
      '**/*.js',
      '**/*.jsx',
      '!node_modules/**',
      '!dist/**',
      '!build/**',
      '!coverage/**',
      '!**/*.test.ts',
      '!**/*.test.js',
      '!**/*.spec.ts',
      '!**/*.spec.js',
    ];

    const files = await glob(patterns, {
      cwd: workingDir,
      absolute: true,
      nodir: true,
    });

    // If target file specified, prioritize it
    if (targetFile) {
      const targetPath = path.resolve(workingDir, targetFile);
      if (!files.includes(targetPath)) {
        files.unshift(targetPath);
      }
    }

    return files;
  }

  /**
   * Analyze files and create file contexts
   */
  private async analyzeFiles(
    files: string[],
    workingDir: string
  ): Promise<FileContext[]> {
    const contexts: FileContext[] = [];

    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const stats = await fs.stat(file);

        contexts.push({
          path: path.relative(workingDir, file),
          content,
          lastModified: stats.mtime,
          dependencies: this.extractImports(content),
        });
      } catch (error) {
        this.logger.warn(`Failed to analyze file: ${file}`, error);
      }
    }

    return contexts;
  }

  /**
   * Extract import statements from file content
   */
  private extractImports(content: string): string[] {
    const imports: string[] = [];

    // ES6 imports
    const importRegex = /import\s+.*?from\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }

    // CommonJS requires
    const requireRegex = /require\(['"]([^'"]+)['"]\)/g;
    while ((match = requireRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }

    return imports;
  }

  /**
   * Build dependency graph from file contexts
   */
  private async buildDependencyGraph(
    fileContexts: FileContext[]
  ): Promise<DependencyNode[]> {
    const nodes: DependencyNode[] = [];
    const fileMap = new Map<string, FileContext>();

    // Create file map
    for (const ctx of fileContexts) {
      fileMap.set(ctx.path, ctx);
    }

    // Build nodes
    for (const ctx of fileContexts) {
      const imports = ctx.dependencies || [];
      const dependsOn: string[] = [];
      const dependedBy: string[] = [];

      // Resolve imports to actual files
      for (const imp of imports) {
        // Skip external packages
        if (!imp.startsWith('.') && !imp.startsWith('/')) {
          continue;
        }

        // Find matching file
        const resolved = this.resolveImport(imp, ctx.path, fileContexts);
        if (resolved) {
          dependsOn.push(resolved);
        }
      }

      nodes.push({
        file: ctx.path,
        imports,
        exports: this.extractExports(ctx.content),
        dependsOn,
        dependedBy, // Will be filled in next step
        distance: 0, // Will be calculated later
      });
    }

    // Fill dependedBy relationships
    for (const node of nodes) {
      for (const dep of node.dependsOn) {
        const depNode = nodes.find(n => n.file === dep);
        if (depNode) {
          depNode.dependedBy.push(node.file);
        }
      }
    }

    return nodes;
  }

  /**
   * Resolve import path to actual file
   */
  private resolveImport(
    importPath: string,
    fromFile: string,
    fileContexts: FileContext[]
  ): string | null {
    const fromDir = path.dirname(fromFile);
    const resolved = path.normalize(path.join(fromDir, importPath));

    // Try exact match
    const exactMatch = fileContexts.find(f => f.path === resolved);
    if (exactMatch) return exactMatch.path;

    // Try with extensions
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.js'];
    for (const ext of extensions) {
      const withExt = resolved + ext;
      const match = fileContexts.find(f => f.path === withExt);
      if (match) return match.path;
    }

    return null;
  }

  /**
   * Extract export statements from file content
   */
  private extractExports(content: string): string[] {
    const exports: string[] = [];

    // Named exports
    const namedRegex = /export\s+(?:const|let|var|function|class|interface|type|enum)\s+(\w+)/g;
    let match;
    while ((match = namedRegex.exec(content)) !== null) {
      exports.push(match[1]);
    }

    // Default export
    if (/export\s+default/.test(content)) {
      exports.push('default');
    }

    return exports;
  }

  /**
   * Rank files by relevance using Gemini
   */
  private async rankFiles(
    fileContexts: FileContext[],
    dependencyGraph: DependencyNode[],
    targetFile: string | undefined,
    objective: string
  ): Promise<{ rankedFiles: FileContext[]; usage: TokenUsage | null }> {
    // Calculate distance from target file
    if (targetFile) {
      this.calculateDistances(dependencyGraph, targetFile);
    }

    // Use Gemini to rank files
    const prompt = this.buildRankingPrompt(fileContexts, objective, targetFile);

    try {
      const response = await this.callLLM(prompt, {
        systemPrompt: LIBRARIAN_SYSTEM_PROMPT,
        temperature: 0.3,
        maxTokens: 2000,
      });

      // Parse ranking from response
      const rankings = this.parseRankings(response.content, fileContexts);

      // Merge with distance-based rankings
      const rankedFiles = this.mergeRankings(rankings, dependencyGraph);

      return { rankedFiles, usage: response.usage };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to rank files with LLM: ${errorMsg}. Using distance-based ranking fallback.`);
      const rankedFiles = this.fallbackRanking(fileContexts, dependencyGraph);
      return { rankedFiles, usage: null }; // No LLM usage on fallback
    }
  }

  /**
   * Calculate distances from target file in dependency graph
   */
  private calculateDistances(nodes: DependencyNode[], targetFile: string): void {
    const targetNode = nodes.find(n => n.file === targetFile);
    if (!targetNode) return;

    // BFS to calculate distances
    const queue: Array<{ node: DependencyNode; distance: number }> = [
      { node: targetNode, distance: 0 },
    ];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const { node, distance } = queue.shift()!;
      if (visited.has(node.file)) continue;

      visited.add(node.file);
      node.distance = distance;

      // Add neighbors
      for (const dep of [...node.dependsOn, ...node.dependedBy]) {
        const depNode = nodes.find(n => n.file === dep);
        if (depNode && !visited.has(depNode.file)) {
          queue.push({ node: depNode, distance: distance + 1 });
        }
      }
    }
  }

  /**
   * Build ranking prompt for Gemini
   */
  private buildRankingPrompt(
    files: FileContext[],
    objective: string,
    targetFile?: string
  ): string {
    const fileList = files.map(f => `- ${f.path}`).join('\n');

    return `Objective: ${objective}

Target file: ${targetFile || 'None specified'}

Available files:
${fileList}

Rank these files by relevance to the objective, from most to least relevant.
Return ONLY a JSON array of file paths in order: ["most-relevant.ts", "second.ts", ...]`;
  }

  /**
   * Parse ranking response from LLM
   */
  private parseRankings(response: string, files: FileContext[]): FileContext[] {
    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('No JSON array found');

      const rankedPaths = JSON.parse(jsonMatch[0]) as string[];
      const ranked: FileContext[] = [];

      for (const path of rankedPaths) {
        const file = files.find(f => f.path === path);
        if (file) {
          ranked.push(file);
        }
      }

      return ranked;
    } catch (error) {
      this.logger.warn('Failed to parse LLM rankings', error);
      return [];
    }
  }

  /**
   * Merge LLM rankings with distance-based rankings
   */
  private mergeRankings(
    llmRanked: FileContext[],
    dependencyGraph: DependencyNode[]
  ): FileContext[] {
    // Calculate relevance scores
    const scores = new Map<string, number>();

    for (let i = 0; i < llmRanked.length; i++) {
      const file = llmRanked[i];
      const llmScore = 1.0 - i / llmRanked.length;

      const node = dependencyGraph.find(n => n.file === file.path);
      const distanceScore = node ? 1.0 / (node.distance + 1) : 0;

      const finalScore = llmScore * 0.7 + distanceScore * 0.3;
      scores.set(file.path, finalScore);

      file.relevanceScore = finalScore;
    }

    return llmRanked.sort((a, b) => {
      const scoreA = scores.get(a.path) || 0;
      const scoreB = scores.get(b.path) || 0;
      return scoreB - scoreA;
    });
  }

  /**
   * Fallback ranking when LLM fails
   */
  private fallbackRanking(
    files: FileContext[],
    dependencyGraph: DependencyNode[]
  ): FileContext[] {
    return files.sort((a, b) => {
      const nodeA = dependencyGraph.find(n => n.file === a.path);
      const nodeB = dependencyGraph.find(n => n.file === b.path);

      const distA = nodeA?.distance ?? Infinity;
      const distB = nodeB?.distance ?? Infinity;

      return distA - distB;
    });
  }

  /**
   * Generate context summary for Artisan.
   * If escalationContext is provided (from simple mode failure history),
   * it is prepended to the prompt under a "PRIOR ATTEMPTS:" header so the
   * Librarian starts informed rather than cold.
   */
  private async generateContextSummary(
    files: FileContext[],
    dependencyGraph: DependencyNode[],
    objective: string,
    escalationContext?: string
  ): Promise<{ summary: string; usage: TokenUsage | null }> {
    const topFiles = files.slice(0, 10);
    const fileDescriptions = topFiles.map(f => `${f.path}: ${f.content.split('\n').slice(0, 3).join(' ')}`).join('\n');

    const priorAttemptsBlock = escalationContext
      ? `PRIOR ATTEMPTS:\n${escalationContext}\n\n`
      : '';

    const prompt = `${priorAttemptsBlock}Objective: ${objective}

Top relevant files:
${fileDescriptions}

Provide a concise summary (2-3 paragraphs) of the codebase context relevant to this objective.`;

    try {
      const response = await this.callLLM(prompt, {
        systemPrompt: LIBRARIAN_SYSTEM_PROMPT,
        temperature: 0.3,
        maxTokens: 500,
      });

      return { summary: response.content, usage: response.usage };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to generate context summary: ${errorMsg}. Using fallback summary.`);
      return {
        summary: `Codebase analysis: ${topFiles.length} relevant files identified.`,
        usage: null, // No LLM usage on fallback
      };
    }
  }
}

const LIBRARIAN_SYSTEM_PROMPT = `You are the Librarian, a context analysis expert using Gemini 2.0 Pro.

Your role:
- Analyze codebase structure and dependencies
- Rank files by relevance to the objective
- Provide concise, accurate context summaries
- Focus on code relationships and imports

Output format:
- For rankings: JSON array of file paths
- For summaries: 2-3 paragraph text

Keep responses focused and actionable for code generation.`;
