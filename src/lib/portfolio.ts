// Shared portfolio state that can be imported by multiple API routes

// Mock current prices (in a real app, this would come from a market data feed)
export const mockPrices: Record<string, number> = {
  'BTC': 45234.56,
  'ETH': 2345.67,
  'SOL': 98.76,
  'ADA': 0.45,
  'DOT': 7.89
}

// Shared portfolio balances (in a real app, this would come from a database)
export const mockPortfolio: Record<string, number> = {
  'USD': 10000,
  'BTC': 0.5,
  'ETH': 3.2,
  'SOL': 10,
  'ADA': 1000,
  'DOT': 50
}

// Trade history for tracking closed trades and their profits
export interface TradeHistoryItem {
  id: string
  symbol: string
  type: 'buy' | 'sell'
  quantity: number
  entry_price: number
  close_price: number
  realized_pnl: number
  fees: number
  close_timestamp: string
  close_reason: string
}

// Array to store trade history (in a real app, this would be in a database)
export const tradeHistory: TradeHistoryItem[] = []

// Armazenamento de preços anteriores para cálculo de variação
// Em uma aplicação real, isso viria de um banco de dados ou cache
export let previousPrices: Record<string, number> = { ...mockPrices }

// Função para atualizar os preços anteriores (usada quando os preços mudam)
export function updatePreviousPrices(currentPrices: Record<string, number>): void {
  // Só atualiza se houver uma diferença significativa para evitar atualizações desnecessárias
  const hasSignificantChange = Object.keys(currentPrices).some(symbol => {
    const current = currentPrices[symbol]
    const previous = previousPrices[symbol]
    return Math.abs(current - previous) / previous > 0.001 // 0.1% de variação
  })
  
  if (hasSignificantChange) {
    console.log(`🔄 [PRICES] Atualizando preços anteriores:`)
    Object.keys(currentPrices).forEach(symbol => {
      const current = currentPrices[symbol]
      const previous = previousPrices[symbol]
      if (current !== previous) {
        const change = ((current - previous) / previous) * 100
        console.log(`   - ${symbol}: $${previous.toFixed(2)} → $${current.toFixed(2)} (${change >= 0 ? '+' : ''}${change.toFixed(2)}%)`)
      }
    })
    
    previousPrices = { ...currentPrices }
  }
}

// Função para simular variação de preços (para testes)
export function simulatePriceVariation(volatility: number = 0.02): void {
  Object.keys(mockPrices).forEach(symbol => {
    if (symbol === 'USD') return // USD não varia
    
    const currentPrice = mockPrices[symbol]
    const variation = (Math.random() - 0.5) * 2 * volatility // Variação de -volatility a +volatility
    const newPrice = currentPrice * (1 + variation)
    
    // Garante que o preço não fique negativo
    mockPrices[symbol] = Math.max(newPrice, 0.01)
    
    console.log(`📈 [SIMULATION] ${symbol}: $${currentPrice.toFixed(2)} → $${mockPrices[symbol].toFixed(2)} (${variation >= 0 ? '+' : ''}${(variation * 100).toFixed(2)}%)`)
  })
}

// Função para calcular o valor total do portfólio
export function calculatePortfolioValue(portfolio: Record<string, number>, prices: Record<string, number>): number {
  return Object.entries(portfolio).reduce((sum: number, [symbol, amount]: [string, any]) => {
    if (symbol === 'USD') return sum + amount
    const price = prices[symbol] || 0
    return sum + (amount * price)
  }, 0)
}

// Função para calcular a variação de preço dos ativos no portfólio
// Calcula quanto o valor do portfólio mudou devido às variações de preço dos ativos detidos
export function calculatePriceVariationProfit(
  portfolio: Record<string, number>, 
  currentPrices: Record<string, number>, 
  previousPrices: Record<string, number>
): number {
  let priceVariationProfit = 0
  
  Object.entries(portfolio).forEach(([symbol, amount]) => {
    if (symbol === 'USD') return // USD não tem variação de preço
    
    const currentPrice = currentPrices[symbol] || 0
    const previousPrice = previousPrices[symbol] || currentPrice
    
    if (currentPrice !== previousPrice && amount > 0) {
      // Calcula a variação de valor para este ativo
      const currentValue = amount * currentPrice
      const previousValue = amount * previousPrice
      const variation = currentValue - previousValue
      
      priceVariationProfit += variation
      
      console.log(`💹 [PRICE] ${symbol}: ${amount.toFixed(6)} unidades | Preço: $${previousPrice.toFixed(2)} → $${currentPrice.toFixed(2)} | Variação: $${variation.toFixed(2)}`)
    }
  })
  
  return priceVariationProfit
}

// Função para calcular o desempenho total do portfólio (combina ambos os aspectos)
// 1. Variações de preço dos ativos detidos
// 2. PnL realizado de trades fechados
export function calculateTotalPortfolioPerformance(
  portfolio: Record<string, number>,
  currentPrices: Record<string, number>,
  previousPrices: Record<string, number>,
  closedTrades: TradeHistoryItem[]
): {
  totalValue: number
  priceVariationProfit: number
  realizedPnL: number
  totalPerformance: number
  performanceBreakdown: {
    assets: Array<{ symbol: string; amount: number; priceVariation: number; currentValue: number }>
    closedTrades: Array<{ symbol: string; type: string; realizedPnL: number; closeReason: string }>
  }
} {
  // Calcula o valor total atual do portfólio
  const totalValue = calculatePortfolioValue(portfolio, currentPrices)
  
  // Calcula o lucro/prejuízo não realizado (variação de preço dos ativos detidos)
  const priceVariationProfit = calculatePriceVariationProfit(portfolio, currentPrices, previousPrices)
  
  // Calcula o PnL realizado de trades fechados nas últimas 24 horas
  const realizedPnL = calculate24HourProfit(closedTrades, currentPrices)
  
  // Performance total = variação de preço + PnL realizado
  const totalPerformance = priceVariationProfit + realizedPnL
  
  // Detalhamento para análise
  const performanceBreakdown = {
    assets: Object.entries(portfolio)
      .filter(([symbol]) => symbol !== 'USD')
      .map(([symbol, amount]) => {
        const currentPrice = currentPrices[symbol] || 0
        const previousPrice = previousPrices[symbol] || currentPrice
        const currentValue = amount * currentPrice
        const priceVariation = amount * (currentPrice - previousPrice)
        
        return {
          symbol,
          amount,
          priceVariation,
          currentValue
        }
      }),
    closedTrades: closedTrades
      .filter(trade => {
        const closeTime = new Date(trade.close_timestamp)
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
        return closeTime >= twentyFourHoursAgo
      })
      .map(trade => ({
        symbol: trade.symbol,
        type: trade.type,
        realizedPnL: trade.realized_pnl,
        closeReason: trade.close_reason
      }))
  }
  
  console.log(`📊 [PORTFOLIO] Desempenho total calculado:`)
  console.log(`   - Valor total: $${totalValue.toFixed(2)}`)
  console.log(`   - Variação de preço: $${priceVariationProfit.toFixed(2)}`)
  console.log(`   - PnL realizado: $${realizedPnL.toFixed(2)}`)
  console.log(`   - Performance total (24h): $${totalPerformance.toFixed(2)}`)
  
  return {
    totalValue,
    priceVariationProfit,
    realizedPnL,
    totalPerformance,
    performanceBreakdown
  }
}

// Função para calcular o lucro das últimas 24 horas baseado em trades fechados e variações de preço
// Esta é a função principal que calcula o desempenho real do portfólio
export function calculate24HourProfit(trades: TradeHistoryItem[], currentPrices: Record<string, number>): number {
  const now = new Date()
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  
  // Filtra apenas os trades que foram fechados nas últimas 24 horas
  // Isso garante que estamos calculando apenas o lucro/prejuízo recente
  const recentTrades = trades.filter(trade => {
    const closeTime = new Date(trade.close_timestamp)
    return closeTime >= twentyFourHoursAgo && closeTime <= now
  })
  
  // Soma o PnL (Profit & Loss) realizado de todos os trades fechados
  // Este é o valor real que deve ser mostrado como variação 24h do portfólio
  const totalRealizedPnL = recentTrades.reduce((sum, trade) => sum + trade.realized_pnl, 0)
  
  // Log para depuração (pode ser removido em produção)
  console.log(`📊 [PORTFOLIO] Cálculo 24h: ${recentTrades.length} trades fechados, PnL total: $${totalRealizedPnL.toFixed(2)}`)
  
  return totalRealizedPnL
}

// Função para adicionar um trade fechado ao histórico
// Esta função é chamada sempre que um trade é fechado (take profit, stop loss, manual, etc.)
export function addTradeToHistory(trade: TradeHistoryItem): void {
  tradeHistory.push(trade)
  console.log(`📝 [HISTORY] Trade adicionado ao histórico: ${trade.symbol} ${trade.type} | PnL: $${trade.realized_pnl.toFixed(2)}`)
}

// Função para obter trades das últimas 24 horas
// Útil para relatórios e análise de desempenho recente
export function get24HourTrades(): TradeHistoryItem[] {
  const now = new Date()
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  
  return tradeHistory.filter(trade => {
    const closeTime = new Date(trade.close_timestamp)
    return closeTime >= twentyFourHoursAgo && closeTime <= now
  })
}

// Função para calcular taxas de trading
// Taxa atual: 0.1% do valor da operação
export function calculateFees(amount: number): number {
  // Calcula taxas de trading (0.1% neste exemplo)
  return amount * 0.001
}

// Função para validar se uma operação de trading pode ser executada
// Verifica saldo suficiente, símbolo válido, etc.
export function validateTrade(trade: {
  symbol: string
  type: 'buy' | 'sell'
  amount: number
}, portfolio: Record<string, number>, prices: Record<string, number>): { valid: boolean; message: string } {
  // Verifica se o símbolo existe
  if (!prices[trade.symbol]) {
    return { valid: false, message: 'Símbolo de trading inválido' }
  }
  
  // Verifica se o valor é positivo
  if (trade.amount <= 0) {
    return { valid: false, message: 'O valor da operação deve ser positivo' }
  }
  
  // Verifica se o usuário tem saldo suficiente
  const currentPrice = prices[trade.symbol]
  
  if (trade.type === 'buy') {
    // Para compras: verifica se tem USD suficiente
    const totalCost = trade.amount + calculateFees(trade.amount)
    if (portfolio['USD'] < totalCost) {
      return { valid: false, message: 'Saldo em USD insuficiente' }
    }
  } else {
    // Para vendas: verifica se tem o ativo suficiente
    const assetAmount = trade.amount / currentPrice
    if ((portfolio[trade.symbol] || 0) < assetAmount) {
      return { valid: false, message: `Saldo de ${trade.symbol} insuficiente` }
    }
  }
  
  return { valid: true, message: 'Validação de trade bem sucedida' }
}

// Função para executar uma operação de trading no portfólio
// Atualiza os saldos do portfólio após a execução de um trade
export function executeTradeOnPortfolio(trade: {
  symbol: string
  type: 'buy' | 'sell'
  amount: number
  price: number
}, portfolio: Record<string, number>): { updatedPortfolio: Record<string, number>; fees: number } {
  const fees = calculateFees(trade.amount)
  const updatedPortfolio = { ...portfolio }
  
  if (trade.type === 'buy') {
    // Operação de compra: subtrai USD e adiciona o ativo comprado
    updatedPortfolio['USD'] -= (trade.amount + fees)
    updatedPortfolio[trade.symbol] = (updatedPortfolio[trade.symbol] || 0) + (trade.amount / trade.price)
  } else {
    // Operação de venda: adiciona USD e subtrai o ativo vendido
    const assetAmount = trade.amount / trade.price
    updatedPortfolio[trade.symbol] -= assetAmount
    updatedPortfolio['USD'] += (trade.amount - fees)
  }
  
  return { updatedPortfolio, fees }
}

// Função para fechar um trade e calcular o PnL realizado
// Esta função é crucial para calcular o lucro/prejuízo real das operações
export function closeTradeOnPortfolio(trade: {
  symbol: string
  type: 'buy' | 'sell'
  quantity: number
  price: number
  closePrice: number
}, portfolio: Record<string, number>): { updatedPortfolio: Record<string, number>; fees: number; realizedPnL: number } {
  const fees = calculateFees(trade.quantity * trade.closePrice)
  const updatedPortfolio = { ...portfolio }
  let realizedPnL = 0
  
  if (trade.type === 'buy') {
    // Para trades de compra: lucro quando preço de fechamento > preço de entrada
    // Fórmula: (preço_fechamento - preço_entrada) * quantidade - taxas
    realizedPnL = (trade.closePrice - trade.price) * trade.quantity - fees
    updatedPortfolio[trade.symbol] -= trade.quantity
    updatedPortfolio['USD'] += (trade.closePrice * trade.quantity) - fees
  } else {
    // Para trades de venda: lucro quando preço de entrada > preço de fechamento
    // Fórmula: (preço_entrada - preço_fechamento) * quantidade - taxas
    realizedPnL = (trade.price - trade.closePrice) * trade.quantity - fees
    updatedPortfolio['USD'] -= (trade.closePrice * trade.quantity) + fees
    updatedPortfolio[trade.symbol] += trade.quantity
  }
  
  // Garante cálculo mínimo de PnL para evitar valores zero quando há diferença de preço
  if (Math.abs(realizedPnL) < 0.01 && trade.closePrice !== trade.price) {
    const priceDifference = Math.abs(trade.closePrice - trade.price)
    const basePnL = priceDifference * trade.quantity - fees
    
    // Aplica o sinal correto baseado no tipo de trade e movimento de preço
    if (trade.type === 'buy') {
      // Trade de compra: lucro quando closePrice > price
      realizedPnL = trade.closePrice > trade.price ? 
        Math.max(0.01, basePnL) : 
        Math.min(-0.01, -basePnL)
    } else {
      // Trade de venda: lucro quando price > closePrice
      realizedPnL = trade.price > trade.closePrice ? 
        Math.max(0.01, basePnL) : 
        Math.min(-0.01, -basePnL)
    }
  }
  
  return { updatedPortfolio, fees, realizedPnL }
}