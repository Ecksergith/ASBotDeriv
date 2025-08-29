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

export interface OAuthAccount {
  loginid: string
  token: string
  currency: string
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

  // Novo método para iniciar fluxo OAuth
  async initiateOAuth(): Promise<{ success: boolean; authUrl?: string; error?: string }> {
    try {
      console.log('🔐 [DERIV AUTH] Iniciando fluxo OAuth')
      
      const response = await fetch('/api/deriv/oauth?action=authorize')
      const data = await response.json()
      
      if (data.success && data.authUrl) {
        return {
          success: true,
          authUrl: data.authUrl
        }
      }
      
      return {
        success: false,
        error: data.error || 'Falha ao iniciar OAuth'
      }
    } catch (error) {
      console.error('Erro ao iniciar OAuth:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      }
    }
  }

  // Novo método para autenticar com token OAuth
  async authenticateWithOAuth(oauthToken: string, accountId: string): Promise<AuthResponse> {
    try {
      console.log('🔐 [DERIV AUTH] Autenticando com token OAuth:', accountId)
      
      // MODO DE TESTE: Se o token começar com "demo_", usar modo simulado
      if (oauthToken.startsWith('demo_')) {
        console.log('🧪 [DERIV AUTH] Usando modo de teste/simulado para OAuth')
        
        const mockAccount: DerivAccount = {
          loginid: accountId,
          currency: 'USD',
          balance: 10000.00,
          account_type: 'demo',
          email: 'demo@example.com',
          fullname: 'Demo User'
        }
        
        this.token = oauthToken
        this.account = mockAccount
        
        if (typeof window !== 'undefined') {
          localStorage.setItem('deriv_token', oauthToken)
          localStorage.setItem('deriv_account', JSON.stringify(mockAccount))
        }
        
        return {
          success: true,
          token: this.token,
          account: this.account
        }
      }
      
      // Usar o token OAuth diretamente com a API Deriv
      const response = await axios.post(`${DERIV_CONFIG.apiUrl}/v3/authorize`, {
        authorize: oauthToken
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 10000
      })

      console.log('📡 [DERIV AUTH] Resposta da API OAuth:', {
        status: response.status,
        data: response.data
      })

      if (response.data.authorize) {
        this.token = oauthToken
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
          localStorage.setItem('deriv_token', oauthToken)
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
        error: response.data.error?.message || 'Falha na autenticação OAuth'
      }
    } catch (error: any) {
      console.error('❌ [DERIV AUTH] Erro na autenticação OAuth:', error)
      
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message || 'Erro desconhecido na autenticação OAuth'
      }
    }
  }

  async authenticate(token: string): Promise<AuthResponse> {
    try {
      console.log('🔐 [DERIV AUTH] Tentando autenticação real com a Deriv API')
      console.log(`📝 [DERIV AUTH] App ID: ${DERIV_CONFIG.appId}`)
      
      // MODO DE TESTE: Se o token começar com "demo_", usar modo simulado
      if (token.startsWith('demo_')) {
        console.log('🧪 [DERIV AUTH] Usando modo de teste/simulado')
        
        const mockAccount: DerivAccount = {
          loginid: 'VRTC' + Math.random().toString(36).substr(2, 8).toUpperCase(),
          currency: 'USD',
          balance: 10000.00,
          account_type: 'demo',
          email: 'demo@example.com',
          fullname: 'Demo User'
        }
        
        this.token = token
        this.account = mockAccount
        
        if (typeof window !== 'undefined') {
          localStorage.setItem('deriv_token', token)
          localStorage.setItem('deriv_account', JSON.stringify(mockAccount))
        }
        
        return {
          success: true,
          token: this.token,
          account: this.account
        }
      }
      
      // Formato correto para a Deriv API segundo a documentação
      const requestData = {
        authorize: token
      }
      
      console.log('📤 [DERIV AUTH] Enviando requisição para:', `${DERIV_CONFIG.apiUrl}/v3/authorize`)
      console.log('📦 [DERIV AUTH] Dados da requisição:', requestData)
      
      const response = await axios({
        method: 'POST',
        url: `${DERIV_CONFIG.apiUrl}/v3/authorize`,
        data: requestData,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 10000 // 10 segundos timeout
      })

      console.log('📡 [DERIV AUTH] Resposta da API:', {
        status: response.status,
        statusText: response.statusText,
        data: response.data
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

      // Se chegou aqui, a resposta não tinha o campo authorize esperado
      const errorMsg = response.data.error?.message || 'Resposta inválida da API'
      console.log('❌ [DERIV AUTH] Resposta sem campo authorize:', response.data)
      
      return {
        success: false,
        error: errorMsg
      }
    } catch (error: any) {
      console.error('❌ [DERIV AUTH] Erro na autenticação Deriv:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        config: error.config
      })
      
      // Verificar se é erro 405 e tentar alternativa
      if (error.response?.status === 405) {
        console.log('🔄 [DERIV AUTH] Erro 405 - Tentando método alternativo...')
        
        // Tentar com URL alternativa (algumas versões da API Deriv usam endpoints diferentes)
        try {
          const altResponse = await axios({
            method: 'POST',
            url: `${DERIV_CONFIG.apiUrl}/api/v3/authorize`, // URL alternativa
            data: { authorize: token },
            headers: {
              'Content-Type': 'application/json'
            }
          })

          if (altResponse.data.authorize) {
            this.token = token
            this.account = {
              loginid: altResponse.data.authorize.loginid,
              currency: altResponse.data.authorize.currency,
              balance: altResponse.data.authorize.balance,
              account_type: altResponse.data.authorize.account_type,
              email: altResponse.data.authorize.email,
              fullname: altResponse.data.authorize.fullname
            }

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
        } catch (altError: any) {
          console.error('❌ [DERIV AUTH] Método alternativo também falhou:', altError.message)
        }
        
        // Tentar método GET (embora incomum para authorize)
        try {
          const getResponse = await axios({
            method: 'GET',
            url: `${DERIV_CONFIG.apiUrl}/v3/authorize`,
            params: { authorize: token },
            headers: {
              'Content-Type': 'application/json'
            }
          })

          if (getResponse.data.authorize) {
            this.token = token
            this.account = {
              loginid: getResponse.data.authorize.loginid,
              currency: getResponse.data.authorize.currency,
              balance: getResponse.data.authorize.balance,
              account_type: getResponse.data.authorize.account_type,
              email: getResponse.data.authorize.email,
              fullname: getResponse.data.authorize.fullname
            }

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
        } catch (getError: any) {
          console.error('❌ [DERIV AUTH] Método GET também falhou:', getError.message)
        }
      }
      
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message || 'Erro desconhecido na autenticação'
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