'use server'

import { GoogleGenAI, Type } from '@google/genai'

export async function parseTransactionText(
  text: string,
  context: {
    categories: string[]
    transactionTypes: string[]
    personTags: string[]
    investmentKinds: string[]
    currentDate?: string
  }
) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not set.')
  }

  const ai = new GoogleGenAI({ apiKey })

  const dateStr = context.currentDate || new Date().toISOString().split('T')[0]
  const prompt = `You are a financial parsing assistant. The user has inputted a natural language string describing one or more transactions.
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

User Input: "${text}"
`

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
      transactions: { type: Type.ARRAY, items: transactionSchema, description: 'Array of parsed transactions.' }
    },
    required: ['isConfident', 'transactions'],
  }

  let attempt = 0
  const maxRetries = 3

  while (attempt < maxRetries) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: responseSchema,
          temperature: 0.1,
        },
      })

      if (!response.text) {
        throw new Error('Failed to generate content from AI.')
      }

      const parsed = JSON.parse(response.text)
      return { success: true, data: parsed } // Now returns an array
    } catch (error: any) {
      attempt++
      console.error(`Error parsing transaction (Attempt ${attempt}/${maxRetries}):`, error)
      
      // If it's the last attempt, return the error
      if (attempt >= maxRetries) {
        return { success: false, error: error.message || 'Failed to parse transaction.' }
      }
      
      // Wait before retrying (exponential backoff: 1s, 2s)
      await new Promise(resolve => setTimeout(resolve, attempt * 1000))
    }
  }

  // Fallback return, though the loop should handle it
  return { success: false, error: 'Failed to parse transaction after retries.' }
}
