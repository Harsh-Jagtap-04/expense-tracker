'use server'

import { GoogleGenAI, Type } from '@google/genai'

export interface ParseContext {
  categories: string[]
  transactionTypes: string[]
  personTags: string[]
  investmentKinds: string[]
  currentDate?: string
}

export interface ParsedTransaction {
  amount: number
  category: string
  type: string
  date: string
  person?: string | null
  investmentKind?: string | null
  title: string
}

export interface ParseResponseData {
  isConfident: boolean
  confidenceReason?: string | null
  transactions: ParsedTransaction[]
}

export interface ParseResult {
  success: boolean
  data?: ParseResponseData
  error?: string
  provider?: string
}

function buildPrompt(text: string, context: ParseContext): string {
  const dateStr = context.currentDate || new Date().toISOString().split('T')[0]
  return `You are a financial parsing assistant. The user has inputted a natural language string describing one or more transactions.
Your goal is to parse this string and extract the relevant fields, returning them in a strict JSON format.

Today's date is: ${dateStr} (YYYY-MM-DD format). If the user mentions "yesterday" or "today", calculate the date relative to this date.

Available options for fields:
- categories: ${context.categories.join(', ')}
- transactionTypes: ${context.transactionTypes.join(', ')}
- personTags: ${context.personTags.join(', ')}
- investmentKinds: ${context.investmentKinds.join(', ')}

Instructions:
1. Identify all separate transactions mentioned in the text.
2. For each transaction, determine the best category, type, and tags from the provided options. (e.g. "hospital" might be "Health", "sister" might be a "Family" tag).
3. The 'person' tag should default to "Self" (if it's a personal expense or not specified) unless it's clearly for a family member.
4. Ensure the 'type' is set to "Investment" (and NOT Expense) for any purchases of stocks, mutual funds, SIPs, crypto, or similar assets.
5. Assess your confidence in parsing all elements. Set isConfident to false if:
   - The text is too ambiguous or misspelled to understand.
   - You cannot accurately map an item to the available categories.
   - The amount is missing or unclear.
6. If isConfident is false, provide a brief 'confidenceReason' explaining why.

You MUST respond with valid JSON matching this exact structure:
{
  "isConfident": true,
  "confidenceReason": null,
  "transactions": [
    {
      "amount": 100,
      "category": "Food & Dining",
      "type": "Expense",
      "date": "${dateStr}",
      "person": "Self",
      "investmentKind": null,
      "title": "Short description"
    }
  ]
}

User Input: "${text}"`
}

function sanitizeAndNormalize(rawText: string, context: ParseContext): ParseResponseData {
  let cleaned = rawText.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  }

  const parsed = JSON.parse(cleaned)
  const isConfident = Boolean(parsed.isConfident ?? true)
  const confidenceReason = parsed.confidenceReason || null

  let rawList: any[] = []
  if (Array.isArray(parsed.transactions)) {
    rawList = parsed.transactions
  } else if (parsed.amount) {
    rawList = [parsed]
  }

  const defaultCategory = context.categories[0] || 'Other'
  const defaultType = context.transactionTypes[0] || 'Expense'
  const defaultDate = context.currentDate || new Date().toISOString().split('T')[0]

  const transactions: ParsedTransaction[] = rawList.map((tx: any) => ({
    amount: Number(tx.amount) || 0,
    category: String(tx.category || defaultCategory),
    type: String(tx.type || defaultType),
    date: String(tx.date || defaultDate),
    person: tx.person ? String(tx.person) : null,
    investmentKind: tx.investmentKind ? String(tx.investmentKind) : null,
    title: String(tx.title || 'Transaction'),
  }))

  return {
    isConfident,
    confidenceReason,
    transactions,
  }
}

// 1. Google Gemini Provider
async function callGemini(
  text: string,
  context: ParseContext,
  apiKey: string,
  modelName: string
): Promise<ParseResponseData> {
  const ai = new GoogleGenAI({ apiKey })
  const prompt = buildPrompt(text, context)

  const transactionSchema = {
    type: Type.OBJECT,
    properties: {
      amount: { type: Type.NUMBER, description: 'The amount of the transaction.' },
      category: { type: Type.STRING, description: 'The closest matching category from the available options.' },
      type: { type: Type.STRING, description: 'One of the available transaction types.' },
      date: { type: Type.STRING, description: 'The date of the transaction in YYYY-MM-DD format.' },
      person: { type: Type.STRING, description: 'The person involved, if any.', nullable: true },
      investmentKind: { type: Type.STRING, description: 'The type of investment, if applicable.', nullable: true },
      title: { type: Type.STRING, description: 'A short description of the transaction.' },
    },
    required: ['amount', 'category', 'type', 'date', 'title'],
  }

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      isConfident: { type: Type.BOOLEAN, description: 'True if you are highly confident in the parsed data.' },
      confidenceReason: { type: Type.STRING, description: 'Explanation if isConfident is false.', nullable: true },
      transactions: { type: Type.ARRAY, items: transactionSchema, description: 'Array of parsed transactions.' },
    },
    required: ['isConfident', 'transactions'],
  }

  const response = await ai.models.generateContent({
    model: modelName,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: responseSchema,
      temperature: 0.1,
    },
  })

  if (!response.text) {
    throw new Error(`Empty response from Gemini model ${modelName}`)
  }

  return sanitizeAndNormalize(response.text, context)
}

// 2. Groq Provider (OpenAI Compatible)
async function callGroq(
  text: string,
  context: ParseContext,
  apiKey: string,
  modelName: string
): Promise<ParseResponseData> {
  const prompt = buildPrompt(text, context)
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelName,
      messages: [
        {
          role: 'system',
          content: 'You are an accurate financial transaction parser. You must only output a valid JSON object matching the requested schema without any markdown formatting or commentary.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    }),
  })

  if (!res.ok) {
    const errorBody = await res.text()
    throw new Error(`Groq API error (${res.status}): ${errorBody}`)
  }

  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('Groq returned empty response content')
  }

  return sanitizeAndNormalize(content, context)
}

// 3. OpenRouter Provider (OpenAI Compatible)
async function callOpenRouter(
  text: string,
  context: ParseContext,
  apiKey: string,
  modelName: string
): Promise<ParseResponseData> {
  const prompt = buildPrompt(text, context)
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'Expense Tracker',
    },
    body: JSON.stringify({
      model: modelName,
      messages: [
        {
          role: 'system',
          content: 'You are an accurate financial transaction parser. You must only output a valid JSON object matching the requested schema without any markdown formatting or commentary.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    }),
  })

  if (!res.ok) {
    const errorBody = await res.text()
    throw new Error(`OpenRouter API error (${res.status}): ${errorBody}`)
  }

  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('OpenRouter returned empty response content')
  }

  return sanitizeAndNormalize(content, context)
}

interface CandidateCall {
  provider: string
  model: string
  execute: () => Promise<ParseResponseData>
}

export async function parseTransactionText(
  text: string,
  context: {
    categories: string[]
    transactionTypes: string[]
    personTags: string[]
    investmentKinds: string[]
    currentDate?: string
  }
): Promise<ParseResult> {
  const groqApiKey = process.env.GROQ_API_KEY
  const openRouterApiKey = process.env.OPENROUTER_API_KEY
  const geminiApiKey = process.env.GEMINI_API_KEY
  const preferredProvider = (process.env.AI_PROVIDER || 'auto').toLowerCase()

  const candidates: CandidateCall[] = []

  // Add Groq if available
  if (groqApiKey) {
    const groqModel = process.env.GROQ_MODEL || 'qwen/qwen3.8-27b'
    candidates.push({
      provider: `Groq (${groqModel})`,
      model: groqModel,
      execute: () => callGroq(text, context, groqApiKey, groqModel),
    })

    const fallbackGroqModels = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'].filter(
      (m) => m !== groqModel
    )
    for (const gm of fallbackGroqModels) {
      candidates.push({
        provider: `Groq (${gm})`,
        model: gm,
        execute: () => callGroq(text, context, groqApiKey, gm),
      })
    }
  }

  // Add Gemini models if available
  if (geminiApiKey) {
    const primaryGeminiModel = process.env.GEMINI_MODEL || 'gemini-3.8-flash'
    candidates.push({
      provider: `Gemini (${primaryGeminiModel})`,
      model: primaryGeminiModel,
      execute: () => callGemini(text, context, geminiApiKey, primaryGeminiModel),
    })

    const fallbackGeminiModels = ['gemini-3.6-flash', 'gemini-3.5-flash'].filter(
      (m) => m !== primaryGeminiModel
    )
    for (const fm of fallbackGeminiModels) {
      candidates.push({
        provider: `Gemini (${fm})`,
        model: fm,
        execute: () => callGemini(text, context, geminiApiKey, fm),
      })
    }
  }

  // Add OpenRouter if available
  if (openRouterApiKey) {
    const orModel = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free'
    candidates.push({
      provider: `OpenRouter (${orModel})`,
      model: orModel,
      execute: () => callOpenRouter(text, context, openRouterApiKey, orModel),
    })
  }

  if (candidates.length === 0) {
    return {
      success: false,
      error:
        'No AI provider API key found. Please set GROQ_API_KEY, GEMINI_API_KEY, or OPENROUTER_API_KEY in .env.local',
    }
  }

  // If user explicitly chose a preferred provider, sort that provider to the front
  if (preferredProvider !== 'auto') {
    candidates.sort((a, b) => {
      const aMatch = a.provider.toLowerCase().includes(preferredProvider)
      const bMatch = b.provider.toLowerCase().includes(preferredProvider)
      if (aMatch && !bMatch) return -1
      if (!aMatch && bMatch) return 1
      return 0
    })
  }

  const errors: string[] = []

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i]
    try {
      const data = await candidate.execute()
      return {
        success: true,
        data,
        provider: candidate.provider,
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err)
      console.warn(`[Parse Transaction] ${candidate.provider} failed:`, errMsg)
      errors.push(`${candidate.provider}: ${errMsg}`)

      // Small pause before trying next fallback provider
      if (i < candidates.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 300))
      }
    }
  }

  return {
    success: false,
    error: `All configured AI providers failed or hit rate limits:\n${errors.join('\n')}`,
  }
}
