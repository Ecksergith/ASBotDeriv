import WebSocket from 'ws'
import { DERIV_CONFIG } from './deriv'
import { derivAuthService } from './deriv-auth'

export interface TickData {
  symbol: string
  quote: number
  epoch: number
  id: string
}

export interface CandleData {
  symbol: string
  open: number
  high: number
  low: number
  close: number
  epoch: number
}

export interface Proposal {
  id: string
  symbol: string
  contract_type: string
  amount: number
  barrier?: string
  duration: number
  payout: number
  ask_price: number
}

export interface BuyResponse {
  buy: {
    contract_id: string
    longcode: string
    buy_price: number
    payout: number
    transaction_id: number
  }
}

export interface ContractData {
  contract_id: string
  contract_type: string
  symbol: string
  status: 'open' | 'won' | 'lost' | 'sold'
  entry_tick: number
  exit_tick?: number
  buy_price: number
  sell_price?: number
  profit: number
  start_time: number
  expiry_time?: number
}

export type DerivMessageHandler = (data: any) => void

export class DerivWebSocketService {
  private ws: WebSocket | null = null
  private isConnected = false
  private messageHandlers: Map<string, DerivMessageHandler[]> = new Map()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private pingInterval: NodeJS.Timeout | null = null
  private subscriptionIds: Map<string, string> = new Map()

  constructor() {
    this.connect()
  }

  async connect(): Promise<void> {
    try {
      const token = derivAuthService.getToken()
      if (!token) {
        throw new Error('Token de autenticação não encontrado')
      }

      this.ws = new WebSocket(DERIV_CONFIG.wsUrl)

      this.ws.on('open', () => {
        console.log('✅ [DERIV WS] Conectado ao WebSocket da Deriv')
        this.isConnected = true
        this.reconnectAttempts = 0
        
        // Autenticar no WebSocket
        this.authenticate(token)
        
        // Iniciar ping/pong
        this.startPing()
      })

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString())
          this.handleMessage(message)
        } catch (error) {
          console.error('❌ [DERIV WS] Erro ao processar mensagem:', error)
        }
      })

      this.ws.on('close', () => {
        console.log('🔌 [DERIV WS] Conexão fechada')
        this.isConnected = false
        this.stopPing()
        this.handleReconnect()
      })

      this.ws.on('error', (error: Error) => {
        console.error('❌ [DERIV WS] Erro na conexão:', error)
        this.isConnected = false
      })

    } catch (error) {
      console.error('❌ [DERIV WS] Erro ao conectar:', error)
      this.handleReconnect()
    }
  }

  private authenticate(token: string): void {
    this.send({
      authorize: token
    })
  }

  private startPing(): void {
    this.pingInterval = setInterval(() => {
      if (this.isConnected) {
        this.send({ ping: 1 })
      }
    }, 30000) // Ping a cada 30 segundos
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
  }

  private handleReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)
      
      console.log(`🔄 [DERIV WS] Tentando reconectar em ${delay}ms (tentativa ${this.reconnectAttempts}/${this.maxReconnectAttempts})`)
      
      setTimeout(() => {
        this.connect()
      }, delay)
    } else {
      console.error('❌ [DERIV WS] Máximo de tentativas de reconexão atingido')
    }
  }

  private handleMessage(message: any): void {
    // console.log('📨 [DERIV WS] Mensagem recebida:', message)

    // Verificar se é uma resposta de autorização
    if (message.authorize) {
      console.log('✅ [DERIV WS] Autenticado com sucesso')
      return
    }

    // Verificar se é um erro
    if (message.error) {
      console.error('❌ [DERIV WS] Erro recebido:', message.error)
      return
    }

    // Verificar se é um ping
    if (message.ping) {
      this.send({ pong: 1 })
      return
    }

    // Verificar se é um tick
    if (message.tick) {
      this.emit('tick', message.tick)
      return
    }

    // Verificar se é um candle (OHLC)
    if (message.ohlc) {
      this.emit('candle', message.ohlc)
      return
    }

    // Verificar se é uma proposta
    if (message.proposal) {
      this.emit('proposal', message.proposal)
      return
    }

    // Verificar se é uma resposta de compra
    if (message.buy) {
      this.emit('buy', message.buy)
      return
    }

    // Verificar se é uma atualização de contrato
    if (message.proposal_open_contract) {
      this.emit('contract', message.proposal_open_contract)
      return
    }

    // Verificar se é uma atualização de saldo
    if (message.balance) {
      this.emit('balance', message.balance)
      return
    }

    // Emitir mensagem genérica
    this.emit('message', message)
  }

  private send(message: any): void {
    if (this.ws && this.isConnected) {
      this.ws.send(JSON.stringify(message))
    } else {
      console.error('❌ [DERIV WS] Não é possível enviar mensagem - WebSocket não conectado')
    }
  }

  private emit(event: string, data: any): void {
    const handlers = this.messageHandlers.get(event)
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data)
        } catch (error) {
          console.error(`❌ [DERIV WS] Erro no handler do evento ${event}:`, error)
        }
      })
    }
  }

  // Métodos públicos para inscrição em eventos
  on(event: string, handler: DerivMessageHandler): void {
    if (!this.messageHandlers.has(event)) {
      this.messageHandlers.set(event, [])
    }
    this.messageHandlers.get(event)!.push(handler)
  }

  off(event: string, handler: DerivMessageHandler): void {
    const handlers = this.messageHandlers.get(event)
    if (handlers) {
      const index = handlers.indexOf(handler)
      if (index > -1) {
        handlers.splice(index, 1)
      }
    }
  }

  // Métodos para interagir com a API

  // Obter ticks em tempo real
  subscribeTicks(symbol: string): void {
    const message = {
      ticks: symbol,
      subscribe: 1
    }
    this.send(message)
    this.subscriptionIds.set(`ticks_${symbol}`, 'subscribed')
  }

  // Obter candles (OHLC)
  subscribeCandles(symbol: string, granularity: number = 60): void {
    const message = {
      ohlc: symbol,
      granularity: granularity,
      subscribe: 1
    }
    this.send(message)
    this.subscriptionIds.set(`ohlc_${symbol}`, 'subscribed')
  }

  // Obter proposta para contrato
  getProposal(params: {
    symbol: string
    contract_type: string
    amount: number
    duration: number
    duration_unit: 's' | 'm' | 'h' | 'd'
    barrier?: string
  }): void {
    const message = {
      proposal: 1,
      ...params
    }
    this.send(message)
  }

  // Comprar contrato
  buyContract(proposalId: string, price: number): void {
    const message = {
      buy: proposalId,
      price: price
    }
    this.send(message)
  }

  // Vender contrato (para contratos abertos)
  sellContract(contractId: string, price: number): void {
    const message = {
      sell: contractId,
      price: price
    }
    this.send(message)
  }

  // Obter saldo
  getBalance(): void {
    const message = {
      balance: 1,
      subscribe: 1
    }
    this.send(message)
  }

  // Obter lista de contratos abertos
  getOpenContracts(): void {
    const message = {
      proposal_open_contract: 1,
      subscribe: 1
    }
    this.send(message)
  }

  // Cancelar inscrição
  unsubscribe(symbol: string, type: 'ticks' | 'ohlc'): void {
    const key = `${type}_${symbol}`
    if (this.subscriptionIds.has(key)) {
      const message = {
        [type]: symbol,
        subscribe: 0
      }
      this.send(message)
      this.subscriptionIds.delete(key)
    }
  }

  // Desconectar
  disconnect(): void {
    this.stopPing()
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.isConnected = false
  }

  // Verificar status da conexão
  isConnectionActive(): boolean {
    return this.isConnected
  }
}

// Instância singleton
export const derivWebSocketService = new DerivWebSocketService()