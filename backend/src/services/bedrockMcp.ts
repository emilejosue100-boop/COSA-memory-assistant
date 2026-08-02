import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import type {
  MemberLoanDisplay,
  MemberRecordDisplay,
  MemberStatsDisplay,
} from './memberContext.js';
import type { TimelineEvent } from './timeline.js';
import type { ContextNote } from './bedrock.js';
import { BedrockError } from './bedrock.js';
import {
  executeReadOnlyMcpTool,
  isAllowedMcpTool,
  MCP_READONLY_TOOL_DEFINITIONS,
} from './mcpReadOnlyTools.js';

const client = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const MAX_TOOL_ROUNDS = 6;

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };

type Message = {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
};

export function isMcpToolUseEnabled(): boolean {
  const flag = process.env.ENABLE_MCP_TOOL_USE?.trim().toLowerCase();
  return flag === 'true' || flag === '1' || flag === 'yes';
}

function buildOptionalContextBlock(
  contextNotes: ContextNote[],
  member: MemberRecordDisplay | null,
  stats: MemberStatsDisplay | null,
  loans: MemberLoanDisplay[]
): string {
  const parts: string[] = [];
  if (member) {
    parts.push(`Member context provided: ${member.name}`);
  }
  if (stats) {
    parts.push(
      `Stats: deposits=${stats.depositCount}, loans=${stats.loanCount}, active=${stats.activeLoans}`
    );
  }
  if (contextNotes.length) {
    parts.push(`Preloaded notes: ${contextNotes.length}`);
  }
  if (loans.length) {
    parts.push(`Preloaded loans: ${loans.length}`);
  }
  return parts.length ? parts.join('\n') : 'No preloaded member context — use read-only tools for cooperative-wide data.';
}

async function invokeClaudeWithTools(messages: Message[], maxTokens = 900): Promise<ContentBlock[]> {
  const modelId =
    process.env.BEDROCK_MODEL_ID?.trim() || 'anthropic.claude-opus-4-6-v1';

  const command = new InvokeModelCommand({
    modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: maxTokens,
      tools: MCP_READONLY_TOOL_DEFINITIONS,
      messages,
    }),
  });

  const response = await client.send(command);
  if (!response.body) {
    throw new BedrockError('Bedrock returned an empty response body');
  }

  const result = JSON.parse(new TextDecoder().decode(response.body)) as {
    content?: ContentBlock[];
  };

  if (!result.content?.length) {
    throw new BedrockError('Bedrock returned no content');
  }

  return result.content;
}

export async function askClaudeWithMCP(
  question: string,
  contextNotes: ContextNote[] = [],
  member: MemberRecordDisplay | null = null,
  stats: MemberStatsDisplay | null = null,
  loans: MemberLoanDisplay[] = [],
  _timelineEvents: TimelineEvent[] = []
): Promise<string> {
  if (!isMcpToolUseEnabled()) {
    throw new BedrockError('MCP tool use is disabled (ENABLE_MCP_TOOL_USE)');
  }

  const contextBlock = buildOptionalContextBlock(contextNotes, member, stats, loans);

  const messages: Message[] = [
    {
      role: 'user',
      content: `You are a read-only cooperative risk analyst for a microfinance cooperative.

You may call read-only tools to inspect notes, audit activity, and loan records. Never write or modify data.

Preloaded context:
${contextBlock}

Question: ${question}

Use tools as needed, then provide a concise officer-facing summary listing specific member names and why they need attention.`,
    },
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const content = await invokeClaudeWithTools(messages);
    const toolUses = content.filter(
      (block): block is Extract<ContentBlock, { type: 'tool_use' }> =>
        block.type === 'tool_use'
    );

    if (toolUses.length === 0) {
      const textBlock = content.find((block) => block.type === 'text');
      if (!textBlock?.text?.trim()) {
        throw new BedrockError('Bedrock returned no answer text');
      }
      return textBlock.text.trim();
    }

    messages.push({ role: 'assistant', content });

    const toolResults: ContentBlock[] = [];
    for (const toolUse of toolUses) {
      if (!isAllowedMcpTool(toolUse.name)) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify({ error: 'Tool not allowed' }),
        });
        continue;
      }

      const result = await executeReadOnlyMcpTool(toolUse.name, toolUse.input ?? {});
      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: result,
      });
    }

    messages.push({ role: 'user', content: toolResults });
  }

  throw new BedrockError('MCP tool loop exceeded maximum rounds');
}
