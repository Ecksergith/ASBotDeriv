# Integração com API Deriv

Este documento descreve como configurar e usar a integração com a API Deriv no ML Trading Bot.

## 🚀 Configuração Rápida

### 1. Obter um App ID da Deriv

1. Acesse [Deriv Developers](https://developers.deriv.com/)
2. Faça login com sua conta Deriv
3. Crie um novo aplicativo para obter um App ID
4. Use o App ID padrão `36960` para testes

### 2. Configurar Variáveis de Ambiente

Copie o arquivo `.env.example` para `.env.local`:

```bash
cp .env.example .env.local
```

Configure as variáveis:

```env
DERIV_APP_ID=36960
DERIV_API_TOKEN=seu_token_aqui
NODE_ENV=development
```

### 3. Obter Token da API

1. Faça login em sua conta Deriv
2. Vá para: Account → API Settings
3. Clique em "Generate Token"
4. Selecione os escopos necessários:
   - `read` - Ler informações da conta
   - `trade` - Executar trades
   - `payments` - Gerenciar pagamentos
   - `admin` - Acesso administrativo

## 🔧 Funcionalidades Implementadas

### 1. Autenticação
- ✅ Login com token da API
- ✅ Criação de conta demo automática
- ✅ Gerenciamento de sessão
- ✅ Logout seguro

### 2. Mercado e Dados
- ✅ Dados de mercado em tempo real
- ✅ Múltiplos símbolos (Volatility Indices, Forex, Crash/Boom)
- ✅ Cache de dados para melhor performance
- ✅ Atualização automática de preços

### 3. Trading
- ✅ Execução de trades via WebSocket
- ✅ Propostas de contratos
- ✅ Gerenciamento de contratos abertos
- ✅ Stop Loss e Take Profit
- ✅ Validação de valores mínimos/máximos

### 4. Gerenciamento de Conta
- ✅ Saldo em tempo real
- ✅ Informações da conta
- ✅ Histórico de transações
- ✅ Suporte a contas demo e reais

## 📊 Símbolos Disponíveis

### Volatility Indices
- `R_10` - Volatility 10 Index
- `R_25` - Volatility 25 Index
- `R_50` - Volatility 50 Index
- `R_75` - Volatility 75 Index
- `R_100` - Volatility 100 Index

### Forex Pairs
- `FRXEURUSD` - EUR/USD
- `FRXGBPUSD` - GBP/USD
- `FRXUSDJPY` - USD/JPY
- `FRXAUDUSD` - AUD/USD
- `FRXUSDCAD` - USD/CAD

### Crash/Boom Indices
- `CRASH_1000` - Crash 1000 Index
- `BOOM_1000` - Boom 1000 Index

### 1 Second Indices
- `1HZ10V` - Volatility 10 (1s) Index
- `1HZ25V` - Volatility 25 (1s) Index
- `1HZ50V` - Volatility 50 (1s) Index
- `1HZ75V` - Volatility 75 (1s) Index
- `1HZ100V` - Volatility 100 (1s) Index

## 💡 Como Usar

### 1. Configurar a API Deriv

1. Abra a aplicação
2. Vá para a aba "Deriv API"
3. Escolha uma opção:
   - **Criar Conta Demo**: Cria automaticamente uma conta demo
   - **Autenticar com Token**: Use um token existente

### 2. Trading Manual

1. Após autenticar, vá para a aba "Trading"
2. Selecione um símbolo disponível
3. Escolha o tipo de operação (buy/sell)
4. Defina o valor (mínimo $0.35)
5. Execute o trade

### 3. Auto Trade com ML

1. Vá para a aba "Auto Trade"
2. Ative o bot principal ("Iniciar Bot")
3. Ative o Auto Trade ("Auto Trade OFF")
4. Configure os parâmetros:
   - Símbolos habilitados
   - Confiança mínima
   - Valor máximo por trade
   - Stop Loss e Take Profit

### 4. Monitoramento

- **Trades Abertos**: Acompanhe contratos abertos
- **Histórico**: Veja trades executados
- **Logs**: Monitore atividades em tempo real
- **Saldo**: Acompanhe o balance da conta

## 🔒 Segurança

### Boas Práticas
- Nunca compartilhe seu token da API
- Use contas demo para testes
- Limite os escopos do token ao necessário
- Mantenha seu token seguro no ambiente

### Escopos Recomendados
- **Para testes**: `read`, `trade`
- **Para produção**: `read`, `trade`, `payments`
- **Para administração**: `read`, `trade`, `payments`, `admin`

## 🐛 Solução de Problemas

### Problemas Comuns

#### 1. "Não autenticado"
- Verifique se o token está correto
- Confira se o token não expirou
- Tente gerar um novo token

#### 2. "Falha ao executar trade"
- Verifique o saldo da conta
- Confira se o valor está acima do mínimo ($0.35)
- Verifique se o símbolo está disponível

#### 3. "Conexão WebSocket falhou"
- Verifique sua conexão com a internet
- Confira se o App ID está correto
- Tente reiniciar a aplicação

### Logs de Depuração

Ative os logs para ver detalhes das operações:

```javascript
// No console do navegador
localStorage.setItem('debug', 'deriv:*')
```

## 📚 API Reference

### Endpoints Principais

#### Autenticação
```javascript
POST /api/deriv/account?action=authenticate
{
  "token": "seu_token"
}
```

#### Criar Conta Demo
```javascript
POST /api/deriv/account?action=create-demo
```

#### Obter Saldo
```javascript
GET /api/deriv/account?action=balance
```

#### Executar Trade
```javascript
POST /api/trading/execute
{
  "symbol": "R_100",
  "type": "buy",
  "amount": 1.00,
  "ml_confidence": 75
}
```

#### Obter Dados de Mercado
```javascript
GET /api/trading/market?symbol=R_100
```

## 🔄 Atualizações

Esta integração está em desenvolvimento contínuo. Próximas melhorias:

- [ ] Suporte a mais tipos de contratos
- [ ] Melhor gerenciamento de risco
- [ ] Gráficos em tempo real
- [ ] Notificações push
- [ ] Otimização de performance

## 📞 Suporte

Para problemas ou dúvidas:
1. Verifique os logs na aba "Logs"
2. Consulte a documentação oficial da Deriv
3. Abra uma issue no repositório

## 📄 Licença

Esta integração segue a mesma licença do projeto principal.