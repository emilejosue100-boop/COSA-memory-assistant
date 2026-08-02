import { db } from '../db/index.js';
import { riskScanLog } from '../db/schema.js';
import { askClaudeWithMCP, isMcpToolUseEnabled } from './bedrockMcp.js';
import { BedrockError } from './bedrock.js';

export class RiskScanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RiskScanError';
  }
}

export async function runCooperativeRiskScan(): Promise<{ result: string; id: string }> {
  if (!isMcpToolUseEnabled()) {
    throw new RiskScanError('MCP tool use is disabled (set ENABLE_MCP_TOOL_USE=true)');
  }

  const scanQuestion =
    'Which members currently have unresolved compliance flags, or show a pattern of repeated broken repayment promises, that have not been reviewed by an officer in the last 60 days?';

  let result: string;
  try {
    result = await askClaudeWithMCP(scanQuestion, [], null, null, [], []);
  } catch (err) {
    if (err instanceof BedrockError) {
      throw new RiskScanError(err.message);
    }
    throw err;
  }

  const [inserted] = await db
    .insert(riskScanLog)
    .values({ scanResult: result })
    .returning({ id: riskScanLog.id });

  return { result, id: String(inserted.id) };
}
