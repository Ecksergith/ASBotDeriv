import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'

// Mock pandas data simulation
interface AssetData {
  symbol: string
  prices: number[]
  volumes: number[]
  timestamps: string[]
  technical_indicators: {
    sma_20: number[]
    sma_50: number[]
    rsi: number[]
    macd: number[]
    bb_upper: number[]
    bb_lower: number[]
  }
}

function generateMockHistoricalData(symbol: string, days: number = 100): AssetData {
  const basePrice = symbol === 'BTC' ? 45000 : symbol === 'ETH' ? 2300 : symbol === 'SOL' ? 100 : 50
  const prices: number[] = []
  const volumes: number[] = []
  const timestamps: string[] = []
  
  let currentPrice = basePrice
  
  for (let i = days; i >= 0; i--) {
    const date = new Date()
    date.setDate(date.getDate() - i)
    timestamps.push(date.toISOString())
    
    // Simulate price movement with some randomness
    const change = (Math.random() - 0.5) * 0.05
    currentPrice = currentPrice * (1 + change)
    prices.push(currentPrice)
    
    // Generate volume
    volumes.push(Math.random() * 1000000 + 500000)
  }
  
  // Calculate technical indicators
  const sma_20 = calculateSMA(prices, 20)
  const sma_50 = calculateSMA(prices, 50)
  const rsi = calculateRSI(prices, 14)
  const macd = calculateMACD(prices)
  const bb = calculateBollingerBands(prices, 20)
  
  return {
    symbol,
    prices,
    volumes,
    timestamps,
    technical_indicators: {
      sma_20,
      sma_50,
      rsi,
      macd,
      bb_upper: bb.upper,
      bb_lower: bb.lower
    }
  }
}

function calculateSMA(prices: number[], period: number): number[] {
  const sma: number[] = []
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      sma.push(0)
    } else {
      const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0)
      sma.push(sum / period)
    }
  }
  return sma
}

function calculateRSI(prices: number[], period: number): number[] {
  const rsi: number[] = []
  const changes: number[] = []
  
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1])
  }
  
  for (let i = 0; i < prices.length; i++) {
    if (i < period) {
      rsi.push(50)
    } else {
      const recentChanges = changes.slice(i - period, i)
      const gains = recentChanges.filter(change => change > 0)
      const losses = recentChanges.filter(change => change < 0).map(loss => Math.abs(loss))
      
      const avgGain = gains.length > 0 ? gains.reduce((a, b) => a + b, 0) / period : 0
      const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / period : 0
      
      if (avgLoss === 0) {
        rsi.push(100)
      } else {
        const rs = avgGain / avgLoss
        rsi.push(100 - (100 / (1 + rs)))
      }
    }
  }
  
  return rsi
}

function calculateMACD(prices: number[]): number[] {
  const ema12 = calculateEMA(prices, 12)
  const ema26 = calculateEMA(prices, 26)
  return ema12.map((val, idx) => val - ema26[idx])
}

function calculateEMA(prices: number[], period: number): number[] {
  const ema: number[] = [prices[0]]
  const multiplier = 2 / (period + 1)
  
  for (let i = 1; i < prices.length; i++) {
    ema.push((prices[i] - ema[i - 1]) * multiplier + ema[i - 1])
  }
  
  return ema
}

function calculateBollingerBands(prices: number[], period: number): { upper: number[], lower: number[] } {
  const sma = calculateSMA(prices, period)
  const upper: number[] = []
  const lower: number[] = []
  
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      upper.push(0)
      lower.push(0)
    } else {
      const recentPrices = prices.slice(i - period + 1, i + 1)
      const mean = sma[i]
      const variance = recentPrices.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / period
      const stdDev = Math.sqrt(variance)
      
      upper.push(mean + (stdDev * 2))
      lower.push(mean - (stdDev * 2))
    }
  }
  
  return { upper, lower }
}

async function generateMLPrediction(data: AssetData): Promise<{
  prediction: 'buy' | 'sell' | 'hold'
  confidence: number
  reasoning: string
  expected_move: number
}> {
  try {
    console.log(`🤖 [ML] Iniciando geração de previsão para ${data.symbol}...`)
    const zai = await ZAI.create()
    
    const latestPrice = data.prices[data.prices.length - 1]
    const latestRSI = data.technical_indicators.rsi[data.technical_indicators.rsi.length - 1]
    const latestMACD = data.technical_indicators.macd[data.technical_indicators.macd.length - 1]
    const priceVsSMA20 = latestPrice - data.technical_indicators.sma_20[data.technical_indicators.sma_20.length - 1]
    const priceVsSMA50 = latestPrice - data.technical_indicators.sma_50[data.technical_indicators.sma_50.length - 1]
    
    console.log(`📊 [ML] Indicadores técnicos para ${data.symbol}:`, {
      latestPrice,
      latestRSI,
      latestMACD,
      priceVsSMA20,
      priceVsSMA50
    })
    
    const prompt = `
    Analyze the following trading data for ${data.symbol} and provide a trading recommendation:
    
    Current Price: $${latestPrice.toFixed(2)}
    RSI (14): ${latestRSI.toFixed(2)}
    MACD: ${latestMACD.toFixed(2)}
    Price vs SMA20: $${priceVsSMA20.toFixed(2)} (${((priceVsSMA20 / latestPrice) * 100).toFixed(2)}%)
    Price vs SMA50: $${priceVsSMA50.toFixed(2)} (${((priceVsSMA50 / latestPrice) * 100).toFixed(2)}%)
    
    Based on technical analysis and market patterns, provide:
    1. Trading signal (buy, sell, or hold)
    2. Confidence level (0-100%)
    3. Brief reasoning
    4. Expected price movement in percentage
    
    Format your response as JSON:
    {
      "prediction": "buy|sell|hold",
      "confidence": 85,
      "reasoning": "Technical indicators suggest...",
      "expected_move": 2.5
    }
    `
    
    console.log(`📝 [ML] Enviando prompt para ZAI...`)
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: 'You are an expert AI trading analyst. Analyze technical indicators and provide trading recommendations with confidence levels.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3
    })
    
    const response = completion.choices[0]?.message?.content
    console.log(`📥 [ML] Resposta recebida do ZAI:`, response)
    
    if (response) {
      try {
        const parsed = JSON.parse(response)
        console.log(`✅ [ML] Previsão parseada com sucesso:`, parsed)
        return {
          prediction: parsed.prediction,
          confidence: parsed.confidence,
          reasoning: parsed.reasoning,
          expected_move: parsed.expected_move
        }
      } catch (parseError) {
        console.error(`❌ [ML] Erro ao parsear JSON da resposta:`, parseError)
        console.log(`🔄 [ML] Usando fallback para previsão baseada em regras...`)
        // Fallback to rule-based prediction if JSON parsing fails
        return generateRuleBasedPrediction(data)
      }
    }
    
    console.log(`❌ [ML] Nenhuma resposta recebida do ZAI, usando fallback...`)
    return generateRuleBasedPrediction(data)
    
  } catch (error) {
    console.error('❌ [ML] ML prediction error:', error)
    console.log(`🔄 [ML] Usando fallback para previsão baseada em regras devido a erro...`)
    return generateRuleBasedPrediction(data)
  }
}

function generateRuleBasedPrediction(data: AssetData): {
  prediction: 'buy' | 'sell' | 'hold'
  confidence: number
  reasoning: string
  expected_move: number
} {
  console.log(`📊 [RULE] Gerando previsão baseada em regras para ${data.symbol}...`)
  
  const latestPrice = data.prices[data.prices.length - 1]
  const latestRSI = data.technical_indicators.rsi[data.technical_indicators.rsi.length - 1]
  const latestMACD = data.technical_indicators.macd[data.technical_indicators.macd.length - 1]
  const priceVsSMA20 = latestPrice - data.technical_indicators.sma_20[data.technical_indicators.sma_20.length - 1]
  const priceVsSMA50 = latestPrice - data.technical_indicators.sma_50[data.technical_indicators.sma_50.length - 1]
  
  console.log(`📈 [RULE] Indicadores para regras:`, {
    latestPrice,
    latestRSI,
    latestMACD,
    priceVsSMA20,
    priceVsSMA50
  })
  
  let prediction: 'buy' | 'sell' | 'hold' = 'hold'
  let confidence = 50
  let reasoning = 'Neutral market conditions'
  let expected_move = 0
  
  // RSI-based signals
  if (latestRSI < 30) {
    prediction = 'buy'
    confidence = Math.min(confidence + 20, 90)
    reasoning = 'Oversold conditions detected (RSI < 30)'
    expected_move = 2 + Math.random() * 3
    console.log(`📉 [RULE] Sinal de compra: RSI oversold (${latestRSI})`)
  } else if (latestRSI > 70) {
    prediction = 'sell'
    confidence = Math.min(confidence + 20, 90)
    reasoning = 'Overbought conditions detected (RSI > 70)'
    expected_move = -(2 + Math.random() * 3)
    console.log(`📈 [RULE] Sinal de venda: RSI overbought (${latestRSI})`)
  }
  
  // MACD-based signals
  if (latestMACD > 0) {
    if (prediction === 'buy') {
      confidence = Math.min(confidence + 15, 95)
      reasoning += ' with positive MACD confirmation'
      console.log(`📊 [RULE] MACD positivo confirma compra`)
    } else if (prediction === 'hold') {
      prediction = 'buy'
      confidence = 65
      reasoning = 'Positive MACD signal'
      expected_move = 1 + Math.random() * 2
      console.log(`📊 [RULE] MACD positivo gera sinal de compra`)
    }
  } else if (latestMACD < 0) {
    if (prediction === 'sell') {
      confidence = Math.min(confidence + 15, 95)
      reasoning += ' with negative MACD confirmation'
      console.log(`📊 [RULE] MACD negativo confirma venda`)
    } else if (prediction === 'hold') {
      prediction = 'sell'
      confidence = 65
      reasoning = 'Negative MACD signal'
      expected_move = -(1 + Math.random() * 2)
      console.log(`📊 [RULE] MACD negativo gera sinal de venda`)
    }
  }
  
  // Moving average signals
  if (priceVsSMA20 > 0 && priceVsSMA50 > 0) {
    if (prediction === 'buy') {
      confidence = Math.min(confidence + 10, 98)
      reasoning += ' and price above moving averages'
      console.log(`📊 [RULE] Preço acima das médias confirma compra`)
    }
  } else if (priceVsSMA20 < 0 && priceVsSMA50 < 0) {
    if (prediction === 'sell') {
      confidence = Math.min(confidence + 10, 98)
      reasoning += ' and price below moving averages'
      console.log(`📊 [RULE] Preço abaixo das médias confirma venda`)
    }
  }
  
  const result = {
    prediction,
    confidence,
    reasoning,
    expected_move
  }
  
  console.log(`✅ [RULE] Previsão baseada em regras gerada:`, result)
  
  return result
}

export async function POST(request: NextRequest) {
  try {
    const { symbol } = await request.json()
    
    console.log(`🔮 [PREDICT] Recebida requisição para símbolo: ${symbol}`)
    
    if (!symbol) {
      console.error('❌ [PREDICT] Símbolo não fornecido')
      return NextResponse.json({ error: 'Symbol is required' }, { status: 400 })
    }
    
    // Generate mock historical data
    console.log(`📊 [PREDICT] Gerando dados históricos para ${symbol}...`)
    const historicalData = generateMockHistoricalData(symbol)
    
    // Generate ML prediction
    console.log(`🤖 [PREDICT] Gerando previsão ML para ${symbol}...`)
    const prediction = await generateMLPrediction(historicalData)
    
    console.log(`✅ [PREDICT] Previsão gerada para ${symbol}:`, prediction)
    
    const response = {
      symbol,
      prediction: prediction.prediction,
      confidence: prediction.confidence,
      reasoning: prediction.reasoning,
      expected_move: prediction.expected_move,
      current_price: historicalData.prices[historicalData.prices.length - 1],
      technical_indicators: {
        rsi: historicalData.technical_indicators.rsi[historicalData.technical_indicators.rsi.length - 1],
        macd: historicalData.technical_indicators.macd[historicalData.technical_indicators.macd.length - 1],
        sma_20: historicalData.technical_indicators.sma_20[historicalData.technical_indicators.sma_20.length - 1],
        sma_50: historicalData.technical_indicators.sma_50[historicalData.technical_indicators.sma_50.length - 1]
      },
      timestamp: new Date().toISOString()
    }
    
    console.log(`📤 [PREDICT] Enviando resposta:`, response)
    
    return NextResponse.json(response)
    
  } catch (error) {
    console.error('❌ [PREDICT] Prediction API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}