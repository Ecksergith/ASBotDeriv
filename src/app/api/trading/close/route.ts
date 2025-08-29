import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'
import { mockPrices, mockPortfolio, calculateFees, closeTradeOnPortfolio, tradeHistory, addTradeToHistory, TradeHistoryItem } from '@/lib/portfolio'

interface OpenTrade {
  id: string
  symbol: string
  type: 'buy' | 'sell'
  amount: number
  entry_price: number
  current_price: number
  quantity: number
  timestamp: string
  take_profit?: number
  stop_loss?: number
  ml_confidence: number
  unrealized_pnl: number
  status: 'open' | 'closed'
}

interface CloseTradeRequest {
  trade_id: string
  reason: 'take_profit' | 'stop_loss' | 'manual' | 'ml_signal'
  current_price?: number
}

interface CloseTradeResponse {
  success: boolean
  trade_id: string
  close_price: number
  close_timestamp: string
  realized_pnl: number
  fees: number
  reason: string
  message: string
}

// Mock open trades storage (in a real app, this would be in a database)
export let openTrades: OpenTrade[] = []

function updateTradePrices(): void {
  // Update current prices for all open trades
  openTrades.forEach(trade => {
    trade.current_price = mockPrices[trade.symbol]
    
    // Calculate unrealized PnL with proper handling for both positive and negative values
    if (trade.type === 'buy') {
      // For buy trades: profit when current price > entry price
      trade.unrealized_pnl = (trade.current_price - trade.entry_price) * trade.quantity
    } else {
      // For sell trades: profit when entry price > current price
      trade.unrealized_pnl = (trade.entry_price - trade.current_price) * trade.quantity
    }
    
    // Ensure minimum calculation to avoid zero values - CORRECTED SIGN LOGIC
    if (Math.abs(trade.unrealized_pnl) < 0.01 && trade.current_price !== trade.entry_price) {
      if (trade.type === 'buy') {
        // Buy trade: positive when current_price > entry_price
        if (trade.current_price > trade.entry_price) {
          trade.unrealized_pnl = Math.max(0.01, (trade.current_price - trade.entry_price) * trade.quantity)
        } else {
          trade.unrealized_pnl = Math.min(-0.01, (trade.current_price - trade.entry_price) * trade.quantity)
        }
      } else {
        // Sell trade: positive when entry_price > current_price
        if (trade.entry_price > trade.current_price) {
          trade.unrealized_pnl = Math.max(0.01, (trade.entry_price - trade.current_price) * trade.quantity)
        } else {
          trade.unrealized_pnl = Math.min(-0.01, (trade.entry_price - trade.current_price) * trade.quantity)
        }
      }
    }
  })
}

async function generateLSTMCloseSignal(trade: OpenTrade): Promise<{
  should_close: boolean
  confidence: number
  reasoning: string
  expected_move: number
}> {
  try {
    const zai = await ZAI.create()
    
    const priceChange = ((trade.current_price - trade.entry_price) / trade.entry_price) * 100
    const unrealizedPnLPercent = (trade.unrealized_pnl / (trade.entry_price * trade.quantity)) * 100
    
    const prompt = `
    Analyze the following open trade position and provide a close recommendation:
    
    Trade Details:
    - Symbol: ${trade.symbol}
    - Type: ${trade.type}
    - Entry Price: $${trade.entry_price.toFixed(2)}
    - Current Price: $${trade.current_price.toFixed(2)}
    - Price Change: ${priceChange.toFixed(2)}%
    - Unrealized P&L: ${unrealizedPnLPercent.toFixed(2)}%
    - ML Confidence at Entry: ${trade.ml_confidence}%
    - Trade Duration: ${Math.floor((Date.now() - new Date(trade.timestamp).getTime()) / (1000 * 60 * 60))} hours
    
    Based on LSTM analysis and market patterns, provide:
    1. Close recommendation (true/false)
    2. Confidence level (0-100%)
    3. Brief reasoning
    4. Expected additional price movement in percentage if held
    
    Consider factors such as:
    - Profit-taking opportunities
    - Risk reversal signals
    - Market momentum exhaustion
    - Time-based decay of edge
    
    Format your response as JSON:
    {
      "should_close": true,
      "confidence": 85,
      "reasoning": "Technical indicators suggest...",
      "expected_move": 1.5
    }
    `
    
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: 'You are an expert AI trading analyst specializing in position management and exit timing. Analyze open positions and provide optimal close recommendations based on LSTM analysis and market conditions.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3
    })
    
    const response = completion.choices[0]?.message?.content
    
    if (response) {
      try {
        const parsed = JSON.parse(response)
        return {
          should_close: parsed.should_close,
          confidence: parsed.confidence,
          reasoning: parsed.reasoning,
          expected_move: parsed.expected_move
        }
      } catch (parseError) {
        return generateRuleBasedCloseSignal(trade)
      }
    }
    
    return generateRuleBasedCloseSignal(trade)
    
  } catch (error) {
    console.error('LSTM close signal error:', error)
    return generateRuleBasedCloseSignal(trade)
  }
}

function generateRuleBasedCloseSignal(trade: OpenTrade): {
  should_close: boolean
  confidence: number
  reasoning: string
  expected_move: number
} {
  const priceChange = ((trade.current_price - trade.entry_price) / trade.entry_price) * 100
  const unrealizedPnLPercent = (trade.unrealized_pnl / (trade.entry_price * trade.quantity)) * 100
  
  // Rule-based close signals
  if (Math.abs(unrealizedPnLPercent) >= 10) {
    return {
      should_close: true,
      confidence: 90,
      reasoning: `Target profit/loss reached: ${unrealizedPnLPercent.toFixed(2)}%`,
      expected_move: 0
    }
  }
  
  if (Math.abs(priceChange) >= 5) {
    return {
      should_close: true,
      confidence: 75,
      reasoning: `Significant price movement: ${priceChange.toFixed(2)}%`,
      expected_move: priceChange * 0.3
    }
  }
  
  // Time-based close (after 24 hours)
  const tradeDuration = Date.now() - new Date(trade.timestamp).getTime()
  if (tradeDuration > 24 * 60 * 60 * 1000) { // 24 hours
    return {
      should_close: true,
      confidence: 60,
      reasoning: 'Maximum trade duration reached',
      expected_move: 0
    }
  }
  
  return {
    should_close: false,
    confidence: 30,
    reasoning: 'Hold position - no strong close signals',
    expected_move: priceChange * 0.1
  }
}

function checkTakeProfitStopLoss(trade: OpenTrade): {
  should_close: boolean
  reason: 'take_profit' | 'stop_loss' | 'none'
  current_price: number
} {
  const currentPrice = trade.current_price
  
  if (trade.take_profit && trade.type === 'buy' && currentPrice >= trade.take_profit) {
    return {
      should_close: true,
      reason: 'take_profit',
      current_price
    }
  }
  
  if (trade.take_profit && trade.type === 'sell' && currentPrice <= trade.take_profit) {
    return {
      should_close: true,
      reason: 'take_profit',
      current_price
    }
  }
  
  if (trade.stop_loss && trade.type === 'buy' && currentPrice <= trade.stop_loss) {
    return {
      should_close: true,
      reason: 'stop_loss',
      current_price
    }
  }
  
  if (trade.stop_loss && trade.type === 'sell' && currentPrice >= trade.stop_loss) {
    return {
      should_close: true,
      reason: 'stop_loss',
      current_price
    }
  }
  
  return {
    should_close: false,
    reason: 'none',
    current_price: trade.current_price
  }
}

function closeTrade(trade: OpenTrade, reason: 'take_profit' | 'stop_loss' | 'manual' | 'ml_signal', closePrice?: number): CloseTradeResponse {
  const price = closePrice || trade.current_price
  
  // Update portfolio using shared function
  const { updatedPortfolio, fees, realizedPnL } = closeTradeOnPortfolio({
    symbol: trade.symbol,
    type: trade.type,
    quantity: trade.quantity,
    price: trade.entry_price,
    closePrice: price
  }, mockPortfolio)
  
  // Update the shared portfolio (in a real app, this would update the database)
  Object.assign(mockPortfolio, updatedPortfolio)
  
  // Remove from open trades
  openTrades = openTrades.filter(t => t.id !== trade.id)
  
  // Add to trade history using shared function
  const historyItem: TradeHistoryItem = {
    id: trade.id,
    symbol: trade.symbol,
    type: trade.type,
    quantity: trade.quantity,
    entry_price: trade.entry_price,
    close_price: price,
    realized_pnl: realizedPnL,
    fees,
    close_timestamp: new Date().toISOString(),
    close_reason: reason
  }
  addTradeToHistory(historyItem)
  
  return {
    success: true,
    trade_id: trade.id,
    close_price: price,
    close_timestamp: new Date().toISOString(),
    realized_pnl: realizedPnL,
    fees,
    reason,
    message: `Trade closed successfully at $${price.toFixed(2)} (${reason})`
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { trade_id, reason, current_price }: CloseTradeRequest = body
    
    if (!trade_id || !reason) {
      return NextResponse.json(
        { error: 'Missing required fields: trade_id, reason' },
        { status: 400 }
      )
    }
    
    if (!['take_profit', 'stop_loss', 'manual', 'ml_signal'].includes(reason)) {
      return NextResponse.json(
        { error: 'Invalid close reason' },
        { status: 400 }
      )
    }
    
    // Update current prices
    updateTradePrices()
    
    const trade = openTrades.find(t => t.id === trade_id)
    if (!trade) {
      return NextResponse.json(
        { error: 'Trade not found or already closed' },
        { status: 404 }
      )
    }
    
    const result = closeTrade(trade, reason, current_price)
    
    console.log('Trade closed:', result)
    
    return NextResponse.json(result)
    
  } catch (error) {
    console.error('Trade close error:', error)
    return NextResponse.json(
      { error: 'Internal server error during trade close' },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    // Update current prices
    updateTradePrices()
    
    // Check for automatic close conditions
    const tradesToClose: OpenTrade[] = []
    
    for (const trade of openTrades) {
      // Check TP/SL conditions
      const tpSlCheck = checkTakeProfitStopLoss(trade)
      if (tpSlCheck.should_close) {
        tradesToClose.push(trade)
        continue
      }
      
      // Check LSTM signals for trades older than 1 hour
      const tradeAge = Date.now() - new Date(trade.timestamp).getTime()
      if (tradeAge > 60 * 60 * 1000) { // 1 hour
        const lstmSignal = await generateLSTMCloseSignal(trade)
        if (lstmSignal.should_close && lstmSignal.confidence > 70) {
          tradesToClose.push(trade)
        }
      }
    }
    
    // Close trades that meet conditions
    const closeResults = []
    for (const trade of tradesToClose) {
      const tpSlCheck = checkTakeProfitStopLoss(trade)
      if (tpSlCheck.should_close) {
        const result = closeTrade(trade, tpSlCheck.reason)
        closeResults.push(result)
      } else {
        const result = closeTrade(trade, 'ml_signal')
        closeResults.push(result)
      }
    }
    
    // Log para depuração - mostrar o estado atual do histórico de trades
    console.log(`📊 [CLOSE] Estado atual do histórico de trades fechados: ${tradeHistory.length} trades no total`)
    
    // Filtrar trades das últimas 24 horas para log
    const now = new Date()
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const recentTrades = tradeHistory.filter(trade => {
      const closeTime = new Date(trade.close_timestamp)
      return closeTime >= twentyFourHoursAgo
    })
    
    console.log(`📊 [CLOSE] Trades fechados nas últimas 24h: ${recentTrades.length}`)
    recentTrades.forEach((trade, index) => {
      console.log(`   - Trade ${index + 1}: ${trade.symbol} ${trade.type} | PnL: $${trade.realized_pnl.toFixed(2)} | Motivo: ${trade.close_reason}`)
    })
    
    return NextResponse.json({
      open_trades: openTrades,
      trade_history: tradeHistory.slice(-50), // Last 50 trades from shared history
      auto_closed_trades: closeResults,
      portfolio: mockPortfolio,
      current_prices: mockPrices,
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('Trade management error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Função para adicionar um novo trade (chamada do endpoint execute)
export function addOpenTrade(trade: any) {
  const quantity = trade.amount / trade.price
  
  const openTrade: OpenTrade = {
    id: trade.trade_id,
    symbol: trade.symbol,
    type: trade.type,
    amount: trade.amount,
    entry_price: trade.price,
    current_price: trade.price,
    quantity,
    timestamp: trade.timestamp,
    take_profit: trade.take_profit || (trade.type === 'buy' ? trade.price * 1.1 : trade.price * 0.9), // Default 10% TP
    stop_loss: trade.stop_loss || (trade.type === 'buy' ? trade.price * 0.95 : trade.price * 1.05), // Default 5% SL
    ml_confidence: trade.ml_confidence || 70,
    unrealized_pnl: 0, // Will be calculated on first price update
    status: 'open'
  }
  
  // Calculate initial unrealized PnL based on estimated profit
  if (trade.estimated_profit) {
    openTrade.unrealized_pnl = trade.estimated_profit
  }
  
  openTrades.push(openTrade)
  
  // Log para depuração
  console.log(`📝 [OPEN] Trade adicionado: ${trade.symbol} ${trade.type} | Preço: $${trade.price.toFixed(2)} | Quantidade: ${quantity.toFixed(6)}`)
}

// Função para forçar o fechamento de um trade para testes
export function forceCloseTradeForTesting(tradeId: string, reason: string = 'test'): CloseTradeResponse | null {
  const trade = openTrades.find(t => t.id === tradeId)
  if (!trade) {
    console.log(`❌ [TEST] Trade ${tradeId} não encontrado para fechamento`)
    return null
  }
  
  console.log(`🧪 [TEST] Forçando fechamento do trade ${tradeId} para teste`)
  const result = closeTrade(trade, reason as any)
  console.log(`✅ [TEST] Trade fechado para teste: ${result.message}`)
  
  return result
}