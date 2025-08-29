import axios from 'axios'
import { DERIV_CONFIG } from './deriv'

export interface DerivAccount {
  loginid: string
  currency: string
  balance: number
  account_type: 'demo' | 'real'
  email?: string
  fullname?: string
}

export interface AuthResponse {
  success: boolean
  token?: string
  account?: DerivAccount
  error?: string
}

export class DerivAuthService {
  private token: string | null = null
  private account: DerivAccount | null = null

  constructor() {
    // Carregar token do localStorage se existir
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('deriv_token')
      const savedAccount = localStorage.getItem('deriv_account')
      if (savedAccount) {
        this.account = JSON.parse(savedAccount)
      }
    }
  }

  async authenticate(token: string): Promise<AuthResponse> {
    try {
      console.log('🔐 [DERIV AUTH] Tentando autenticação real com a Deriv API')
      console.log(`📝 [DERIV AUTH] App ID: ${DERIV_CONFIG.appId}`)
      
      const response = await axios.post(`${DERIV_CONFIG.apiUrl}/v3/authorize`, {
        authorize: token
      })

      if (response.data.authorize) {
        this.token = token
        this.account = {
          loginid: response.data.authorize.loginid,
          currency: response.data.authorize.currency,
          balance: response.data.authorize.balance,
          account_type: response.data.authorize.account_type,
          email: response.data.authorize.email,
          fullname: response.data.authorize.fullname
        }

        // Salvar no localStorage
        if (typeof window !== 'undefined') {
          localStorage.setItem('deriv_token', token)
          localStorage.setItem('deriv_account', JSON.stringify(this.account))
        }

        return {
          success: true,
          token: this.token,
          account: this.account
        }
      }

      return {
        success: false,
        error: 'Falha na autenticação'
      }
    } catch (error) {
      console.error('Erro na autenticação Deriv:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      }
    }
  }

  async createDemoAccount(): Promise<AuthResponse> {
    try {
      // MODO SIMULADO PARA TESTES - REMOVER EM PRODUÇÃO
      if (process.env.NODE_ENV === 'development') {
        console.log('🧪 [DERIV AUTH] Criando conta demo simulada para testes')
        
        const mockAccount: DerivAccount = {
          loginid: 'VRTC' + Math.random().toString(36).substr(2, 8).toUpperCase(),
          currency: 'USD',
          balance: 10000.00,
          account_type: 'demo',
          email: 'demo@example.com',
          fullname: 'Demo User'
        }
        
        const mockToken = 'demo_' + Math.random().toString(36).substr(2, 16)
        
        this.token = mockToken
        this.account = mockAccount
        
        // Salvar no localStorage
        if (typeof window !== 'undefined') {
          localStorage.setItem('deriv_token', mockToken)
          localStorage.setItem('deriv_account', JSON.stringify(mockAccount))
        }
        
        return {
          success: true,
          token: mockToken,
          account: mockAccount
        }
      }
      
      // MODO REAL - COMENTADO PARA TESTES
      console.log('🔐 [DERIV AUTH] Tentando criar conta demo real na Deriv API')
      const response = await axios.post(`${DERIV_CONFIG.apiUrl}/v3/signup`, {
        signup: 1,
        client_password: '',
        residence: 'br',
        verification_code: ''
      })

      if (response.data.new_account_virtual) {
        const newToken = response.data.new_account_virtual.oauth_token
        return await this.authenticate(newToken)
      }

      return {
        success: false,
        error: 'Falha ao criar conta demo'
      }
    } catch (error) {
      console.error('Erro ao criar conta demo:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      }
    }
  }

  async getAccountInfo(): Promise<DerivAccount | null> {
    if (!this.token) return null

    try {
      const response = await axios.post(`${DERIV_CONFIG.apiUrl}/v3/account_info`, {
        account_info: 1,
        authorization: this.token
      })

      if (response.data.account_info) {
        this.account = {
          loginid: response.data.account_info.loginid,
          currency: response.data.account_info.currency,
          balance: response.data.account_info.balance,
          account_type: response.data.account_info.account_type,
          email: response.data.account_info.email,
          fullname: response.data.account_info.fullname
        }

        // Atualizar localStorage
        if (typeof window !== 'undefined') {
          localStorage.setItem('deriv_account', JSON.stringify(this.account))
        }

        return this.account
      }

      return null
    } catch (error) {
      console.error('Erro ao obter informações da conta:', error)
      return null
    }
  }

  async getBalance(): Promise<number> {
    if (!this.token) return 0

    try {
      const response = await axios.post(`${DERIV_CONFIG.apiUrl}/v3/balance`, {
        balance: 1,
        authorization: this.token
      })

      if (response.data.balance) {
        const balance = response.data.balance.accounts?.[0]?.balance || 0
        if (this.account) {
          this.account.balance = balance
          // Atualizar localStorage
          if (typeof window !== 'undefined') {
            localStorage.setItem('deriv_account', JSON.stringify(this.account))
          }
        }
        return balance
      }

      return 0
    } catch (error) {
      console.error('Erro ao obter saldo:', error)
      return 0
    }
  }

  getToken(): string | null {
    return this.token
  }

  getAccount(): DerivAccount | null {
    return this.account
  }

  isAuthenticated(): boolean {
    return this.token !== null && this.account !== null
  }

  isDemoAccount(): boolean {
    return this.account?.account_type === 'demo'
  }

  logout(): void {
    this.token = null
    this.account = null
    if (typeof window !== 'undefined') {
      localStorage.removeItem('deriv_token')
      localStorage.removeItem('deriv_account')
    }
  }
}

// Instância singleton
export const derivAuthService = new DerivAuthService()