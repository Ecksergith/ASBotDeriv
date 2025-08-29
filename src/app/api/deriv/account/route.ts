import { NextRequest, NextResponse } from 'next/server'
import { derivAuthService } from '@/lib/deriv-auth'

interface AccountResponse {
  success: boolean
  account?: {
    loginid: string
    currency: string
    balance: number
    account_type: 'demo' | 'real'
    email?: string
    fullname?: string
  }
  error?: string
}

interface BalanceResponse {
  success: boolean
  balance?: number
  currency?: string
  error?: string
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')
    
    switch (action) {
      case 'info':
        return await getAccountInfo()
      case 'balance':
        return await getBalance()
      default:
        return NextResponse.json(
          { error: 'Ação inválida' },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('Erro na API de conta:', error)
    return NextResponse.json(
      { error: 'Erro interno' },
      { status: 500 }
    )
  }
}

async function getAccountInfo(): Promise<NextResponse> {
  try {
    if (!derivAuthService.isAuthenticated()) {
      return NextResponse.json({
        success: false,
        error: 'Não autenticado'
      })
    }

    const account = await derivAuthService.getAccountInfo()
    
    if (!account) {
      return NextResponse.json({
        success: false,
        error: 'Não foi possível obter informações da conta'
      })
    }

    return NextResponse.json({
      success: true,
      account
    })
  } catch (error) {
    console.error('Erro ao obter informações da conta:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    })
  }
}

async function getBalance(): Promise<NextResponse> {
  try {
    if (!derivAuthService.isAuthenticated()) {
      return NextResponse.json({
        success: false,
        error: 'Não autenticado'
      })
    }

    const balance = await derivAuthService.getBalance()
    const account = derivAuthService.getAccount()
    
    return NextResponse.json({
      success: true,
      balance,
      currency: account?.currency || 'USD'
    })
  } catch (error) {
    console.error('Erro ao obter saldo:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')
    
    console.log(`📝 [DERIV API] Requisição POST recebida - action: ${action}`)
    
    switch (action) {
      case 'create-demo':
        return await createDemoAccount()
      case 'authenticate':
        return await authenticateAccount(request)
      case 'logout':
        return await logoutAccount()
      default:
        console.log(`❌ [DERIV API] Ação inválida: ${action}`)
        return NextResponse.json(
          { error: 'Ação inválida' },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('❌ [DERIV API] Erro na API de conta:', error)
    return NextResponse.json(
      { error: 'Erro interno' },
      { status: 500 }
    )
  }
}

async function createDemoAccount(): Promise<NextResponse> {
  try {
    const result = await derivAuthService.createDemoAccount()
    
    if (result.success) {
      return NextResponse.json({
        success: true,
        message: 'Conta demo criada com sucesso',
        account: result.account
      })
    } else {
      return NextResponse.json({
        success: false,
        error: result.error || 'Falha ao criar conta demo'
      })
    }
  } catch (error) {
    console.error('Erro ao criar conta demo:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    })
  }
}

async function authenticateAccount(request: NextRequest): Promise<NextResponse> {
  try {
    const { token } = await request.json()
    
    console.log(`🔐 [DERIV API] Tentando autenticar com token: ${token ? token.substring(0, 10) + '...' : 'undefined'}`)
    
    if (!token) {
      console.log(`❌ [DERIV API] Token não fornecido`)
      return NextResponse.json({
        success: false,
        error: 'Token é obrigatório'
      })
    }

    const result = await derivAuthService.authenticate(token)
    console.log(`✅ [DERIV API] Resultado da autenticação:`, result)
    
    if (result.success) {
      return NextResponse.json({
        success: true,
        message: 'Autenticado com sucesso',
        account: result.account
      })
    } else {
      console.log(`❌ [DERIV API] Falha na autenticação:`, result.error)
      return NextResponse.json({
        success: false,
        error: result.error || 'Falha na autenticação'
      })
    }
  } catch (error) {
    console.error('❌ [DERIV API] Erro na autenticação:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    })
  }
}

async function logoutAccount(): Promise<NextResponse> {
  try {
    derivAuthService.logout()
    
    return NextResponse.json({
      success: true,
      message: 'Logout realizado com sucesso'
    })
  } catch (error) {
    console.error('Erro no logout:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    })
  }
}