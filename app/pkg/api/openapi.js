/**
 * openapi.js — build the OpenAPI 3.1 document from the live rule catalogue,
 * so the documented enum of rule ids can never drift from the code.
 */

import { CATEGORIES } from '../src/patterns.js';

export function buildOpenApi(serverUrl = '/') {
  const ruleIds = CATEGORIES.map((c) => c.id);

  const severity = { type: 'string', enum: ['off', 'warn', 'error'] };

  const metrics = {
    type: 'object',
    description: 'Statistical signals that regex cannot express.',
    properties: {
      emDash: {
        type: 'object',
        properties: {
          total: { type: 'integer' },
          spaced: { type: 'integer' },
          perThousand: { type: 'number', description: 'Corpus baselines: LLM 2.65, human 0.26.' },
          spacedShare: { type: 'number' },
          flag: { type: 'boolean' }
        }
      },
      quotes: {
        type: 'object',
        properties: {
          curly: { type: 'integer' }, straight: { type: 'integer' },
          mixed: { type: 'boolean' }, flag: { type: 'boolean' }
        }
      },
      burstiness: {
        type: 'object',
        description: 'Sentence-length variation. Measured at 0.546 for LLM text and 0.606 for '
          + 'human text, i.e. no useful separation. Reported for interest, weighted near zero.',
        properties: {
          sentences: { type: 'integer' },
          meanLength: { type: ['number', 'null'] },
          cv: { type: ['number', 'null'] },
          flag: { type: 'boolean' }
        }
      },
      paragraphs: {
        type: 'object',
        properties: {
          paragraphs: { type: 'integer' },
          meanLength: { type: ['number', 'null'] },
          cv: { type: ['number', 'null'] },
          flag: { type: 'boolean' }
        }
      }
    }
  };

  const finding = {
    type: 'object',
    required: ['ruleId', 'category', 'severity', 'tier', 'line', 'column', 'match'],
    properties: {
      ruleId: { type: 'string', example: 'significance_statements/stands_as_testament' },
      category: { type: 'string', enum: ruleIds },
      severity,
      tier: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
      line: { type: 'integer', minimum: 1, description: '1-based line in the submitted text.' },
      column: { type: 'integer', minimum: 1, description: '1-based column in the submitted text.' },
      endColumn: { type: 'integer' },
      match: { type: 'string', description: 'The matched phrase, exactly as it appears at line:column.' },
      message: { type: 'string' }
    }
  };

  const lintRequest = {
    type: 'object',
    required: ['text'],
    properties: {
      text: { type: 'string', maxLength: 200000, description: 'The prose to analyse. Not logged or retained.' },
      rules: {
        type: 'object',
        description: 'Per-category severity overrides. Omitted categories fall back to their tier '
          + 'default: critical/high = error, medium = warn, low = off. rule_of_three defaults off.',
        additionalProperties: severity,
        propertyNames: { enum: ruleIds },
        example: { rule_of_three: 'off', ai_vocabulary: 'warn' }
      },
      threshold: {
        type: 'number', minimum: 0, maximum: 100,
        description: 'Document score gate. Sets thresholdExceeded and summary.failed.'
      },
      filePath: { type: 'string', description: 'Label echoed back in results. Cosmetic.' },
      maxHitsPerRule: { type: 'integer', minimum: 0, description: '0 means unlimited.' },
      extract: {
        type: 'boolean', default: false,
        description: 'Apply per-filetype masking (front matter, code fences, tables) based on '
          + 'filePath\'s extension, as the CLI does.'
      }
    }
  };

  const errorSchema = {
    type: 'object',
    properties: {
      error: {
        type: 'object',
        required: ['code', 'message'],
        properties: { code: { type: 'string' }, message: { type: 'string' } }
      }
    }
  };

  const errs = {
    400: { description: 'Invalid request', content: { 'application/json': { schema: errorSchema } } },
    413: { description: 'Body or text over the limit', content: { 'application/json': { schema: errorSchema } } }
  };

  return {
    openapi: '3.1.0',
    info: {
      title: 'SlopDetector API',
      version: '1.0.0',
      summary: 'Lint prose for the stylistic fingerprints of LLM-generated text.',
      description:
        'A style linter, **not** an authorship detector.\n\n'
        + 'It reports writing habits that language models exhibit more often than most human '
        + 'writers. It does not determine who or what wrote a text, and it must not be used as '
        + 'though it does. Seven commercial detectors once flagged 61% of human-written TOEFL '
        + 'essays as machine-written (Liang et al., *Patterns* 4(7), 2023) against 5% for US '
        + 'eighth-graders, because careful formal prose in a second language is '
        + 'indistinguishable to such tools from model output.\n\n'
        + 'Do not use this API in academic misconduct proceedings, hiring, or moderation '
        + 'enforcement.\n\n'
        + '**Privacy:** submitted text is not logged, stored, or retained beyond the request.',
      license: { name: 'CC BY-NC-SA 4.0', url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/' }
    },
    servers: [{ url: serverUrl }],
    paths: {
      '/health': {
        get: {
          summary: 'Liveness check',
          operationId: 'health',
          responses: {
            200: {
              description: 'Service is up',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string' }, version: { type: 'string' },
                      categories: { type: 'integer' }, patterns: { type: 'integer' }
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/v1/rules': {
        get: {
          summary: 'List the rule catalogue',
          operationId: 'listRules',
          responses: {
            200: {
              description: 'Every rule with its tier, default severity, and cautions',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      version: { type: 'integer' },
                      rules: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string', enum: ruleIds },
                            label: { type: 'string' },
                            tier: { type: 'string' },
                            defaultSeverity: severity,
                            patterns: { type: 'array', items: { type: 'string' } },
                            why: { type: 'string' },
                            caution: { type: 'string' }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/v1/lint': {
        post: {
          summary: 'Lint text and return positioned findings',
          operationId: 'lint',
          requestBody: { required: true, content: { 'application/json': { schema: lintRequest } } },
          responses: {
            200: {
              description: 'Findings and score',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      version: { type: 'integer' },
                      disclaimer: { type: 'string' },
                      summary: {
                        type: 'object',
                        properties: {
                          files: { type: 'integer' }, errors: { type: 'integer' },
                          warnings: { type: 'integer' }, failed: { type: 'boolean' }
                        }
                      },
                      results: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            filePath: { type: 'string' },
                            score: { type: 'integer', minimum: 0, maximum: 100 },
                            band: {
                              type: 'string',
                              enum: ['no meaningful signal', 'faint traces', 'mixed signals', 'strong LLM register']
                            },
                            wordCount: { type: 'integer' },
                            errorCount: { type: 'integer' },
                            warningCount: { type: 'integer' },
                            thresholdExceeded: { type: 'boolean' },
                            metrics,
                            findings: { type: 'array', items: finding }
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            ...errs
          }
        }
      },
      '/v1/score': {
        post: {
          summary: 'Score text without per-finding detail',
          operationId: 'score',
          requestBody: { required: true, content: { 'application/json': { schema: lintRequest } } },
          responses: {
            200: {
              description: 'Score, band and metrics',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      version: { type: 'integer' },
                      disclaimer: { type: 'string' },
                      score: { type: 'integer' },
                      band: { type: 'string' },
                      wordCount: { type: 'integer' },
                      thresholdExceeded: { type: 'boolean' },
                      metrics
                    }
                  }
                }
              }
            },
            ...errs
          }
        }
      }
    }
  };
}
