'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Settings, Key, User, DollarSign, Shield, CheckCircle, XCircle, AlertCircle } from 'lucide-react'

interface DerivAccount {
  loginid: string
  currency: string
  balance: number
  account_type: 'demo' | 'real'
  email?: string
  fullname?: string
}

export default function DerivConfig() {
  const [token, setToken] = useState('')
  const [account, setAccount] = useState<DerivAccount | null>(null)
  const [balance, setBalance] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Verificar status da autenticação ao carregar
  useEffect(() => {
    checkAuthStatus()
  }, [])

  const checkAuthStatus = async () => {
    try {
      const response = await fetch('/api/deriv/account?action=info')
      const data = await response.json()
      
      if (data.success && data.account) {
        setAccount(data.account)
        setBalance(data.account.balance)
      }
    } catch (error) {
      console.error('Erro ao verificar status de autenticação:', error)
    }
  }

  const handleAuthenticate = async () => {
    if (!token.trim()) {
      setError('Token é obrigatório')
      return
    }

    setIsLoading(true)
    setError('')
    setSuccess('')

    try {
      console.log('🔐 [DERIV] Tentando autenticar com token:', token.substring(0, 10) + '...')
      
      const response = await fetch('/api/deriv/account?action=authenticate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() })
      })

      console.log('📡 [DERIV] Resposta da API:', response.status, response.statusText)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('❌ [DERIV] Erro na resposta:', errorText)
        setError(`Erro ${response.status}: ${errorText}`)
        return
      }

      const data = await response.json()
      console.log('✅ [DERIV] Dados recebidos:', data)
      
      if (data.success) {
        setAccount(data.account)
        setBalance(data.account.balance)
        setSuccess('Autenticado com sucesso!')
        setToken('')
      } else {
        setError(data.error || 'Falha na autenticação')
      }
    } catch (error) {
      console.error('❌ [DERIV] Erro na autenticação:', error)
      setError(`Erro ao autenticar: ${error instanceof Error ? error.message : 'Erro desconhecido'}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreateDemo = async () => {
    setIsLoading(true)
    setError('')
    setSuccess('')

    try {
      const response = await fetch('/api/deriv/account?action=create-demo', {
        method: 'POST'
      })

      const data = await response.json()

      if (data.success) {
        setAccount(data.account)
        setBalance(data.account.balance)
        setSuccess('Conta demo criada com sucesso!')
      } else {
        setError(data.error || 'Falha ao criar conta demo')
      }
    } catch (error) {
      setError('Erro ao criar conta demo')
      console.error('Erro ao criar conta demo:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleLogout = async () => {
    try {
      const response = await fetch('/api/deriv/account?action=logout', {
        method: 'POST'
      })

      const data = await response.json()

      if (data.success) {
        setAccount(null)
        setBalance(0)
        setSuccess('Logout realizado com sucesso!')
      } else {
        setError(data.error || 'Falha no logout')
      }
    } catch (error) {
      setError('Erro ao fazer logout')
      console.error('Erro no logout:', error)
    }
  }

  const refreshBalance = async () => {
    try {
      const response = await fetch('/api/deriv/account?action=balance')
      const data = await response.json()

      if (data.success) {
        setBalance(data.balance)
        setSuccess('Saldo atualizado!')
      } else {
        setError(data.error || 'Falha ao atualizar saldo')
      }
    } catch (error) {
      setError('Erro ao atualizar saldo')
      console.error('Erro ao atualizar saldo:', error)
    }
  }

  return (
    <div className="space-y-6">
      <Card className="bg-gray-800/50 border-gray-700 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Settings className="h-5 w-5" />
            <span>Configuração da API Deriv</span>
          </CardTitle>
          <CardDescription>
            Configure sua conexão com a API Deriv para trading real
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="auth" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="auth">Autenticação</TabsTrigger>
              <TabsTrigger value="account">Conta</TabsTrigger>
              <TabsTrigger value="symbols">Símbolos</TabsTrigger>
            </TabsList>

            <TabsContent value="auth" className="space-y-4">
              {account ? (
                <div className="space-y-4">
                  <Alert className="bg-green-900/20 border-green-700">
                    <CheckCircle className="h-4 w-4" />
                    <AlertDescription>
                      Você está autenticado na Deriv com uma conta {account.account_type}
                    </AlertDescription>
                  </Alert>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm text-gray-400">ID da Conta</Label>
                      <div className="font-mono text-sm">{account.loginid}</div>
                    </div>
                    <div>
                      <Label className="text-sm text-gray-400">Tipo</Label>
                      <Badge className={account.account_type === 'demo' ? 'bg-blue-600' : 'bg-green-600'}>
                        {account.account_type === 'demo' ? 'Demo' : 'Real'}
                      </Badge>
                    </div>
                    <div>
                      <Label className="text-sm text-gray-400">Moeda</Label>
                      <div className="font-semibold">{account.currency}</div>
                    </div>
                    <div>
                      <Label className="text-sm text-gray-400">Saldo</Label>
                      <div className="font-semibold text-green-400">
                        {account.currency} {balance.toFixed(2)}
                      </div>
                    </div>
                  </div>

                  {account.email && (
                    <div>
                      <Label className="text-sm text-gray-400">Email</Label>
                      <div className="text-sm">{account.email}</div>
                    </div>
                  )}

                  <div className="flex space-x-2">
                    <Button
                      onClick={refreshBalance}
                      variant="outline"
                      className="flex-1"
                      disabled={isLoading}
                    >
                      <DollarSign className="h-4 w-4 mr-2" />
                      Atualizar Saldo
                    </Button>
                    <Button
                      onClick={handleLogout}
                      variant="outline"
                      className="flex-1 bg-red-600 border-red-600 hover:bg-red-700"
                      disabled={isLoading}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Sair
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <Alert className="bg-yellow-900/20 border-yellow-700">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Você não está autenticado na Deriv. Crie uma conta demo ou use um token existente.
                    </AlertDescription>
                  </Alert>

                  <div className="space-y-2">
                    <Label htmlFor="token">Token da API Deriv</Label>
                    <Input
                      id="token"
                      type="password"
                      placeholder="Cole seu token da API Deriv aqui"
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      className="bg-gray-700 border-gray-600"
                    />
                    <p className="text-xs text-gray-400">
                      Obtenha seu token em: Deriv API Settings → Generate Token
                    </p>
                    <p className="text-xs text-blue-400">
                      💡 Modo teste: Use "demo_" + qualquer texto para testar (ex: demo_teste123)
                    </p>
                  </div>

                  <div className="flex space-x-2">
                    <Button
                      onClick={handleAuthenticate}
                      className="flex-1"
                      disabled={isLoading || !token.trim()}
                    >
                      <Key className="h-4 w-4 mr-2" />
                      {isLoading ? 'Autenticando...' : 'Autenticar'}
                    </Button>
                    <Button
                      onClick={handleCreateDemo}
                      variant="outline"
                      className="flex-1"
                      disabled={isLoading}
                    >
                      <User className="h-4 w-4 mr-2" />
                      Criar Demo
                    </Button>
                  </div>
                </div>
              )}

              {error && (
                <Alert className="bg-red-900/20 border-red-700">
                  <XCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {success && (
                <Alert className="bg-green-900/20 border-green-700">
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>{success}</AlertDescription>
                </Alert>
              )}
            </TabsContent>

            <TabsContent value="account" className="space-y-4">
              {account ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card className="bg-gray-700/50 border-gray-600">
                      <CardContent className="p-4">
                        <div className="flex items-center space-x-2">
                          <DollarSign className="h-5 w-5 text-green-400" />
                          <div>
                            <div className="text-sm text-gray-400">Saldo Disponível</div>
                            <div className="text-xl font-bold text-green-400">
                              {account.currency} {balance.toFixed(2)}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="bg-gray-700/50 border-gray-600">
                      <CardContent className="p-4">
                        <div className="flex items-center space-x-2">
                          <Shield className="h-5 w-5 text-blue-400" />
                          <div>
                            <div className="text-sm text-gray-400">Tipo de Conta</div>
                            <div className="text-xl font-bold text-blue-400">
                              {account.account_type === 'demo' ? 'Demo' : 'Real'}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="space-y-2">
                    <Label>Informações da Conta</Label>
                    <div className="bg-gray-700/50 rounded-lg p-4 space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-400">ID:</span>
                        <span className="font-mono">{account.loginid}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Moeda:</span>
                        <span>{account.currency}</span>
                      </div>
                      {account.email && (
                        <div className="flex justify-between">
                          <span className="text-gray-400">Email:</span>
                          <span>{account.email}</span>
                        </div>
                      )}
                      {account.fullname && (
                        <div className="flex justify-between">
                          <span className="text-gray-400">Nome:</span>
                          <span>{account.fullname}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <Alert className="bg-yellow-900/20 border-yellow-700">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Autentique-se primeiro para ver as informações da conta
                  </AlertDescription>
                </Alert>
              )}
            </TabsContent>

            <TabsContent value="symbols" className="space-y-4">
              <div className="space-y-2">
                <Label>Símbolos Disponíveis para Trading</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div className="bg-gray-700/50 rounded-lg p-3">
                    <div className="font-semibold">Volatility Indices</div>
                    <div className="text-sm text-gray-400 space-y-1">
                      <div>• R_10 - Volatility 10 Index</div>
                      <div>• R_25 - Volatility 25 Index</div>
                      <div>• R_50 - Volatility 50 Index</div>
                      <div>• R_75 - Volatility 75 Index</div>
                      <div>• R_100 - Volatility 100 Index</div>
                    </div>
                  </div>
                  <div className="bg-gray-700/50 rounded-lg p-3">
                    <div className="font-semibold">Forex Pairs</div>
                    <div className="text-sm text-gray-400 space-y-1">
                      <div>• FRXEURUSD - EUR/USD</div>
                      <div>• FRXGBPUSD - GBP/USD</div>
                      <div>• FRXUSDJPY - USD/JPY</div>
                      <div>• FRXAUDUSD - AUD/USD</div>
                      <div>• FRXUSDCAD - USD/CAD</div>
                    </div>
                  </div>
                  <div className="bg-gray-700/50 rounded-lg p-3">
                    <div className="font-semibold">Crash/Boom</div>
                    <div className="text-sm text-gray-400 space-y-1">
                      <div>• CRASH_1000 - Crash 1000 Index</div>
                      <div>• BOOM_1000 - Boom 1000 Index</div>
                    </div>
                  </div>
                  <div className="bg-gray-700/50 rounded-lg p-3">
                    <div className="font-semibold">1 Second Indices</div>
                    <div className="text-sm text-gray-400 space-y-1">
                      <div>• 1HZ10V - Volatility 10 (1s)</div>
                      <div>• 1HZ25V - Volatility 25 (1s)</div>
                      <div>• 1HZ50V - Volatility 50 (1s)</div>
                      <div>• 1HZ75V - Volatility 75 (1s)</div>
                      <div>• 1HZ100V - Volatility 100 (1s)</div>
                    </div>
                  </div>
                </div>
              </div>

              <Alert className="bg-blue-900/20 border-blue-700">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Todos os símbolos estão disponíveis para trading em ambiente demo. 
                  Em ambiente real, verifique a disponibilidade na sua conta.
                </AlertDescription>
              </Alert>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}