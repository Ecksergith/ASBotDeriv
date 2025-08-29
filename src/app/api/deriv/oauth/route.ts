import { NextRequest, NextResponse } from 'next/server'
import { DERIV_CONFIG } from '@/lib/deriv'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')
    
    switch (action) {
      case 'authorize':
        return await initiateOAuth()
      default:
        return NextResponse.json(
          { error: 'Ação inválida' },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('Erro na API OAuth:', error)
    return NextResponse.json(
      { error: 'Erro interno' },
      { status: 500 }
    )
  }
}

async function initiateOAuth(): Promise<NextResponse> {
  try {
    // Construir URL de autorização OAuth conforme documentação da Deriv
    const authUrl = new URL(DERIV_CONFIG.oauthUrl)
    authUrl.searchParams.append('app_id', DERIV_CONFIG.appId)
    authUrl.searchParams.append('l', 'en') // Idioma
    authUrl.searchParams.append('redirect_uri', `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/deriv/oauth/callback`)
    
    console.log('🔐 [OAUTH] Iniciando fluxo OAuth com URL:', authUrl.toString())
    
    return NextResponse.json({
      success: true,
      authUrl: authUrl.toString(),
      message: 'Redirecione o usuário para esta URL para autenticação OAuth'
    })
  } catch (error) {
    console.error('Erro ao iniciar OAuth:', error)
    return NextResponse.json(
      { error: 'Falha ao iniciar fluxo OAuth' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')
    
    switch (action) {
      case 'callback':
        return await handleOAuthCallback(request)
      default:
        return NextResponse.json(
          { error: 'Ação inválida' },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('Erro na API OAuth:', error)
    return NextResponse.json(
      { error: 'Erro interno' },
      { status: 500 }
    )
  }
}

async function handleOAuthCallback(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json()
    const { url } = body
    
    if (!url) {
      return NextResponse.json({
        success: false,
        error: 'URL de callback não fornecida'
      }, { status: 400 })
    }
    
    console.log('🔐 [OAUTH] Processando callback OAuth com URL:', url)
    
    // Extrair parâmetros da URL
    const urlObj = new URL(url)
    const params = urlObj.searchParams
    
    // Extrair tokens e contas da URL conforme formato da Deriv
    // Formato esperado: acct1=cr799393&token1=a1-f7pnteezo4jzhpxclctizt27hyeot&cur1=usd&acct2=vrtc1859315&token2=a1clwe3vfuuus5kraceykdsoqm4snfq&cur2=usd
    const accounts: any[] = []
    
    // Iterar sobre possíveis contas (acct1, acct2, etc.)
    let i = 1
    while (params.has(`acct${i}`)) {
      const accountId = params.get(`acct${i}`)
      const token = params.get(`token${i}`)
      const currency = params.get(`cur${i}`)
      
      if (accountId && token) {
        accounts.push({
          loginid: accountId,
          token: token,
          currency: currency || 'USD'
        })
      }
      i++
    }
    
    if (accounts.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Nenhuma conta encontrada na URL de callback'
      }, { status: 400 })
    }
    
    console.log('🔐 [OAUTH] Contas extraídas:', accounts)
    
    return NextResponse.json({
      success: true,
      accounts: accounts,
      message: `${accounts.length} conta(s) encontrada(s)`
    })
  } catch (error) {
    console.error('Erro ao processar callback OAuth:', error)
    return NextResponse.json(
      { error: 'Falha ao processar callback OAuth' },
      { status: 500 }
    )
  }
}