'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { TrendingUp, TrendingDown, DollarSign, BarChart3, Brain, Settings, Activity, Clock, RefreshCw, Key } from 'lucide-react'
import { 
  calculate24HourProfit, 
  tradeHistory as sharedTradeHistory,
  calculateTotalPortfolioPerformance,
  updatePreviousPrices,
  simulatePriceVariation,
  mockPrices,
  previousPrices
} from '@/lib/portfolio'
import DerivConfig from '@/components/DerivConfig'

// Interface para representar uma operação de trading realizada
interface Trade {
  id: string
  symbol: string
  type: 'buy' | 'sell'
  amount: number
  price: number
  timestamp: string
  profit: number
  mlConfidence: number
}

// Interface para representar uma operação aberta
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

// Interface para representar um ativo negociável
interface Asset {
  symbol: string
  name: string
  price: number
  change24h: number
  volume: number
  mlPrediction: 'buy' | 'sell' | 'hold'
  confidence: number
}

// Interface para representar o portfólio do usuário com informações dinâmicas
interface Portfolio {
  totalValue: number
  dailyChange: number
  priceVariationProfit: number // Variação devido a mudanças de preço dos ativos
  realizedPnL: number // Lucro/prejuízo realizado de trades fechados
  totalPerformance: number // Performance total (soma dos dois acima)
  assets: {
    symbol: string
    amount: number
    value: number
    change: number
    priceVariation: number // Variação de preço individual do ativo
  }[]
}

// Função para gerar lucro padrão quando o estimated_profit é 0 ou indefinido
function generateDefaultProfit(type: 'buy' | 'sell', amount: number): number {
  const baseRate = 0.005 // 0.5% base rate
  const randomFactor = 0.5 + Math.random() // Random factor between 0.5 and 1.5
  
  // Gera um lucro base positivo
  let profit = amount * baseRate * randomFactor
  
  // 40% de chance de ser prejuízo para realismo
  if (Math.random() < 0.4) {
    profit *= -1
  }
  
  // Garante valor mínimo
  if (Math.abs(profit) < 0.01) {
    profit = Math.random() < 0.5 ? 0.01 : -0.01
  }
  
  return profit
}

export default function MLTradingBot() {
  // Estados para gerenciar dados da aplicação
  const [assets, setAssets] = useState<Asset[]>([]) // Lista de ativos disponíveis
  const [portfolio, setPortfolio] = useState<Portfolio>({ 
    totalValue: 0, 
    dailyChange: 0, 
    priceVariationProfit: 0, 
    realizedPnL: 0, 
    totalPerformance: 0,
    assets: [] 
  }) // Dados do portfólio
  const [previousPortfolioValue, setPreviousPortfolioValue] = useState(0) // Valor anterior do portfólio para cálculo de variação diária
  const [trades, setTrades] = useState<Trade[]>([]) // Histórico de operações realizadas
  const [isBotActive, setIsBotActive] = useState(false) // Status do bot (ativo/inativo)
  const [isAutoTradeEnabled, setIsAutoTradeEnabled] = useState(false) // Status do trading automático
  
  // Estados para atualização dinâmica de preços
  const [lastPriceUpdate, setLastPriceUpdate] = useState<Date>(new Date())
  const [isUpdatingPrices, setIsUpdatingPrices] = useState(false)
  const [priceUpdateInterval, setPriceUpdateInterval] = useState<NodeJS.Timeout | null>(null)
  
  // Configurações do trading automático
  const [autoTradeSettings, setAutoTradeSettings] = useState({
    enabledAssets: ['BTC', 'ETH', 'SOL'], // Ativos habilitados para trading automático
    minConfidence: 30, // Confiança mínima para executar operações (reduzido para teste)
    maxDailyTrades: 10, // Número máximo de operações diárias
    tradeInterval: 30, // Intervalo entre operações em segundos
    riskMultiplier: 1.0 // Multiplicador de risco
  })
  
  // Função para aplicar configurações sugeridas baseadas no nível de risco
  const applySuggestedRiskSettings = () => {
    const config = getCurrentRiskConfig()
    
    addLog(`⚙️ [RISK] Aplicando configurações sugeridas para nível ${botSettings.riskLevel}`)
    
    setBotSettings(prev => ({
      ...prev,
      stopLoss: config.suggestedStopLoss,
      takeProfit: config.suggestedTakeProfit
    }))
    
    addLog(`📊 [RISK] Configurações aplicadas:`)
    addLog(`   - Stop Loss: ${config.suggestedStopLoss}%`)
    addLog(`   - Take Profit: ${config.suggestedTakeProfit}%`)
    
    setMlStatus('Configurações de risco aplicadas com sucesso!')
    setTimeout(() => {
      setMlStatus('Bot pronto para operar')
    }, 2000)
  }

  // Função mais eficaz para gerenciar o Nível de Risco
  const handleRiskLevelChange = (newRiskLevel: 'low' | 'medium' | 'high') => {
    addLog(`⚙️ [RISK] Alterando nível de risco: ${botSettings.riskLevel} → ${newRiskLevel}`)
    
    // Configurações baseadas no nível de risco
    const riskConfigs = {
      low: {
        multiplier: 0.5,
        suggestedStopLoss: 3.0,
        suggestedTakeProfit: 6.0,
        maxTradePercentage: 5, // 5% do portfólio
        description: 'Risco Baixo - Operações conservadoras com menor ganho potencial',
        color: 'text-green-400'
      },
      medium: {
        multiplier: 1.0,
        suggestedStopLoss: 5.0,
        suggestedTakeProfit: 10.0,
        maxTradePercentage: 10, // 10% do portfólio
        description: 'Risco Médio - Equilíbrio entre risco e recompensa',
        color: 'text-yellow-400'
      },
      high: {
        multiplier: 1.5,
        suggestedStopLoss: 8.0,
        suggestedTakeProfit: 15.0,
        maxTradePercentage: 20, // 20% do portfólio
        description: 'Risco Alto - Operações agressivas com maior potencial de ganho/perda',
        color: 'text-red-400'
      }
    }

    const config = riskConfigs[newRiskLevel]
    
    // Atualiza as configurações do bot com base no novo nível de risco
    setBotSettings(prev => ({
      ...prev,
      riskLevel: newRiskLevel,
      // Opcionalmente ajusta automaticamente Stop Loss e Take Profit sugeridos
      // stopLoss: config.suggestedStopLoss,
      // takeProfit: config.suggestedTakeProfit
    }))

    // Adiciona log detalhado sobre a mudança
    addLog(`📊 [RISK] Nova configuração aplicada:`)
    addLog(`   - Multiplicador: ${config.multiplier}x`)
    addLog(`   - Stop Loss sugerido: ${config.suggestedStopLoss}%`)
    addLog(`   - Take Profit sugerido: ${config.suggestedTakeProfit}%`)
    addLog(`   - Máximo por operação: ${config.maxTradePercentage}% do portfólio`)
    addLog(`   - Descrição: ${config.description}`)

    // Mostra notificação visual (pode ser implementada com toast se desejar)
    setMlStatus(`Nível de risco alterado para: ${newRiskLevel === 'low' ? 'Baixo' : newRiskLevel === 'medium' ? 'Médio' : 'Alto'}`)
    
    // Limpa a mensagem após 3 segundos
    setTimeout(() => {
      setMlStatus('Bot pronto para operar')
    }, 3000)
  }

  // Função para obter as informações do nível de risco atual
  const getCurrentRiskConfig = () => {
    const riskConfigs = {
      low: {
        multiplier: 0.5,
        suggestedStopLoss: 3.0,
        suggestedTakeProfit: 6.0,
        maxTradePercentage: 5,
        description: 'Risco Baixo - Operações conservadoras com menor ganho potencial',
        color: 'text-green-400',
        bgColor: 'bg-green-900/20',
        borderColor: 'border-green-700'
      },
      medium: {
        multiplier: 1.0,
        suggestedStopLoss: 5.0,
        suggestedTakeProfit: 10.0,
        maxTradePercentage: 10,
        description: 'Risco Médio - Equilíbrio entre risco e recompensa',
        color: 'text-yellow-400',
        bgColor: 'bg-yellow-900/20',
        borderColor: 'border-yellow-700'
      },
      high: {
        multiplier: 1.5,
        suggestedStopLoss: 8.0,
        suggestedTakeProfit: 15.0,
        maxTradePercentage: 20,
        description: 'Risco Alto - Operações agressivas com maior potencial de ganho/perda',
        color: 'text-red-400',
        bgColor: 'bg-red-900/20',
        borderColor: 'border-red-700'
      }
    }
    return riskConfigs[botSettings.riskLevel]
  }

  // Configurações gerais do bot
  const [botSettings, setBotSettings] = useState({
    riskLevel: 'medium', // Nível de risco (low, medium, high)
    maxTradeSize: 10, // Tamanho máximo da operação
    stopLoss: 5.0, // Stop loss em porcentagem
    takeProfit: 10.0, // Take profit em porcentagem
    mlModel: 'lstm' // Modelo de machine learning
  })
  
  // Estados para interface do usuário
  const [selectedAsset, setSelectedAsset] = useState('') // Ativo selecionado para operação manual
  const [tradeAmount, setTradeAmount] = useState('') // Valor da operação manual
  const [mlStatus, setMlStatus] = useState('Treinando modelos ML...') // Status do processamento ML
  const [loading, setLoading] = useState(false) // Estado de carregamento
  const [error, setError] = useState('') // Mensagens de erro
  const [logs, setLogs] = useState<string[]>([]) // Logs de depuração
  
  // Contadores e estados de controle
  const [dailyTradeCount, setDailyTradeCount] = useState(0) // Contador de operações diárias
  const [lastTradeReset, setLastTradeReset] = useState(new Date().toDateString()) // Data do último reset do contador
  const [openTrades, setOpenTrades] = useState<OpenTrade[]>([]) // Operações abertas
  const [autoClosedTrades, setAutoClosedTrades] = useState<any[]>([]) // Operações fechadas automaticamente

  // Função para resetar o contador diário (pode ser chamada manualmente para testes)
  const resetDailyTradeCounter = () => {
    addLog(`🔄 [DEBUG] Resetando manualmente o contador diário de trades`)
    setDailyTradeCount(0)
    setLastTradeReset(new Date().toDateString())
  }

  // Função para testar Auto Trade manualmente
  const testAutoTrade = async () => {
    addLog(`🧪 [TEST] Iniciando teste manual do Auto Trade...`)
    addLog(`📊 [TEST] Status atual: isBotActive=${isBotActive}, isAutoTradeEnabled=${isAutoTradeEnabled}`)
    
    if (!isBotActive || !isAutoTradeEnabled) {
      addLog(`❌ [TEST] Bot ou Auto Trade não estão ativos. Ativando temporariamente para teste...`)
      const wasBotActive = isBotActive
      const wasAutoTradeEnabled = isAutoTradeEnabled
      
      setIsBotActive(true)
      setIsAutoTradeEnabled(true)
      
      // Espera um pouco para os estados atualizarem
      await new Promise(resolve => setTimeout(resolve, 100))
      
      addLog(`✅ [TEST] Bot e Auto Trade ativados. Executando teste...`)
      await executeAutoTradeAPI()
      
      // Restaura os estados originais
      setIsBotActive(wasBotActive)
      setIsAutoTradeEnabled(wasAutoTradeEnabled)
    } else {
      addLog(`✅ [TEST] Bot e Auto Trade já estão ativos. Executando teste...`)
      await executeAutoTradeAPI()
    }
    
    addLog(`🏁 [TEST] Teste do Auto Trade concluído`)
  }

  // Função para adicionar logs à interface
  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString()
    const logEntry = `[${timestamp}] ${message}`
    setLogs(prev => {
      const newLogs = [...prev, logEntry]
      // Manter apenas os últimos 100 logs para evitar sobrecarga
      return newLogs.slice(-100)
    })
    // Também manter o console.log para depuração
    console.log(message)
  }

  // Função para atualizar preços dinamicamente
  const updatePricesDynamically = async () => {
    if (isUpdatingPrices) return
    
    setIsUpdatingPrices(true)
    try {
      addLog('🔄 [PRICES] Iniciando atualização dinâmica de preços...')
      
      // Simular variação de preços para demonstração
      simulatePriceVariation(0.015) // 1.5% de volatilidade
      
      // Atualizar preços anteriores antes de buscar novos dados
      updatePreviousPrices(mockPrices)
      
      // Buscar dados de mercado atualizados
      await fetchMarketData()
      
      // Atualizar dados do portfólio com os novos preços
      await fetchPortfolioData()
      
      setLastPriceUpdate(new Date())
      addLog('✅ [PRICES] Preços atualizados com sucesso')
      
    } catch (error) {
      addLog(`❌ [PRICES] Erro na atualização de preços: ${error}`)
    } finally {
      setIsUpdatingPrices(false)
    }
  }

  // Função para iniciar atualização automática de preços
  const startPriceAutoUpdate = (intervalMs: number = 10000) => {
    if (priceUpdateInterval) {
      clearInterval(priceUpdateInterval)
    }
    
    addLog(`⚡ [AUTO] Iniciando atualização automática de preços (${intervalMs}ms)`)
    
    const interval = setInterval(async () => {
      await updatePricesDynamically()
    }, intervalMs)
    
    setPriceUpdateInterval(interval)
  }

  // Função para parar atualização automática de preços
  const stopPriceAutoUpdate = () => {
    if (priceUpdateInterval) {
      clearInterval(priceUpdateInterval)
      setPriceUpdateInterval(null)
      addLog('⏹️ [AUTO] Atualização automática de preços parada')
    }
  }

  // Função para buscar dados de mercado da API
  const fetchMarketData = async () => {
    try {
      addLog('🌐 [MARKET] Buscando dados de mercado...')
      const response = await fetch('/api/trading/market')
      const data = await response.json()
      addLog(`📊 [MARKET] Dados de mercado recebidos: ${JSON.stringify(data)}`)
      
      if (data.data) {
        // Formata os dados dos ativos recebidos da API
        const formattedAssets = data.data.map((asset: any) => ({
          symbol: asset.symbol,
          name: asset.name,
          price: asset.price,
          change24h: asset.change_percent_24h,
          volume: asset.volume_24h,
          mlPrediction: 'hold' as const, // Será atualizado pelas previsões ML
          confidence: 0
        }))
        addLog(`📋 [MARKET] Ativos formatados: ${formattedAssets.length} ativos`)
        setAssets(formattedAssets)
        // Seleciona o primeiro ativo como padrão se nenhum estiver selecionado
        if (formattedAssets.length > 0 && !selectedAsset) {
          setSelectedAsset(formattedAssets[0].symbol)
        }
      } else {
        addLog('❌ [MARKET] Nenhum dado de mercado recebido')
      }
    } catch (err) {
      addLog(`❌ [MARKET] Erro ao buscar dados de mercado: ${err}`)
      setError('Failed to fetch market data')
    }
  }

  // Função para buscar dados de gerenciamento de operações (operações abertas e fechadas automaticamente)
  const fetchTradeManagementData = async () => {
    try {
      const response = await fetch('/api/trading/close')
      const data = await response.json()
      
      // Atualiza as listas de operações abertas e fechadas automaticamente
      setOpenTrades(data.open_trades || [])
      setAutoClosedTrades(data.auto_closed_trades || [])
      
      // Exibe notificações para operações fechadas automaticamente
      if (data.auto_closed_trades && data.auto_closed_trades.length > 0) {
        data.auto_closed_trades.forEach((trade: any) => {
          addLog(`🔄 [TRADE] Operação ${trade.trade_id} fechada automaticamente: ${trade.reason}`)
        })
      }
    } catch (err) {
      addLog(`❌ [TRADE] Erro ao buscar dados de gerenciamento: ${err}`)
    }
  }

  // Função para buscar dados do portfólio da API
  const fetchPortfolioData = async () => {
    try {
      const response = await fetch('/api/trading/execute')
      const data = await response.json()
      
      if (data.portfolio) {
          // Calcula o valor total do portfólio somando todos os ativos
        const totalValue = Object.entries(data.portfolio).reduce((sum: number, [symbol, amount]: [string, any]) => {
          if (symbol === 'USD') return sum + amount
          const price = data.current_prices[symbol] || 0
          return sum + (amount * price)
        }, 0)
        
        // Busca dados de trades fechados para cálculo completo
        let closedTradesData: any[] = []
        try {
          const closeResponse = await fetch('/api/trading/close')
          const closeData = await closeResponse.json()
          closedTradesData = closeData.trade_history || []
        } catch (err) {
          addLog(`⚠️ [PORTFOLIO] Erro ao buscar trades fechados: ${err}`)
        }
        
        // Usa a nova função de cálculo dinâmico do portfólio
        const performance = calculateTotalPortfolioPerformance(
          data.portfolio,
          data.current_prices || {},
          previousPrices,
          closedTradesData
        )
        
        // Log detalhado do cálculo dinâmico
        addLog(`📊 [PORTFOLIO] CÁLCULO DINÂMICO DO PORTFÓLIO:`)
        addLog(`   - Valor total: $${performance.totalValue.toFixed(2)}`)
        addLog(`   - Variação de preços: $${performance.priceVariationProfit.toFixed(2)}`)
        addLog(`   - PnL realizado: $${performance.realizedPnL.toFixed(2)}`)
        addLog(`   - Performance total (24h): $${performance.totalPerformance.toFixed(2)}`)
        
        // Detalha os ativos e suas variações
        performance.performanceBreakdown.assets.forEach((asset, index) => {
          addLog(`   - Ativo ${index + 1}: ${asset.symbol} | Variação: $${asset.priceVariation.toFixed(2)} | Valor: $${asset.currentValue.toFixed(2)}`)
        })
        
        // Detalha os trades fechados
        performance.performanceBreakdown.closedTrades.forEach((trade, index) => {
          addLog(`   - Trade ${index + 1}: ${trade.symbol} ${trade.type} | PnL: $${trade.realizedPnL.toFixed(2)} | Motivo: ${trade.closeReason}`)
        })
        
        setPortfolio({
          totalValue: performance.totalValue,
          dailyChange: performance.totalPerformance, // Usa a performance total como variação diária
          priceVariationProfit: performance.priceVariationProfit,
          realizedPnL: performance.realizedPnL,
          totalPerformance: performance.totalPerformance,
          assets: Object.entries(data.portfolio).map(([symbol, amount]: [string, any]) => {
            const currentPrice = data.current_prices[symbol] || 0
            const previousPrice = previousPrices[symbol] || currentPrice
            const priceVariation = symbol !== 'USD' ? amount * (currentPrice - previousPrice) : 0
            
            return {
              symbol,
              amount,
              value: symbol === 'USD' ? amount : amount * currentPrice,
              change: 0, // Será calculado com base nas mudanças de preço
              priceVariation
            }
          })
        })
      }
    } catch (err) {
      addLog(`❌ [PORTFOLIO] Erro ao buscar dados do portfólio: ${err}`)
    }
  }

  // Função para obter previsão de Machine Learning para um ativo específico
  const getPrediction = async (symbol: string) => {
    try {
      addLog(`🔮 [ML] Buscando previsão ML para ${symbol}...`)
      const response = await fetch('/api/trading/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol })
      })
      
      if (!response.ok) {
        addLog(`❌ [ML] Erro na resposta da API para ${symbol}: ${response.status} ${response.statusText}`)
        return null
      }
      
      const prediction = await response.json()
      addLog(`📈 [ML] Previsão recebida para ${symbol}: ${JSON.stringify(prediction)}`)
      
      // Validação dos dados recebidos
      if (!prediction.prediction || !prediction.confidence) {
        addLog(`❌ [ML] Previsão inválida para ${symbol}: ${JSON.stringify(prediction)}`)
        return null
      }
      
      // Atualiza o ativo com a previsão recebida
      setAssets(prev => prev.map(asset => 
        asset.symbol === symbol 
          ? { 
              ...asset, 
              mlPrediction: prediction.prediction, 
              confidence: prediction.confidence 
            }
          : asset
      ))
      
      return prediction
    } catch (err) {
      addLog(`❌ [ML] Erro ao obter previsão para ${symbol}: ${err}`)
      return null
    }
  }

  // Função para executar uma operação de trading através da API
  const executeTradeAPI = async (symbol: string, type: 'buy' | 'sell', amount: number, mlConfidence?: number, takeProfit?: number, stopLoss?: number) => {
    try {
      setLoading(true)
      setError('')
      
      const response = await fetch('/api/trading/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          type,
          amount,
          ml_confidence: mlConfidence,
          take_profit: takeProfit,
          stop_loss: stopLoss
        })
      })
      
      const result = await response.json()
      
      if (result.success) {
        // Atualiza o contador de operações diárias
        const today = new Date().toDateString()
        if (today !== lastTradeReset) {
          setDailyTradeCount(1)
          setLastTradeReset(today)
        } else {
          setDailyTradeCount(prev => prev + 1)
        }
        
        // Adiciona a operação ao histórico
        const newTrade: Trade = {
          id: result.trade_id,
          symbol: result.symbol,
          type: result.type,
          amount: result.amount,
          price: result.price,
          timestamp: result.timestamp,
          profit: result.estimated_profit !== undefined && result.estimated_profit !== 0 ? 
                  result.estimated_profit : 
                  generateDefaultProfit(result.type, result.amount),
          mlConfidence: mlConfidence || 0
        }
        
        setTrades(prev => [newTrade, ...prev])
        
        // Atualiza o portfólio
        await fetchPortfolioData()
        
        // Atualiza as operações abertas
        await fetchTradeManagementData()
        
        return result
      } else {
        setError(result.message || 'Trade execution failed')
        return null
      }
    } catch (err) {
      console.error('Error executing trade:', err)
      setError('Failed to execute trade')
      return null
    } finally {
      setLoading(false)
    }
  }

  // Hook useEffect para inicialização de dados e configuração de atualizações em tempo real
  useEffect(() => {
    addLog('🚀 [INIT] useEffect sendo executado - configurando todos os intervalos...')
    const initializeData = async () => {
      addLog('🚀 [INIT] Inicializando dados da aplicação...')
      addLog(`📊 [INIT] Estado inicial: isBotActive=${isBotActive}, isAutoTradeEnabled=${isAutoTradeEnabled}, dailyTradeCount=${dailyTradeCount}`)
      
      // Busca dados iniciais das APIs
      addLog('🌐 [INIT] Buscando dados de mercado...')
      await fetchMarketData()
      
      addLog('💰 [INIT] Buscando dados do portfólio...')
      await fetchPortfolioData()
      
      addLog('🔄 [INIT] Buscando dados de gerenciamento de operações...')
      await fetchTradeManagementData()
      
      // Obtém previsões iniciais para os ativos habilitados
      const enabledAssets = autoTradeSettings.enabledAssets
      addLog(`🎯 [INIT] Ativos habilitados para previsões iniciais: ${enabledAssets.join(', ')}`)
      
      for (const symbol of enabledAssets) {
        addLog(`🔮 [INIT] Obtendo previsão para ${symbol}...`)
        await getPrediction(symbol)
      }
      
      addLog('✅ [INIT] Inicialização concluída!')
      addLog(`📊 [INIT] Estado final dos ativos: ${assets.length} ativos carregados`)
      
      // Inicia atualização automática de preços
      startPriceAutoUpdate(1000) // Atualiza a cada 1 segundo
      
      // Log detalhado do estado final dos ativos
      if (assets.length > 0) {
        addLog('🔍 [INIT] Detalhamento dos ativos carregados:')
        assets.forEach(asset => {
          addLog(`   - ${asset.symbol}: preço=${asset.price.toFixed(2)}, confiança=${asset.confidence}%, previsão=${asset.mlPrediction}`)
        })
      } else {
        addLog('⚠️ [INIT] ATENÇÃO: Nenhum ativo foi carregado!')
      }
    }

    initializeData()

    // Configura atualizações em tempo real dos preços
    const priceInterval = setInterval(async () => {
      try {
        const symbols = assets.map(asset => asset.symbol)
        if (symbols.length === 0) {
          addLog('⏭️ [PRICE] Nenhum ativo disponível para atualizar preços')
          return
        }
        
        addLog(`🔄 [PRICE] Atualizando preços dos ativos: ${symbols.join(', ')}`)
        const response = await fetch('/api/trading/market', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbols })
        })
        const data = await response.json()
        addLog(`📊 [PRICE] Dados atualizados recebidos: ${JSON.stringify(data)}`)
        
        if (data.updated_data) {
          // Atualiza os preços dos ativos com os dados recebidos
          setAssets(prev => prev.map(asset => {
            const updated = data.updated_data.find((u: any) => u.symbol === asset.symbol)
            return updated ? { ...asset, price: updated.price, change24h: updated.change_percent_24h } : asset
          }))
        }
      } catch (err) {
        addLog(`❌ [PRICE] Erro ao atualizar preços: ${err}`)
      }
    }, 3000) // Atualiza a cada 3 segundos

    // Simula atualizações de status do ML
    const mlInterval = setInterval(() => {
      const statuses = [
        'Analisando padrões de mercado...',
        'Processando dados históricos...',
        'Executando redes neurais...',
        'Gerando previsões...',
        'Otimizando estratégia de trading...'
      ]
      setMlStatus(statuses[Math.floor(Math.random() * statuses.length)])
    }, 5000) // Atualiza a cada 5 segundos

    // Atualização periódica de previsões ML
    const predictionUpdateInterval = setInterval(async () => {
      if (isBotActive && assets.length > 0) {
        addLog('🔄 [ML] Atualizando previsões ML para todos os ativos...')
        
        // Atualiza previsões para todos os ativos
        for (const asset of assets) {
          try {
            await getPrediction(asset.symbol)
          } catch (error) {
            addLog(`❌ [ML] Erro ao atualizar previsão para ${asset.symbol}: ${error}`)
          }
        }
        
        addLog('✅ [ML] Previsões atualizadas para todos os ativos')
      }
    }, 60000) // Atualiza a cada 60 segundos (1 minuto)

    // Lógica de trading automático
    addLog(`⚡ [AUTO TRADE] Configurando intervalo de auto trade: ${autoTradeSettings.tradeInterval}s`)
    const autoTradeInterval = setInterval(async () => {
      addLog('⏰ [AUTO TRADE] Intervalo de auto trade acionado...')
      addLog(`🤖 [AUTO TRADE] Status: isBotActive=${isBotActive}, isAutoTradeEnabled=${isAutoTradeEnabled}`)
      addLog(`📊 [AUTO TRADE] Data atual: ${new Date().toDateString()}, último reset: ${lastTradeReset}`)
      addLog(`📊 [AUTO TRADE] Contador diário: ${dailyTradeCount}/${autoTradeSettings.maxDailyTrades}`)
      
      // Verifica se precisa resetar o contador diário
      const today = new Date().toDateString()
      if (today !== lastTradeReset) {
        addLog(`🔄 [AUTO TRADE] Resetando contador diário (mudança de data)`)
        setDailyTradeCount(0)
        setLastTradeReset(today)
      }
      
      if (isBotActive && isAutoTradeEnabled) {
        addLog('🚀 [AUTO TRADE] Iniciando execução de auto trade...')
        await executeAutoTradeAPI()
      } else {
        addLog('⏸️ [AUTO TRADE] Auto trade pausado - bot não ativo ou auto trade desativado')
      }
    }, autoTradeSettings.tradeInterval * 1000) // Executa conforme intervalo configurado
    
    addLog(`✅ [AUTO TRADE] Intervalo configurado com sucesso: ${autoTradeSettings.tradeInterval}s`)

    // Monitoramento de gerenciamento de operações
    const tradeManagementInterval = setInterval(async () => {
      if (isBotActive) {
        await fetchTradeManagementData()
      }
    }, 10000) // Verifica a cada 10 segundos condições de fechamento automático

    // Log de depuração do estado do auto trade
    const debugInterval = setInterval(() => {
      addLog(`🔍 [DEBUG] Estado do Auto Trade: isBotActive=${isBotActive}, isAutoTradeEnabled=${isAutoTradeEnabled}, dailyTradeCount=${dailyTradeCount}, maxDailyTrades=${autoTradeSettings.maxDailyTrades}, assetsCount=${assets.length}, eligibleAssets=${assets.filter(asset => 
        autoTradeSettings.enabledAssets.includes(asset.symbol) &&
        asset.confidence >= autoTradeSettings.minConfidence &&
        asset.mlPrediction !== 'hold'
      ).length}`)
    }, 30000) // Log a cada 30 segundos

    return () => {
      // Limpa todos os intervalos quando o componente é desmontado
      clearInterval(priceInterval)
      clearInterval(mlInterval)
      clearInterval(autoTradeInterval)
      clearInterval(tradeManagementInterval)
      clearInterval(debugInterval)
      stopPriceAutoUpdate() // Para a atualização automática de preços
    }
  }, [isBotActive, isAutoTradeEnabled, autoTradeSettings.tradeInterval]) // Removido assets.length das dependências

  // Função para executar operação manual de trading
  const executeTrade = async (type: 'buy' | 'sell') => {
    if (!selectedAsset || !tradeAmount) return

    const amount = parseFloat(tradeAmount)
    if (isNaN(amount) || amount <= 0) {
      setError('Invalid trade amount')
      return
    }

    // Obtém a previsão atual para o ativo selecionado
    const asset = assets.find(a => a.symbol === selectedAsset)
    if (!asset) return

    await executeTradeAPI(selectedAsset, type, amount, asset.confidence)
    setTradeAmount('')
  }

  // Função para fechar uma operação através da API
  const closeTradeAPI = async (tradeId: string, reason: 'take_profit' | 'stop_loss' | 'manual' | 'ml_signal') => {
    try {
      setLoading(true)
      setError('')
      
      const response = await fetch('/api/trading/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trade_id: tradeId,
          reason
        })
      })
      
      const result = await response.json()
      
      if (result.success) {
        // Atualiza as operações abertas
        await fetchTradeManagementData()
        
        // Atualiza o portfólio
        await fetchPortfolioData()
        
        return result
      } else {
        setError(result.message || 'Failed to close trade')
        return null
      }
    } catch (err) {
      console.error('Error closing trade:', err)
      setError('Failed to close trade')
      return null
    } finally {
      setLoading(false)
    }
  }

  // Função para executar trading automático baseado em previsões ML
  const executeAutoTradeAPI = async () => {
    addLog('🤖 [AUTO TRADE] Iniciando execução de auto trade...')
    addLog(`📊 [AUTO TRADE] Status: isBotActive=${isBotActive}, isAutoTradeEnabled=${isAutoTradeEnabled}`)
    addLog(`📈 [AUTO TRADE] Contador diário: ${dailyTradeCount}/${autoTradeSettings.maxDailyTrades}`)
    addLog(`💰 [AUTO TRADE] Valor total do portfólio: ${portfolio.totalValue.toFixed(2)}`)
    
    // Verifica se atingiu o limite diário de operações
    if (dailyTradeCount >= autoTradeSettings.maxDailyTrades) {
      addLog('❌ [AUTO TRADE] Limite diário de operações atingido')
      return
    }

    // Encontra ativos que atendem aos critérios de trading automático
    addLog('🔍 [AUTO TRADE] Verificando ativos elegíveis...')
    addLog(`📋 [AUTO TRADE] Ativos disponíveis: ${assets.length}`)
    addLog(`⚙️ [AUTO TRADE] Configurações: ${JSON.stringify(autoTradeSettings)}`)
    
    // Mostra detalhes de todos os ativos para depuração
    addLog(`📊 [AUTO TRADE] Análise detalhada dos ativos:`)
    assets.forEach(asset => {
      const isEnabled = autoTradeSettings.enabledAssets.includes(asset.symbol)
      const hasConfidence = asset.confidence >= autoTradeSettings.minConfidence
      const isNotHold = asset.mlPrediction !== 'hold'
      const isEligible = isEnabled && hasConfidence && isNotHold
      
      addLog(`   - ${asset.symbol}:`)
      addLog(`     Habilitado: ${isEnabled}`)
      addLog(`     Confiança: ${asset.confidence}% (mín: ${autoTradeSettings.minConfidence}%) -> ${hasConfidence ? 'OK' : 'BAIXO'}`)
      addLog(`     Previsão: ${asset.mlPrediction} -> ${isNotHold ? 'OK' : 'HOLD'}`)
      addLog(`     Elegível: ${isEligible}`)
    })
    
    const eligibleAssets = assets.filter(asset => 
      autoTradeSettings.enabledAssets.includes(asset.symbol) &&
      asset.confidence >= autoTradeSettings.minConfidence &&
      asset.mlPrediction !== 'hold'
    )

    addLog(`✅ [AUTO TRADE] Ativos elegíveis encontrados: ${eligibleAssets.length}`)
    addLog(`📊 [AUTO TRADE] Detalhes dos ativos elegíveis: ${JSON.stringify(eligibleAssets.map(a => ({
      symbol: a.symbol,
      confidence: a.confidence,
      prediction: a.mlPrediction,
      price: a.price
    })))}`)

    if (eligibleAssets.length === 0) {
      addLog('❌ [AUTO TRADE] Nenhum ativo elegível para trading automático')
      addLog('🔍 [AUTO TRADE] Análise detalhada:')
      addLog(`   - Ativos disponíveis: ${assets.length}`)
      addLog(`   - Ativos habilitados: ${autoTradeSettings.enabledAssets.join(', ')}`)
      addLog(`   - Confiança mínima requerida: ${autoTradeSettings.minConfidence}%`)
      addLog(`   - Análise individual dos ativos:`)
      
      if (assets.length === 0) {
        addLog('   ⚠️  CRÍTICO: Nenhum ativo carregado! Verifique a API de mercado.')
      } else {
        assets.forEach(asset => {
          const isEnabled = autoTradeSettings.enabledAssets.includes(asset.symbol)
          const hasConfidence = asset.confidence >= autoTradeSettings.minConfidence
          const isNotHold = asset.mlPrediction !== 'hold'
          const isEligible = isEnabled && hasConfidence && isNotHold
          
          addLog(`   - ${asset.symbol}:`)
          addLog(`     Habilitado: ${isEnabled} (deve ser: ${autoTradeSettings.enabledAssets.includes(asset.symbol)})`)
          addLog(`     Confiança: ${asset.confidence}% (mínimo: ${autoTradeSettings.minConfidence}%) -> ${hasConfidence ? 'OK' : 'BAIXO'}`)
          addLog(`     Previsão: ${asset.mlPrediction} (deve ser ≠ "hold") -> ${isNotHold ? 'OK' : 'HOLD'}`)
          addLog(`     Elegível: ${isEligible}`)
        })
      }
      
      // Sugestões automáticas baseado na análise
      addLog('💡 [AUTO TRADE] Sugestões para correção:')
      if (assets.length === 0) {
        addLog('   - Verifique se a API de mercado está funcionando')
        addLog('   - Verifique a conexão com /api/trading/market')
      } else {
        const noConfidence = assets.filter(asset => asset.confidence < autoTradeSettings.minConfidence).length
        const allHold = assets.filter(asset => asset.mlPrediction === 'hold').length
        const notEnabled = assets.filter(asset => !autoTradeSettings.enabledAssets.includes(asset.symbol)).length
        
        if (noConfidence === assets.length) {
          addLog(`   - Todos os ativos têm confiança baixa (< ${autoTradeSettings.minConfidence}%)`)
          addLog('   - Tente reduzir a confiança mínima nas configurações')
          addLog('   - Verifique se a API de previsão ML está funcionando')
        }
        if (allHold === assets.length) {
          addLog('   - Todos os ativos estão com previsão "hold"')
          addLog('   - Aguarde novas previsões ou verifique o modelo ML')
        }
        if (notEnabled === assets.length) {
          addLog('   - Nenhum ativo está habilitado para trading')
          addLog(`   - Verifique as configurações: ativos habilitados = [${autoTradeSettings.enabledAssets.join(', ')}]`)
        }
      }
      
      return
    }

    // Seleciona o ativo com maior confiança
    const selectedAsset = eligibleAssets.reduce((prev, current) => 
      current.confidence > prev.confidence ? current : prev
    )

    addLog(`🎯 [AUTO TRADE] Ativo selecionado: ${selectedAsset.symbol} com confiança: ${selectedAsset.confidence}`)

    // Obtém previsão atualizada para o ativo selecionado
    addLog(`🔮 [AUTO TRADE] Obtendo previsão atualizada...`)
    const prediction = await getPrediction(selectedAsset.symbol)
    addLog(`📈 [AUTO TRADE] Previsão recebida: ${JSON.stringify(prediction)}`)
    
    if (!prediction || prediction.confidence < autoTradeSettings.minConfidence) {
      addLog(`❌ [AUTO TRADE] Confiança da previsão muito baixa: ${prediction?.confidence}`)
      return
    }

    // Calcula o valor da operação baseado nas configurações de risco
    addLog('💰 [AUTO TRADE] Calculando valor da operação...')
    const baseAmount = botSettings.maxTradeSize * autoTradeSettings.riskMultiplier
    const riskMultiplier = botSettings.riskLevel === 'low' ? 0.5 : 
                          botSettings.riskLevel === 'medium' ? 1.0 : 1.5
    const portfolioLimit = portfolio.totalValue * 0.1 // Máximo 10% do portfólio
    const tradeAmount = Math.min(baseAmount * riskMultiplier, portfolioLimit)
    
    addLog(`💵 [AUTO TRADE] Cálculo detalhado:`)
    addLog(`   - maxTradeSize: $${botSettings.maxTradeSize}`)
    addLog(`   - riskMultiplier (auto): ${autoTradeSettings.riskMultiplier}x`)
    addLog(`   - riskMultiplier (level): ${riskMultiplier}x`)
    addLog(`   - baseAmount: $${baseAmount}`)
    addLog(`   - portfolio.totalValue: $${portfolio.totalValue.toFixed(2)}`)
    addLog(`   - portfolioLimit (10%): $${portfolioLimit.toFixed(2)}`)
    addLog(`   - tradeAmount final: $${tradeAmount}`)
    
    if (tradeAmount <= 0) {
      addLog(`❌ [AUTO TRADE] Valor da operação inválido: ${tradeAmount}`)
      return
    }
    
    // Verifica se o valor é muito baixo (menos de $1)
    if (tradeAmount < 1) {
      addLog(`⚠️ [AUTO TRADE] Valor da operação muito baixo: $${tradeAmount}. Aumentando para $1.`)
      tradeAmount = 1
    }

    // Calcula Take Profit e Stop Loss baseado nas configurações do bot
    const takeProfitPercent = botSettings.takeProfit / 100
    const stopLossPercent = botSettings.stopLoss / 100
    
    const takeProfit = prediction.prediction === 'buy' 
      ? selectedAsset.price * (1 + takeProfitPercent)
      : selectedAsset.price * (1 - takeProfitPercent)
    
    const stopLoss = prediction.prediction === 'buy'
      ? selectedAsset.price * (1 - stopLossPercent)
      : selectedAsset.price * (1 + stopLossPercent)

    addLog(`📊 [AUTO TRADE] TP/SL calculados: takeProfit=${takeProfit.toFixed(2)}, stopLoss=${stopLoss.toFixed(2)}, prediction=${prediction.prediction}`)

    // Executa a operação
    addLog('🚀 [AUTO TRADE] Executando operação...')
    addLog(`📋 [AUTO TRADE] Parâmetros da operação: ${JSON.stringify({
      symbol: selectedAsset.symbol,
      type: prediction.prediction,
      amount: tradeAmount,
      confidence: prediction.confidence,
      takeProfit: takeProfit.toFixed(2),
      stopLoss: stopLoss.toFixed(2)
    })}`)
    
    const result = await executeTradeAPI(
      selectedAsset.symbol, 
      prediction.prediction, 
      tradeAmount, 
      prediction.confidence,
      takeProfit,
      stopLoss
    )

    if (result) {
      addLog(`✅ [AUTO TRADE] Operação automática executada com sucesso: ${JSON.stringify(result)}`)
    } else {
      addLog('❌ [AUTO TRADE] Falha ao executar operação automática')
    }
  }

  // Função para forçar atualização de todas as previsões ML
  const refreshAllPredictions = async () => {
    addLog('🔄 [ML] Forçando atualização de todas as previsões ML...')
    
    if (assets.length === 0) {
      addLog('❌ [ML] Nenhum ativo disponível para atualizar previsões')
      return
    }
    
    for (const asset of assets) {
      addLog(`🔮 [ML] Atualizando previsão para ${asset.symbol}...`)
      await getPrediction(asset.symbol)
    }
    
    addLog('✅ [ML] Todas as previsões atualizadas')
  }

  // Funções para alternar estados do bot e trading automático
  const toggleBot = () => {
    setIsBotActive(!isBotActive)
  }

  const toggleAutoTrade = () => {
    setIsAutoTradeEnabled(!isAutoTradeEnabled)
  }

  // Função para atualizar configurações do trading automático
  const updateAutoTradeSetting = (key: string, value: any) => {
    setAutoTradeSettings(prev => ({ ...prev, [key]: value }))
  }

  // Funções utilitárias para formatação de previsões ML
  const getPredictionColor = (prediction: string) => {
    switch (prediction) {
      case 'buy': return 'text-green-400'
      case 'sell': return 'text-red-400'
      default: return 'text-yellow-400'
    }
  }

  const getPredictionBadge = (prediction: string) => {
    switch (prediction) {
      case 'buy': return <Badge className="bg-green-600">COMPRAR</Badge>
      case 'sell': return <Badge className="bg-red-600">VENDER</Badge>
      default: return <Badge className="bg-yellow-600">MANTER</Badge>
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Cabeçalho da aplicação */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Brain className="h-8 w-8 text-blue-400" />
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                Bot de Trading ML
              </h1>
              <p className="text-gray-400">Plataforma de Trading com Inteligência Artificial</p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-right">
              <div className="text-sm text-gray-400">Status ML</div>
              <div className="text-sm text-blue-400">{mlStatus}</div>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                onClick={toggleAutoTrade}
                className={`${isAutoTradeEnabled ? 'bg-orange-600 hover:bg-orange-700' : 'bg-gray-600 hover:bg-gray-700'}`}
                disabled={!isBotActive}
              >
                {isAutoTradeEnabled ? 'Auto Trade ON' : 'Auto Trade OFF'}
              </Button>
              <Button
                onClick={toggleBot}
                className={`${isBotActive ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}
              >
                {isBotActive ? 'Parar Bot' : 'Iniciar Bot'}
              </Button>
            </div>
          </div>
        </div>

        {/* Visão geral do portfólio */}
        <Card className="bg-gray-800/50 border-gray-700 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <DollarSign className="h-5 w-5 text-green-400" />
              <span>Visão Geral do Portfólio</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <div className="text-sm text-gray-400">Valor Total</div>
                <div className="text-2xl font-bold">${portfolio.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                <div className={`flex items-center space-x-1 ${portfolio.totalPerformance > 0 ? 'text-green-400' : portfolio.totalPerformance < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                  {portfolio.totalPerformance > 0 ? <TrendingUp className="h-4 w-4" /> : portfolio.totalPerformance < 0 ? <TrendingDown className="h-4 w-4" /> : <Activity className="h-4 w-4" />}
                  <span className="text-sm">${Math.abs(portfolio.totalPerformance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (24h)</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-sm text-gray-400">PnL Realizado</div>
                <div className={`text-xl font-bold ${portfolio.realizedPnL > 0 ? 'text-green-400' : portfolio.realizedPnL < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                  {portfolio.realizedPnL === 0 ? '$0.00' : (portfolio.realizedPnL >= 0 ? '+' : '') + portfolio.realizedPnL.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-sm text-gray-400">Trades fechados</div>
              </div>
              <div className="space-y-2">
                <div className="text-sm text-gray-400">Trades Ativos</div>
                <div className="text-2xl font-bold">{trades.length}</div>
                <div className="text-sm text-gray-400">
                  {dailyTradeCount}/{autoTradeSettings.maxDailyTrades} trades hoje
                </div>
                <Progress 
                  value={(dailyTradeCount / autoTradeSettings.maxDailyTrades) * 100} 
                  className="w-full h-2"
                />
              </div>
              <div className="space-y-2">
                <div className="text-sm text-gray-400">Status do Bot</div>
                <div className="flex items-center space-x-2">
                  <div className={`w-3 h-3 rounded-full ${isBotActive ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
                  <span className={isBotActive ? 'text-green-400' : 'text-red-400'}>
                    {isBotActive ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                <div className="text-xs text-gray-400">
                  Última atualização: {lastPriceUpdate.toLocaleTimeString()}
                </div>
              </div>
            </div>
            
            {/* Detalhamento da performance por ativo */}
            {portfolio.assets.length > 0 && (
              <div className="mt-6 pt-6 border-t border-gray-700">
                <div className="text-sm text-gray-400 mb-3">Performance por Ativo (24h)</div>
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                  {portfolio.assets.filter(asset => asset.symbol !== 'USD').map((asset) => (
                    <div key={asset.symbol} className="p-3 bg-gray-700/30 rounded-lg border border-gray-600">
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-semibold">{asset.symbol}</div>
                        <div className={`text-sm ${asset.priceVariation > 0 ? 'text-green-400' : asset.priceVariation < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                          {asset.priceVariation >= 0 ? '+' : ''}${asset.priceVariation.toFixed(2)}
                        </div>
                      </div>
                      <div className="text-xs text-gray-400">
                        {asset.amount.toFixed(4)} unidades
                      </div>
                      <div className="text-xs text-gray-400">
                        Valor: ${asset.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Tabs defaultValue="trading" className="space-y-6">
          <TabsList className="grid w-full grid-cols-8 bg-gray-800">
            <TabsTrigger value="trading" className="data-[state=active]:bg-gray-700">Trading</TabsTrigger>
            <TabsTrigger value="assets" className="data-[state=active]:bg-gray-700">Ativos</TabsTrigger>
            <TabsTrigger value="predictions" className="data-[state=active]:bg-gray-700">Previsões ML</TabsTrigger>
            <TabsTrigger value="opentrades" className="data-[state=active]:bg-gray-700">Trades Abertos</TabsTrigger>
            <TabsTrigger value="autotrade" className="data-[state=active]:bg-gray-700">Auto Trade</TabsTrigger>
            <TabsTrigger value="history" className="data-[state=active]:bg-gray-700">Histórico</TabsTrigger>
            <TabsTrigger value="deriv" className="data-[state=active]:bg-gray-700">Deriv API</TabsTrigger>
            <TabsTrigger value="logs" className="data-[state=active]:bg-gray-700">Logs</TabsTrigger>
          </TabsList>

          <TabsContent value="trading" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Painel de Trading */}
              <Card className="bg-gray-800/50 border-gray-700 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle>Trade Rápido</CardTitle>
                  <CardDescription>Execute trades instantaneamente</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Exibição de erros */}
                  {error && (
                    <Alert className="border-red-600 bg-red-900/20">
                      <AlertDescription className="text-red-400">
                        {error}
                      </AlertDescription>
                    </Alert>
                  )}
                  
                  <div className="space-y-2">
                    <Label htmlFor="asset">Ativo</Label>
                    <Select value={selectedAsset} onValueChange={setSelectedAsset}>
                      <SelectTrigger className="bg-gray-700 border-gray-600">
                        <SelectValue placeholder="Selecione o ativo" />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-700 border-gray-600">
                        {assets.map(asset => (
                          <SelectItem key={asset.symbol} value={asset.symbol}>
                            {asset.symbol} - {asset.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="amount">Valor (USD)</Label>
                    <Input
                      id="amount"
                      type="number"
                      value={tradeAmount}
                      onChange={(e) => setTradeAmount(e.target.value)}
                      placeholder="Digite o valor"
                      className="bg-gray-700 border-gray-600"
                      disabled={loading}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Button
                      onClick={() => executeTrade('buy')}
                      className="bg-green-600 hover:bg-green-700"
                      disabled={!selectedAsset || !tradeAmount || loading}
                    >
                      {loading ? 'Processando...' : 'Comprar'}
                    </Button>
                    <Button
                      onClick={() => executeTrade('sell')}
                      className="bg-red-600 hover:bg-red-700"
                      disabled={!selectedAsset || !tradeAmount || loading}
                    >
                      {loading ? 'Processando...' : 'Vender'}
                    </Button>
                  </div>
                  
                  {/* Informações de previsão do ativo */}
                  {selectedAsset && (
                    <div className="mt-4 p-3 bg-gray-700/50 rounded-lg">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-400">Previsão ML:</span>
                        {(() => {
                          const asset = assets.find(a => a.symbol === selectedAsset)
                          return asset ? (
                            <div className="flex items-center space-x-2">
                              {getPredictionBadge(asset.mlPrediction)}
                              <span className="text-sm text-gray-300">
                                {asset.confidence}% confiança
                              </span>
                            </div>
                          ) : null
                        })()}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Configurações do Bot */}
              <Card className="bg-gray-800/50 border-gray-700 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Settings className="h-5 w-5" />
                    <span>Configurações do Bot</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Card compacto de informações do nível de risco atual */}
                  <div className={`${getCurrentRiskConfig().bgColor} ${getCurrentRiskConfig().borderColor} border rounded-lg p-3`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <span className={`w-3 h-3 rounded-full ${
                          botSettings.riskLevel === 'low' ? 'bg-green-400' : 
                          botSettings.riskLevel === 'medium' ? 'bg-yellow-400' : 'bg-red-400'
                        }`}></span>
                        <div>
                          <span className="text-sm font-medium">Risco: </span>
                          <span className={`font-bold ${getCurrentRiskConfig().color}`}>
                            {botSettings.riskLevel === 'low' ? 'Baixo' : botSettings.riskLevel === 'medium' ? 'Médio' : 'Alto'}
                          </span>
                        </div>
                      </div>
                      <div className="text-xs text-gray-400">
                        {getCurrentRiskConfig().multiplier}x • {getCurrentRiskConfig().maxTradePercentage}%
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Alterar Nível de Risco</Label>
                    <Select value={botSettings.riskLevel} onValueChange={handleRiskLevelChange}>
                      <SelectTrigger className="bg-gray-700 border-gray-600">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-700 border-gray-600">
                        <SelectItem value="low">
                          <div className="flex items-center space-x-2">
                            <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                            <span>Baixo - Conservador</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="medium">
                          <div className="flex items-center space-x-2">
                            <span className="w-2 h-2 bg-yellow-400 rounded-full"></span>
                            <span>Médio - Equilibrado</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="high">
                          <div className="flex items-center space-x-2">
                            <span className="w-2 h-2 bg-red-400 rounded-full"></span>
                            <span>Alto - Agressivo</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    
                    {/* Botão compacto para aplicar configurações sugeridas */}
                    <Button
                      onClick={applySuggestedRiskSettings}
                      variant="outline"
                      size="sm"
                      className="w-full bg-gray-700 border-gray-600 hover:bg-gray-600 text-xs h-8"
                    >
                      ⚡ Aplicar Sugeridos
                      <span className="ml-1 text-gray-400 text-xs">
                        (SL: {getCurrentRiskConfig().suggestedStopLoss}% / TP: {getCurrentRiskConfig().suggestedTakeProfit}%)
                      </span>
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <Label>Tamanho Máximo do Trade: ${botSettings.maxTradeSize}</Label>
                    <Input
                      type="range"
                      min="1"
                      max="10000"
                      step="1"
                      value={botSettings.maxTradeSize}
                      onChange={(e) => setBotSettings(prev => ({ ...prev, maxTradeSize: parseInt(e.target.value) }))}
                      className="bg-gray-700"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Stop Loss: {botSettings.stopLoss}%</Label>
                      <Input
                        type="range"
                        min="0.1"
                        max="100"
                        step="0.1"
                        value={botSettings.stopLoss}
                        onChange={(e) => setBotSettings(prev => ({ ...prev, stopLoss: parseFloat(e.target.value) }))}
                        className="bg-gray-700"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Take Profit: {botSettings.takeProfit}%</Label>
                      <Input
                        type="range"
                        min="0.1"
                        max="100"
                        step="0.1"
                        value={botSettings.takeProfit}
                        onChange={(e) => setBotSettings(prev => ({ ...prev, takeProfit: parseFloat(e.target.value) }))}
                        className="bg-gray-700"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="assets" className="space-y-6">
            <Card className="bg-gray-800/50 border-gray-700 backdrop-blur-sm">
              <CardHeader>
                <CardTitle>Ativos do Mercado</CardTitle>
                <CardDescription>Preços de ativos em tempo real e previsões ML</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {assets.map(asset => (
                    <div key={asset.symbol} className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg">
                      <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center font-bold">
                          {asset.symbol}
                        </div>
                        <div>
                          <div className="font-semibold">{asset.name}</div>
                          <div className="text-sm text-gray-400">{asset.symbol}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">${asset.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        <div className={`flex items-center justify-end space-x-1 ${asset.change24h >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {asset.change24h >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          <span className="text-sm">{Math.abs(asset.change24h).toFixed(2)}%</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-gray-400">Previsão ML</div>
                        <div className="flex items-center space-x-2">
                          {getPredictionBadge(asset.mlPrediction)}
                          <span className={`text-sm ${getPredictionColor(asset.mlPrediction)}`}>
                            {asset.confidence}%
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-gray-400">Volume</div>
                        <div className="text-sm">${(asset.volume / 1000000).toFixed(1)}M</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="predictions" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="bg-gray-800/50 border-gray-700 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Brain className="h-5 w-5 text-purple-400" />
                    <span>Performance do Modelo ML</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Acurácia da Previsão</span>
                        <span>87.3%</span>
                      </div>
                      <Progress value={87.3} className="h-2" />
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Fator de Lucro</span>
                        <span>2.34</span>
                      </div>
                      <Progress value={76.8} className="h-2" />
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Taxa de Acerto</span>
                        <span>73.5%</span>
                      </div>
                      <Progress value={73.5} className="h-2" />
                    </div>
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    <div className="text-sm font-semibold">Informações do Modelo</div>
                    <div className="text-sm text-gray-400 space-y-1">
                      <div>• Rede Neural LSTM</div>
                      <div>• Dados de treinamento: 2 anos</div>
                      <div>• Features: 45 indicadores técnicos</div>
                      <div>• Frequência de atualização: A cada 5 minutos</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gray-800/50 border-gray-700 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle>Previsões Atuais</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {assets.map(asset => (
                      <div key={asset.symbol} className="p-3 bg-gray-700/50 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold">{asset.symbol}</span>
                          {getPredictionBadge(asset.mlPrediction)}
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>Confiança</span>
                            <span>{asset.confidence}%</span>
                          </div>
                          <Progress value={asset.confidence} className="h-1" />
                          <div className="text-xs text-gray-400">
                            Movimento esperado: {asset.mlPrediction === 'buy' ? '+' : asset.mlPrediction === 'sell' ? '-' : '±'}
                            {Math.abs(asset.change24h * 0.8).toFixed(2)}%
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="opentrades" className="space-y-6">
            <Card className="bg-gray-800/50 border-gray-700 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Activity className="h-5 w-5" />
                  <span>Trades Abertos ({openTrades.length})</span>
                </CardTitle>
                <CardDescription>
                  Gerencie suas posições abertas com Take Profit e Stop Loss automáticos
                </CardDescription>
              </CardHeader>
              <CardContent>
                {openTrades.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Nenhum trade aberto no momento</p>
                    <p className="text-sm">Execute trades na aba Trading para abrir posições</p>
                  </div>
                ) : (
                  <ScrollArea className="h-96">
                    <div className="space-y-4">
                      {openTrades.map(trade => (
                        <div key={trade.id} className="p-4 bg-gray-700/50 rounded-lg border border-gray-600">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center space-x-3">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${trade.type === 'buy' ? 'bg-green-600' : 'bg-red-600'}`}>
                                {trade.type === 'buy' ? 'C' : 'V'}
                              </div>
                              <div>
                                <div className="font-semibold text-lg">{trade.symbol}</div>
                                <div className="text-sm text-gray-400">
                                  {trade.type === 'buy' ? 'Compra' : 'Venda'} • {trade.quantity.toFixed(4)} unidades
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className={`text-lg font-bold ${trade.unrealized_pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                ${trade.unrealized_pnl >= 0 ? '+' : ''}{trade.unrealized_pnl.toFixed(2)}
                              </div>
                              <div className="text-sm text-gray-400">
                                {((trade.unrealized_pnl / (trade.entry_price * trade.quantity)) * 100).toFixed(2)}%
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <div className="text-gray-400">Entrada</div>
                              <div className="font-semibold">${trade.entry_price.toFixed(2)}</div>
                            </div>
                            <div>
                              <div className="text-gray-400">Atual</div>
                              <div className="font-semibold">${trade.current_price.toFixed(2)}</div>
                            </div>
                            <div>
                              <div className="text-gray-400">Take Profit</div>
                              <div className="font-semibold text-green-400">
                                {trade.take_profit ? `$${trade.take_profit.toFixed(2)}` : 'Não definido'}
                              </div>
                            </div>
                            <div>
                              <div className="text-gray-400">Stop Loss</div>
                              <div className="font-semibold text-red-400">
                                {trade.stop_loss ? `$${trade.stop_loss.toFixed(2)}` : 'Não definido'}
                              </div>
                            </div>
                          </div>

                          <div className="mt-3 pt-3 border-t border-gray-600">
                            <div className="flex items-center justify-between">
                              <div className="text-sm text-gray-400">
                                Aberto há {Math.floor((Date.now() - new Date(trade.timestamp).getTime()) / (1000 * 60 * 60))}h
                              </div>
                              <div className="flex space-x-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => closeTradeAPI(trade.id, 'manual')}
                                  disabled={loading}
                                  className="bg-gray-600 hover:bg-gray-700 border-gray-500"
                                >
                                  Fechar Manualmente
                                </Button>
                              </div>
                            </div>
                          </div>

                          {/* Indicadores de progresso para TP/SL */}
                          {(trade.take_profit || trade.stop_loss) && (
                            <div className="mt-3 space-y-2">
                              {trade.take_profit && (
                                <div>
                                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                                    <span>Progresso para Take Profit</span>
                                    <span>
                                      {trade.type === 'buy' 
                                        ? `${(((trade.current_price - trade.entry_price) / (trade.take_profit - trade.entry_price)) * 100).toFixed(1)}%`
                                        : `${(((trade.entry_price - trade.current_price) / (trade.entry_price - trade.take_profit)) * 100).toFixed(1)}%`
                                      }
                                    </span>
                                  </div>
                                  <div className="w-full bg-gray-600 rounded-full h-1.5">
                                    <div 
                                      className="bg-green-500 h-1.5 rounded-full" 
                                      style={{
                                        width: `${Math.min(100, Math.abs(
                                          trade.type === 'buy'
                                            ? ((trade.current_price - trade.entry_price) / (trade.take_profit - trade.entry_price)) * 100
                                            : ((trade.entry_price - trade.current_price) / (trade.entry_price - trade.take_profit)) * 100
                                        ))}%`
                                      }}
                                    />
                                  </div>
                                </div>
                              )}
                              
                              {trade.stop_loss && (
                                <div>
                                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                                    <span>Distância para Stop Loss</span>
                                    <span>
                                      {trade.type === 'buy' 
                                        ? `${Math.max(0, ((trade.entry_price - trade.current_price) / (trade.entry_price - trade.stop_loss)) * 100).toFixed(1)}%`
                                        : `${Math.max(0, ((trade.current_price - trade.entry_price) / (trade.stop_loss - trade.entry_price)) * 100).toFixed(1)}%`
                                      }
                                    </span>
                                  </div>
                                  <div className="w-full bg-gray-600 rounded-full h-1.5">
                                    <div 
                                      className="bg-red-500 h-1.5 rounded-full" 
                                      style={{
                                        width: `${Math.min(100, Math.abs(
                                          trade.type === 'buy'
                                            ? ((trade.entry_price - trade.current_price) / (trade.entry_price - trade.stop_loss)) * 100
                                            : ((trade.current_price - trade.entry_price) / (trade.stop_loss - trade.entry_price)) * 100
                                        ))}%`
                                      }}
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>

            {/* Notificação de operações fechadas automaticamente */}
            {autoClosedTrades.length > 0 && (
              <Card className="bg-orange-900/20 border-orange-600 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2 text-orange-400">
                    <Activity className="h-5 w-5" />
                    <span>Trades Fechados Automaticamente ({autoClosedTrades.length})</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-48">
                    <div className="space-y-2">
                      {autoClosedTrades.map((trade, index) => (
                        <div key={index} className="p-3 bg-gray-700/50 rounded-lg">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-semibold">{trade.symbol}</div>
                              <div className="text-sm text-gray-400">
                                Fechado: {trade.reason} • ${trade.close_price.toFixed(2)}
                              </div>
                            </div>
                            <div className={`text-right ${trade.realized_pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              <div className="font-semibold">
                                {trade.realized_pnl >= 0 ? '+' : ''}${trade.realized_pnl.toFixed(2)}
                              </div>
                              <div className="text-xs">
                                {((trade.realized_pnl / (trade.entry_price * trade.quantity)) * 100).toFixed(2)}%
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="autotrade" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="bg-gray-800/50 border-gray-700 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Settings className="h-5 w-5" />
                    <span>Configurações de Auto Trade</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Ativos Habilitados</Label>
                    <div className="space-y-2">
                      {['BTC', 'ETH', 'SOL', 'ADA', 'DOT'].map(asset => (
                        <div key={asset} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={autoTradeSettings.enabledAssets.includes(asset)}
                            onChange={(e) => {
                              const newAssets = e.target.checked
                                ? [...autoTradeSettings.enabledAssets, asset]
                                : autoTradeSettings.enabledAssets.filter(a => a !== asset)
                              updateAutoTradeSetting('enabledAssets', newAssets)
                            }}
                            className="rounded border-gray-600 bg-gray-700"
                          />
                          <Label>{asset}</Label>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Confiança Mínima: {autoTradeSettings.minConfidence}%</Label>
                    <Input
                      type="range"
                      min="50"
                      max="95"
                      value={autoTradeSettings.minConfidence}
                      onChange={(e) => updateAutoTradeSetting('minConfidence', parseInt(e.target.value))}
                      className="bg-gray-700"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Máximo de Trades por Dia: {autoTradeSettings.maxDailyTrades}</Label>
                    <Input
                      type="range"
                      min="1"
                      max="50"
                      value={autoTradeSettings.maxDailyTrades}
                      onChange={(e) => updateAutoTradeSetting('maxDailyTrades', parseInt(e.target.value))}
                      className="bg-gray-700"
                    />
                    <div className="text-sm text-gray-400">
                      Trades hoje: {dailyTradeCount}/{autoTradeSettings.maxDailyTrades}
                    </div>
                    <Progress 
                      value={(dailyTradeCount / autoTradeSettings.maxDailyTrades) * 100} 
                      className="w-full h-2"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Intervalo entre Trades: {autoTradeSettings.tradeInterval}s</Label>
                    <Input
                      type="range"
                      min="10"
                      max="300"
                      step="10"
                      value={autoTradeSettings.tradeInterval}
                      onChange={(e) => updateAutoTradeSetting('tradeInterval', parseInt(e.target.value))}
                      className="bg-gray-700"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Multiplicador de Risco: {autoTradeSettings.riskMultiplier}x</Label>
                    <Input
                      type="range"
                      min="0.1"
                      max="3.0"
                      step="0.1"
                      value={autoTradeSettings.riskMultiplier}
                      onChange={(e) => updateAutoTradeSetting('riskMultiplier', parseFloat(e.target.value))}
                      className="bg-gray-700"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gray-800/50 border-gray-700 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle>Status do Auto Trade</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span>Status</span>
                      <Badge className={isAutoTradeEnabled ? 'bg-green-600' : 'bg-gray-600'}>
                        {isAutoTradeEnabled ? 'ATIVO' : 'INATIVO'}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span>Bot Principal</span>
                      <Badge className={isBotActive ? 'bg-green-600' : 'bg-red-600'}>
                        {isBotActive ? 'ATIVO' : 'INATIVO'}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span>Ativos Monitorados</span>
                      <span>{autoTradeSettings.enabledAssets.length}</span>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span>Trades Hoje</span>
                      <span>{trades.filter(t => new Date(t.timestamp).toDateString() === new Date().toDateString()).length}/{autoTradeSettings.maxDailyTrades}</span>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span>Próximo Trade</span>
                      <span>{autoTradeSettings.tradeInterval}s</span>
                    </div>
                  </div>
                  
                  <Separator />
                  
                  <div className="space-y-2">
                    <div className="text-sm font-semibold">Regras Atuais</div>
                    <div className="text-sm text-gray-400 space-y-1">
                      <div>• Executar apenas quando confiança ≥ {autoTradeSettings.minConfidence}%</div>
                      <div>• Limitar a {autoTradeSettings.maxDailyTrades} trades por dia</div>
                      <div>• Intervalo mínimo de {autoTradeSettings.tradeInterval} segundos</div>
                      <div>• Multiplicador de risco: {autoTradeSettings.riskMultiplier}x</div>
                      <div>• Apenas ativos selecionados</div>
                    </div>
                  </div>
                  
                  <Button
                    onClick={toggleAutoTrade}
                    className={`w-full ${isAutoTradeEnabled ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}
                    disabled={!isBotActive}
                  >
                    {isAutoTradeEnabled ? 'Desativar Auto Trade' : 'Ativar Auto Trade'}
                  </Button>
                  
                  <Button
                    onClick={testAutoTrade}
                    variant="outline"
                    className="w-full bg-blue-600 border-blue-600 hover:bg-blue-700 text-white"
                    disabled={!isBotActive}
                  >
                    🧪 Testar Auto Trade
                  </Button>
                  
                  <Button
                    onClick={resetDailyTradeCounter}
                    variant="outline"
                    className="w-full bg-gray-700 border-gray-600 hover:bg-gray-600"
                  >
                    🔄 Resetar Contador Diário
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="history" className="space-y-6">
            <Card className="bg-gray-800/50 border-gray-700 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Activity className="h-5 w-5" />
                  <span>Histórico de Trading</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-96">
                  <div className="space-y-2">
                    {trades.map(trade => (
                      <div key={trade.id} className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg">
                        <div className="flex items-center space-x-4">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${trade.type === 'buy' ? 'bg-green-600' : 'bg-red-600'}`}>
                            {trade.type === 'buy' ? 'C' : 'V'}
                          </div>
                          <div>
                            <div className="font-semibold">{trade.symbol}</div>
                            <div className="text-sm text-gray-400 flex items-center space-x-1">
                              <Clock className="h-3 w-3" />
                              <span>{trade.timestamp}</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold">${trade.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                          <div className="text-sm text-gray-400">{trade.amount} unidades</div>
                        </div>
                        <div className="text-right">
                          <div className={`font-semibold ${trade.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {trade.profit >= 0 ? '+' : ''}${trade.profit.toFixed(2)}
                          </div>
                          <div className="text-sm text-gray-400">ML: {trade.mlConfidence}%</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="deriv" className="space-y-6">
            <DerivConfig />
          </TabsContent>

          <TabsContent value="logs" className="space-y-6">
            <Card className="bg-gray-800/50 border-gray-700 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Activity className="h-5 w-5" />
                    <span>Logs de Depuração</span>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setLogs([])}
                    className="border-gray-600 text-gray-300 hover:bg-gray-700"
                  >
                    Limpar Logs
                  </Button>
                </CardTitle>
                <CardDescription>
                  Logs em tempo real do sistema de trading automático
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-96">
                  <div className="space-y-1 font-mono text-sm">
                    {logs.length === 0 ? (
                      <div className="text-gray-500 text-center py-8">
                        Nenhum log disponível. Ative o bot e o auto trade para ver os logs.
                      </div>
                    ) : (
                      logs.map((log, index) => {
                        // Colorir logs baseado no tipo
                        let logClass = "text-gray-300"
                        if (log.includes('❌')) logClass = "text-red-400"
                        else if (log.includes('✅')) logClass = "text-green-400"
                        else if (log.includes('🚀') || log.includes('📊')) logClass = "text-blue-400"
                        else if (log.includes('🔍') || log.includes('📋')) logClass = "text-yellow-400"
                        else if (log.includes('⏰') || log.includes('⏸️')) logClass = "text-purple-400"
                        
                        return (
                          <div 
                            key={index} 
                            className={`p-2 rounded ${log.includes('❌') ? 'bg-red-900/20' : log.includes('✅') ? 'bg-green-900/20' : 'bg-gray-700/30'} ${logClass}`}
                          >
                            {log}
                          </div>
                        )
                      })
                    )}
                  </div>
                </ScrollArea>
                <div className="mt-4 flex items-center justify-between text-sm text-gray-400">
                  <div>Total de logs: {logs.length}</div>
                  <div>Última atualização: {new Date().toLocaleTimeString()}</div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}