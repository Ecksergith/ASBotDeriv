import { NextRequest, NextResponse } from 'next/server'
import { derivAuthService } from '@/lib/deriv-auth'
import { derivWebSocketService } from '@/lib/deriv-ws'
import { TRADING_CONFIG, CONTRACT_TYPES, DURATIONS } from '@/lib/deriv'
import { addOpenTrade } from '../close/route'

interface TradeRequest {
  symbol: string
  type: 'buy' | 'sell'
  amount: number
  price?: number
  ml_confidence?: number
  take_profit?: number
  stop_loss?: number
}

interface TradeResponse {
  success: boolean
  trade_id: string
  symbol: string
  type: 'buy' | 'sell'
  amount: number
  price: number
  timestamp: string
  estimated_profit?: number
  fees: number
  status: 'executed' | 'pending' | 'failed'
  message: string
  contract_id?: string
  proposal_id?: string
}

// Cache para propostas
const proposalCache = new Map<string, { proposal: any; timestamp: number }>()
const PROPOSAL_CACHE_DURATION = 30000 // 30 segundos

// Função para obter proposta de contrato da Deriv
async function getDerivProposal(params: {
  symbol: string
  contract_type: string
  amount: number
  duration: number
  barrier?: string
}): Promise<any> {
  const cacheKey = `${params.symbol}_${params.contract_type}_${params.amount}_${params.duration}`
  
  // Verificar cache
  const cached = proposalCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < PROPOSAL_CACHE_DURATION) {
    return cached.proposal
  }
  
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timeout ao obter proposta'))
    }, 10000)
    
    const handler = (data: any) => {
      if (data.proposal) {
        clearTimeout(timeout)
        derivWebSocketService.off('proposal', handler)
        
        // Cache a proposta
        proposalCache.set(cacheKey, { proposal: data.proposal, timestamp: Date.now() })
        resolve(data.proposal)
      } else if (data.error) {
        clearTimeout(timeout)
        derivWebSocketService.off('proposal', handler)
        reject(new Error(data.error.message))
      }
    }
    
    derivWebSocketService.on('proposal', handler)
    derivWebSocketService.getProposal(params)
  })
}

// Função para executar trade na Deriv
async function executeDerivTrade(trade: TradeRequest): Promise<TradeResponse> {
  try {
    // Verificar autenticação
    if (!derivAuthService.isAuthenticated()) {
      return {
        success: false,
        trade_id: '',
        symbol: trade.symbol,
        type: trade.type,
        amount: trade.amount,
        price: 0,
        timestamp: new Date().toISOString(),
        fees: 0,
        status: 'failed',
        message: 'Não autenticado'
      }
    }
    
    // Validar valor mínimo
    if (trade.amount < TRADING_CONFIG.minStake) {
      return {
        success: false,
        trade_id: '',
        symbol: trade.symbol,
        type: trade.type,
        amount: trade.amount,
        price: 0,
        timestamp: new Date().toISOString(),
        fees: 0,
        status: 'failed',
        message: `Valor mínimo é $${TRADING_CONFIG.minStake}`
      }
    }
    
    // Validar valor máximo
    if (trade.amount > TRADING_CONFIG.maxStake) {
      return {
        success: false,
        trade_id: '',
        symbol: trade.symbol,
        type: trade.type,
        amount: trade.amount,
        price: 0,
        timestamp: new Date().toISOString(),
        fees: 0,
        status: 'failed',
        message: `Valor máximo é $${TRADING_CONFIG.maxStake}`
      }
    }
    
    // Mapear tipo de trade para contrato Deriv
    const contractType = trade.type === 'buy' ? 'RISE' : 'FALL'
    const duration = TRADING_CONFIG.defaultDuration
    
    // Obter proposta
    console.log(`📊 [DERIV] Solicitando proposta para ${trade.symbol} ${contractType} $${trade.amount}`)
    
    const proposal = await getDerivProposal({
      symbol: trade.symbol,
      contract_type: CONTRACT_TYPES.RISE_FALL,
      amount: trade.amount,
      duration: duration
    })
    
    if (!proposal || !proposal.id || !proposal.ask_price) {
      return {
        success: false,
        trade_id: '',
        symbol: trade.symbol,
        type: trade.type,
        amount: trade.amount,
        price: 0,
        timestamp: new Date().toISOString(),
        fees: 0,
        status: 'failed',
        message: 'Não foi possível obter proposta para o trade'
      }
    }
    
    // Executar o trade
    console.log(`🚀 [DERIV] Executando trade com proposta ${proposal.id}`)
    
    const buyResult = await new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout ao executar trade'))
      }, 10000)
      
      const handler = (data: any) => {
        if (data.buy) {
          clearTimeout(timeout)
          derivWebSocketService.off('buy', handler)
          resolve(data.buy)
        } else if (data.error) {
          clearTimeout(timeout)
          derivWebSocketService.off('buy', handler)
          reject(new Error(data.error.message))
        }
      }
      
      derivWebSocketService.on('buy', handler)
      derivWebSocketService.buyContract(proposal.id, proposal.ask_price)
    })
    
    if (!buyResult || !buyResult.contract_id) {
      return {
        success: false,
        trade_id: '',
        symbol: trade.symbol,
        type: trade.type,
        amount: trade.amount,
        price: 0,
        timestamp: new Date().toISOString(),
        fees: 0,
        status: 'failed',
        message: 'Falha ao executar trade'
      }
    }
    
    // Adicionar trade aberto ao gerenciamento
    const tradeData = {
      trade_id: buyResult.contract_id,
      symbol: trade.symbol,
      type: trade.type,
      amount: trade.amount,
      price: buyResult.buy_price,
      timestamp: new Date().toISOString(),
      ml_confidence: trade.ml_confidence || 70,
      take_profit: trade.take_profit,
      stop_loss: trade.stop_loss,
      contract_id: buyResult.contract_id,
      proposal_id: proposal.id
    }
    
    addOpenTrade(tradeData)
    
    // Calcular lucro estimado baseado no payout
    const estimatedProfit = buyResult.payout - buyResult.buy_price
    
    return {
      success: true,
      trade_id: buyResult.contract_id,
      symbol: trade.symbol,
      type: trade.type,
      amount: trade.amount,
      price: buyResult.buy_price,
      timestamp: new Date().toISOString(),
      estimated_profit: estimatedProfit,
      fees: 0, // Deriv não cobra fees separadas
      status: 'executed',
      message: `Trade executado com sucesso na Deriv`,
      contract_id: buyResult.contract_id,
      proposal_id: proposal.id
    }
    
  } catch (error) {
    console.error('❌ [DERIV] Erro ao executar trade:', error)
    return {
      success: false,
      trade_id: '',
      symbol: trade.symbol,
      type: trade.type,
      amount: trade.amount,
      price: 0,
      timestamp: new Date().toISOString(),
      fees: 0,
      status: 'failed',
      message: error instanceof Error ? error.message : 'Erro desconhecido'
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    // Verificar autenticação
    if (!derivAuthService.isAuthenticated()) {
      return NextResponse.json(
        { error: 'Não autenticado' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { symbol, type, amount, price, ml_confidence, take_profit, stop_loss }: TradeRequest = body
    
    // Validar campos obrigatórios
    if (!symbol || !type || !amount) {
      return NextResponse.json(
        { error: 'Campos obrigatórios faltando: symbol, type, amount' },
        { status: 400 }
      )
    }
    
    // Validar tipo de trade
    if (!['buy', 'sell'].includes(type)) {
      return NextResponse.json(
        { error: 'Tipo de trade inválido. Deve ser "buy" ou "sell"' },
        { status: 400 }
      )
    }
    
    // Executar o trade na Deriv
    const result = await executeDerivTrade({
      symbol,
      type,
      amount: parseFloat(amount.toString()),
      price: price ? parseFloat(price.toString()) : undefined,
      ml_confidence: ml_confidence ? parseFloat(ml_confidence.toString()) : undefined,
      take_profit: take_profit ? parseFloat(take_profit.toString()) : undefined,
      stop_loss: stop_loss ? parseFloat(stop_loss.toString()) : undefined
    })
    
    // Log do trade
    console.log('Trade executado na Deriv:', result)
    
    return NextResponse.json(result)
    
  } catch (error) {
    console.error('Erro na execução do trade:', error)
    return NextResponse.json(
      { error: 'Erro interno durante execução do trade' },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    // Verificar autenticação
    if (!derivAuthService.isAuthenticated()) {
      return NextResponse.json(
        { error: 'Não autenticado' },
        { status: 401 }
      )
    }

    // Obter informações da conta
    const account = derivAuthService.getAccount()
    const balance = await derivAuthService.getBalance()
    
    return NextResponse.json({
      portfolio: account ? {
        [account.currency]: balance
      } : {},
      available_pairs: ['R_10', 'R_25', 'R_50', 'R_75', 'R_100', 'FRXEURUSD', 'FRXGBPUSD'],
      current_prices: {}, // Seria preenchido com dados reais da API
      trading_fees: '0%', // Deriv não cobra fees separadas
      account_info: account,
      current_balance: balance,
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('Erro ao obter portfólio:', error)
    return NextResponse.json(
      { error: 'Erro interno ao obter portfólio' },
      { status: 500 }
    )
  }
}