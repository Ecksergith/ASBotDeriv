import { NextRequest, NextResponse } from 'next/server'
import { derivAuthService } from '@/lib/deriv-auth'
import { derivWebSocketService } from '@/lib/deriv-ws'
import { DERIV_SYMBOLS } from '@/lib/deriv'

interface MarketData {
  symbol: string
  name: string
  price: number
  change_24h: number
  change_percent_24h: number
  volume_24h: number
  market_cap: number
  high_24h: number
  low_24h: number
  last_updated: string
}

interface HistoricalData {
  symbol: string
  interval: string
  data: Array<{
    timestamp: string
    open: number
    high: number
    low: number
    close: number
    volume: number
  }>
}

// Cache para dados de mercado
const marketDataCache = new Map<string, { data: MarketData; timestamp: number }>()
const CACHE_DURATION = 30000 // 30 segundos

// Mapeamento de símbolos Deriv para nomes amigáveis
const SYMBOL_NAMES: Record<string, string> = {
  'R_10': 'Volatility 10 Index',
  'R_25': 'Volatility 25 Index',
  'R_50': 'Volatility 50 Index',
  'R_75': 'Volatility 75 Index',
  'R_100': 'Volatility 100 Index',
  'FRXEURUSD': 'EUR/USD',
  'FRXGBPUSD': 'GBP/USD',
  'FRXUSDJPY': 'USD/JPY',
  'FRXAUDUSD': 'AUD/USD',
  'FRXUSDCAD': 'USD/CAD',
  'CRASH_1000': 'Crash 1000 Index',
  'BOOM_1000': 'Boom 1000 Index'
}

// Símbolos padrão para monitoramento
const DEFAULT_SYMBOLS = ['R_10', 'R_25', 'R_50', 'R_75', 'R_100', 'FRXEURUSD', 'FRXGBPUSD']

// Gerar dados de mercado simulados baseados em ticks reais da Deriv
function generateMarketData(symbol: string, currentPrice: number): MarketData {
  const name = SYMBOL_NAMES[symbol] || symbol
  const change24h = (Math.random() - 0.5) * currentPrice * 0.1 // ±10% variação
  const changePercent24h = (change24h / (currentPrice - change24h)) * 100
  
  return {
    symbol,
    name,
    price: currentPrice,
    change_24h: change24h,
    change_percent_24h: changePercent24h,
    volume_24h: Math.random() * 1000000 + 500000,
    market_cap: Math.random() * 1000000000 + 100000000,
    high_24h: currentPrice * (1 + Math.random() * 0.05),
    low_24h: currentPrice * (1 - Math.random() * 0.05),
    last_updated: new Date().toISOString()
  }
}

// Obter dados de mercado para múltiplos símbolos
async function getMarketDataForSymbols(symbols: string[]): Promise<MarketData[]> {
  const marketData: MarketData[] = []
  
  for (const symbol of symbols) {
    // Verificar cache
    const cached = marketDataCache.get(symbol)
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      marketData.push(cached.data)
      continue
    }
    
    // Gerar dados simulados baseados no último preço conhecido
    // Em uma implementação real, você obteria os preços da API Deriv
    const mockPrice = getMockPriceForSymbol(symbol)
    const data = generateMarketData(symbol, mockPrice)
    
    // Cache os dados
    marketDataCache.set(symbol, { data, timestamp: Date.now() })
    marketData.push(data)
  }
  
  return marketData
}

// Obter preço simulado para um símbolo (em produção, viria da API Deriv)
function getMockPriceForSymbol(symbol: string): number {
  const prices: Record<string, number> = {
    'R_10': 1000.50,
    'R_25': 2500.75,
    'R_50': 5000.25,
    'R_75': 7500.80,
    'R_100': 10000.40,
    'FRXEURUSD': 1.0850,
    'FRXGBPUSD': 1.2750,
    'FRXUSDJPY': 149.50,
    'FRXAUDUSD': 0.6500,
    'FRXUSDCAD': 1.3600,
    'CRASH_1000': 1000.00,
    'BOOM_1000': 1000.00
  }
  
  return prices[symbol] || 100.00
}

// Gerar dados históricos simulados
function generateHistoricalData(symbol: string, interval: string = '1h', limit: number = 24): HistoricalData {
  const currentPrice = getMockPriceForSymbol(symbol)
  const data = []
  let basePrice = currentPrice * 0.95 // Preço inicial 5% menor
  
  for (let i = limit; i >= 0; i--) {
    const timestamp = new Date(Date.now() - i * (interval === '1h' ? 3600000 : 86400000))
    
    // Gerar movimentos de preço realistas
    const volatility = 0.02 // 2% volatilidade
    const change = (Math.random() - 0.5) * volatility
    basePrice = basePrice * (1 + change)
    
    const high = basePrice * (1 + Math.random() * 0.01)
    const low = basePrice * (1 - Math.random() * 0.01)
    const open = i === limit ? basePrice : data[data.length - 1].close
    const close = basePrice
    const volume = Math.random() * 1000000 + 500000
    
    data.push({
      timestamp: timestamp.toISOString(),
      open: Math.max(open, low),
      high: Math.max(high, open, close),
      low: Math.min(low, open, close),
      close: close,
      volume: volume
    })
  }
  
  return {
    symbol,
    interval,
    data
  }
}

function calculateMarketSummary(marketData: MarketData[]): {
  total_market_cap: number
  total_volume_24h: number
  btc_dominance: number
  top_gainers: Array<{ symbol: string; change_percent: number }>
  top_losers: Array<{ symbol: string; change_percent: number }>
} {
  const totalMarketCap = marketData.reduce((sum, data) => sum + data.market_cap, 0)
  const totalVolume = marketData.reduce((sum, data) => sum + data.volume_24h, 0)
  
  // Usar R_100 como referência para "dominância" (similar ao BTC)
  const r100MarketCap = marketData.find(data => data.symbol === 'R_100')?.market_cap || 0
  const r100Dominance = totalMarketCap > 0 ? (r100MarketCap / totalMarketCap) * 100 : 0
  
  const sortedByChange = [...marketData].sort((a, b) => b.change_percent_24h - a.change_percent_24h)
  const topGainers = sortedByChange.slice(0, 3).map(data => ({
    symbol: data.symbol,
    change_percent: data.change_percent_24h
  }))
  
  const topLosers = sortedByChange.slice(-3).map(data => ({
    symbol: data.symbol,
    change_percent: data.change_percent_24h
  }))
  
  return {
    total_market_cap: totalMarketCap,
    total_volume_24h: totalVolume,
    btc_dominance: r100Dominance,
    top_gainers: topGainers,
    top_losers: topLosers
  }
}

export async function GET(request: NextRequest) {
  try {
    // Verificar autenticação
    if (!derivAuthService.isAuthenticated()) {
      return NextResponse.json(
        { error: 'Não autenticado' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const symbol = searchParams.get('symbol')
    const historical = searchParams.get('historical')
    const interval = searchParams.get('interval') || '1h'
    const limit = parseInt(searchParams.get('limit') || '24')
    
    if (historical === 'true' && symbol) {
      // Retornar dados históricos para um símbolo específico
      const historicalData = generateHistoricalData(symbol, interval, limit)
      return NextResponse.json(historicalData)
    }
    
    if (symbol) {
      // Retornar dados para um símbolo específico
      const marketData = await getMarketDataForSymbols([symbol])
      if (marketData.length === 0) {
        return NextResponse.json(
          { error: 'Symbol not found' },
          { status: 404 }
        )
      }
      return NextResponse.json(marketData[0])
    }
    
    // Retornar todos os dados de mercado com resumo
    const marketData = await getMarketDataForSymbols(DEFAULT_SYMBOLS)
    const marketSummary = calculateMarketSummary(marketData)
    
    return NextResponse.json({
      data: marketData,
      summary: marketSummary,
      last_updated: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('Market data API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Simular atualizações de preço em tempo real
export async function POST(request: NextRequest) {
  try {
    // Verificar autenticação
    if (!derivAuthService.isAuthenticated()) {
      return NextResponse.json(
        { error: 'Não autenticado' },
        { status: 401 }
      )
    }

    const { symbols } = await request.json()
    
    if (!symbols || !Array.isArray(symbols)) {
      return NextResponse.json(
        { error: 'Symbols array is required' },
        { status: 400 }
      )
    }
    
    // Atualizar preços com pequenas mudanças aleatórias
    const updatedData = await getMarketDataForSymbols(symbols)
    
    return NextResponse.json({
      updated_data: updatedData,
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('Price update error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}