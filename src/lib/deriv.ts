// Configuração da API Deriv
export interface DerivConfig {
  appId: string
  token?: string
  isDemo: boolean
  apiUrl: string
  wsUrl: string
  oauthUrl: string
}

export const DERIV_CONFIG: DerivConfig = {
  appId: process.env.DERIV_APP_ID || '36960', // App ID fornecido pelo usuário
  token: process.env.DERIV_API_TOKEN,
  isDemo: process.env.NODE_ENV !== 'production',
  apiUrl: 'https://api.deriv.com', // URL principal da API
  wsUrl: 'wss://ws.deriv.com/websockets/v3', // WebSocket URL
  oauthUrl: 'https://oauth.deriv.com/oauth2/authorize' // URL de autorização OAuth
}

// Símbolos disponíveis na Deriv
export const DERIV_SYMBOLS = {
  R_10: { name: 'Volatility 10 Index', market: 'synthetic' },
  R_25: { name: 'Volatility 25 Index', market: 'synthetic' },
  R_50: { name: 'Volatility 50 Index', market: 'synthetic' },
  R_75: { name: 'Volatility 75 Index', market: 'synthetic' },
  R_100: { name: 'Volatility 100 Index', market: 'synthetic' },
  FRXEURUSD: { name: 'EUR/USD', market: 'forex' },
  FRXGBPUSD: { name: 'GBP/USD', market: 'forex' },
  FRXUSDJPY: { name: 'USD/JPY', market: 'forex' },
  FRXAUDUSD: { name: 'AUD/USD', market: 'forex' },
  FRXUSDCAD: { name: 'USD/CAD', market: 'forex' },
  CRASH_1000: { name: 'Crash 1000 Index', market: 'synthetic' },
  BOOM_1000: { name: 'Boom 1000 Index', market: 'synthetic' },
  '1HZ10V': { name: 'Volatility 10 (1s) Index', market: 'synthetic' },
  '1HZ25V': { name: 'Volatility 25 (1s) Index', market: 'synthetic' },
  '1HZ50V': { name: 'Volatility 50 (1s) Index', market: 'synthetic' },
  '1HZ75V': { name: 'Volatility 75 (1s) Index', market: 'synthetic' },
  '1HZ100V': { name: 'Volatility 100 (1s) Index', market: 'synthetic' }
}

// Tipos de contratos disponíveis
export const CONTRACT_TYPES = {
  RISE_FALL: 'rise_fall',
  HIGHER_LOWER: 'higher_lower',
  TOUCH_NO_TOUCH: 'touch_no_touch',
  IN_OUT: 'in_out',
  ASIANS: 'asians',
  MULTIPLIERS: 'multipliers'
}

// Durações disponíveis (em segundos)
export const DURATIONS = {
  TICK: 1,
  S_15: 15,
  S_30: 30,
  M_1: 60,
  M_5: 300,
  M_10: 600,
  M_15: 900,
  M_30: 1800,
  H_1: 3600,
  H_2: 7200,
  H_4: 14400,
  H_8: 28800,
  D_1: 86400
}

// Moedas disponíveis
export const CURRENCIES = {
  USD: 'USD',
  EUR: 'EUR',
  GBP: 'GBP',
  BTC: 'BTC',
  ETH: 'ETH',
  LTC: 'LTC'
}

// Configurações de trading
export const TRADING_CONFIG = {
  minStake: 0.35, // Stake mínimo em USD
  maxStake: 10000, // Stake máximo em USD
  defaultStake: 1, // Stake padrão
  defaultDuration: DURATIONS.M_1, // Duração padrão (1 minuto)
  defaultContractType: CONTRACT_TYPES.RISE_FALL
}