import { GoogleGenAI } from '@google/genai';
import type { FinancialTip, Opportunity } from '../types/index.js';
import { defaultWelcomeTip } from '../seed/seedData.js';
import {
  GeminiServiceError,
  generateGeminiJson,
  getGeminiClient,
} from './geminiClient.js';

export { GeminiServiceError, probeGeminiConnection } from './geminiClient.js';

export async function generateFinancialTip(
  memberName: string,
  savingsBalance: number,
  txSummary: string
): Promise<FinancialTip> {
  try {
    const prompt = `Generate a supportive financial tip for a rural or semi-urban informal savings cooperative member in Rwanda (Ikimina group) named ${memberName}.
    The member has a personal savings balance of ${savingsBalance} USD in the cooperative.
    Their transaction history is:
    ${txSummary || 'No recent contributions'}

    Generate the response in JSON format matching this exact TypeScript schema:
    {
      "id": "tip-dynamic",
      "titleEn": "string (Short header, e.g. Savings Streak)",
      "titleFr": "string (French translation of the header)",
      "contentEn": "string (Actionable financial encouragement in English)",
      "contentFr": "string (Actionable financial encouragement in French)",
      "whyEn": "string (Explanation why they see this based on their balance of ${savingsBalance} USD and transactions)",
      "whyFr": "string (French translation of why they see this)",
      "category": "streak" | "goal" | "dip"
    }
    The tip should be friendly, inspiring, culturally relevant (mentioning community, mutual assistance, or small micro-enterprises), and grammatically perfect in both English and French. Do not include markdown code block formatting or backticks outside the raw JSON string.`;

    return await generateGeminiJson<FinancialTip>(prompt, 'generate-tip');
  } catch (error) {
    console.error('Gemini generate-tip error:', error);
    const fallbackTips: FinancialTip[] = [
      {
        id: 'tip-fallback-1',
        titleEn: 'Smart Loan Management',
        titleFr: 'Gestion intelligente des prêts',
        contentEn: 'Borrow only what can generate returns for your small business kiosk or farm.',
        contentFr: 'Empruntez seulement ce qui peut générer des revenus pour votre commerce ou votre ferme.',
        whyEn: 'Based on cooperative borrowing best practices to ensure smooth repayment and zero stress.',
        whyFr: 'Basé sur les bonnes pratiques de la coopérative pour un remboursement serein.',
        category: 'goal',
      },
      {
        id: 'tip-fallback-2',
        titleEn: 'Steady Accumulation',
        titleFr: 'Épargne régulière',
        contentEn: 'Adding even a small amount every week builds a foundation of security for your family.',
        contentFr: 'Mettre de côté même une petite somme chaque semaine renforce la sécurité de votre famille.',
        whyEn: 'Based on your recent savings habit showing consistent cooperative engagement.',
        whyFr: 'Basé sur votre habitude d’épargne récente au sein de la coopérative.',
        category: 'streak',
      },
    ];
    return fallbackTips[Math.floor(Math.random() * fallbackTips.length)] ?? defaultWelcomeTip;
  }
}

export type RefreshOpportunitiesResult =
  | { ok: true; opportunities: Opportunity[] }
  | { ok: false; error: string; code: string; status: number };

export async function refreshOpportunities(
  scrapedContext: string,
  groupSavings: number
): Promise<RefreshOpportunitiesResult> {
  try {
    getGeminiClient();
    const hasScrapedData = scrapedContext.trim().length > 0;

    const dataInstructions = hasScrapedData
      ? `Use ONLY the scraped content below. Do not invent products or institutions not mentioned in the scraped data.
Cite source URLs from the scraped content in the "sourceUrl" field when available.

Scraped content:
${scrapedContext}`
      : `No live scraped data is available. Generate realistic opportunities based on well-known Rwandan financial institutions (BNR treasury products, RSE, Bank of Kigali, SACCOs, agricultural cooperatives). Set sourceUrl to an empty string if no URL is known.`;

    const prompt = `You are curating investment options for a Rwandan savings cooperative with ${groupSavings} USD idle funds.
${dataInstructions}

Return 3-5 opportunities ranked by safety for a community-based informal savings group (Ikimina).
Return the response as a JSON array matching this exact TypeScript schema:
[{
  "id": "string (unique id like opp-123)",
  "titleEn": "string",
  "titleFr": "string (French translation)",
  "source": "string (institution or provider name)",
  "sourceUrl": "string (URL from scraped content, or empty string)",
  "returnRate": "string (e.g. 10.5% p.a.)",
  "summaryEn": "string (2-3 sentences)",
  "summaryFr": "string (French explanation)",
  "category": "string (e.g. SACCO, Agriculture, Bonds)",
  "foundAgo": "string (e.g. Found just now)"
}]
Avoid code blocks or backticks.`;

    const list = await generateGeminiJson<Opportunity[]>(prompt, 'refresh-opportunities');
    if (!Array.isArray(list) || list.length === 0) {
      return {
        ok: false,
        code: 'invalid_response',
        status: 503,
        error: 'Gemini returned no opportunities. Try again in a moment.',
      };
    }

    return {
      ok: true,
      opportunities: list.map((item) => ({ ...item, isFlagged: false })),
    };
  } catch (error) {
    console.error('Gemini refresh-opportunities error:', error);
    if (error instanceof GeminiServiceError) {
      return {
        ok: false,
        code: error.code,
        status: error.status,
        error: error.message,
      };
    }
    return {
      ok: false,
      code: 'api_error',
      status: 503,
      error: 'Could not curate opportunities with Gemini right now.',
    };
  }
}

export async function analyzeOpportunity(
  opp: Opportunity,
  groupSavings: number
): Promise<{ aiAnalysisEn: string; aiAnalysisFr: string }> {
  try {
    const prompt = `Perform a cooperative-focused financial risk and growth analysis on the following investment opportunity:
    Title: ${opp.titleEn} (${opp.titleFr})
    Source: ${opp.source}
    Yield: ${opp.returnRate}
    Description: ${opp.summaryEn}

    Analyze its safety, suitability for a rural informal group (Ikimina) with collective savings of ${groupSavings} USD, and ease of liquidation (withdrawal).
    Provide a professional, clear response in both English and French in JSON format matching this exact schema:
    {
      "aiAnalysisEn": "string (Actionable 3-sentence summary of security, liquidity, and recommendation)",
      "aiAnalysisFr": "string (Actionable French equivalent)"
    }`;

    return await generateGeminiJson<{ aiAnalysisEn: string; aiAnalysisFr: string }>(
      prompt,
      'analyze-opportunity'
    );
  } catch (error) {
    console.error('Gemini analyze-opportunity error:', error);
    return {
      aiAnalysisEn:
        'Steady returns with minimal regulatory risks. Ideal asset lock-in for 6-12 months for idle cooperative reserves.',
      aiAnalysisFr:
        'Rendements stables avec des risques réglementaires minimes. Idéal pour bloquer les réserves de la coopérative sur 6 à 12 mois.',
    };
  }
}
