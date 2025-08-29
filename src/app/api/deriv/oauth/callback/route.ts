import { NextRequest, NextResponse } from 'next/server'

// Este endpoint handles o redirecionamento OAuth da Deriv
export async function GET(request: NextRequest) {
  try {
    const url = request.url
    console.log('🔐 [OAUTH CALLBACK] Recebido redirecionamento OAuth:', url)
    
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
      console.error('❌ [OAUTH CALLBACK] Nenhuma conta encontrada na URL')
      // Retornar página HTML com erro
      return new Response(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>OAuth Callback - Erro</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 40px; background: #1a1a1a; color: #fff; }
            .container { max-width: 600px; margin: 0 auto; padding: 30px; background: #2d2d2d; border-radius: 8px; }
            .error { color: #ff6b6b; margin-bottom: 20px; }
            .success { color: #4ecdc4; margin-bottom: 20px; }
            button { background: #4ecdc4; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>OAuth Callback</h1>
            <div class="error">
              <h3>Erro na Autenticação</h3>
              <p>Nenhuma conta foi encontrada na resposta OAuth. Verifique se você concedeu acesso à aplicação.</p>
            </div>
            <button onclick="window.close()">Fechar</button>
          </div>
          <script>
            // Tentar comunicar com a janela parent
            if (window.opener) {
              window.opener.postMessage({
                type: 'oauth_error',
                error: 'Nenhuma conta encontrada'
              }, '*');
            }
          </script>
        </body>
        </html>
      `, { headers: { 'Content-Type': 'text/html' } })
    }
    
    console.log('✅ [OAUTH CALLBACK] Contas extraídas:', accounts)
    
    // Retornar página HTML com sucesso e os tokens
    return new Response(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>OAuth Callback - Sucesso</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; background: #1a1a1a; color: #fff; }
          .container { max-width: 600px; margin: 0 auto; padding: 30px; background: #2d2d2d; border-radius: 8px; }
          .success { color: #4ecdc4; margin-bottom: 20px; }
          .account { background: #3d3d3d; padding: 15px; margin: 10px 0; border-radius: 4px; }
          button { background: #4ecdc4; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; margin: 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Autenticação OAuth Concluída!</h1>
          <div class="success">
            <h3>Sucesso!</h3>
            <p>Você foi autenticado com sucesso. Foram encontradas ${accounts.length} conta(s).</p>
          </div>
          
          <h3>Contas Disponíveis:</h3>
          ${accounts.map((account, index) => `
            <div class="account">
              <strong>Conta ${index + 1}:</strong><br>
              ID: ${account.loginid}<br>
              Moeda: ${account.currency}<br>
              Tipo: ${account.loginid.startsWith('VRTC') ? 'Demo' : 'Real'}
            </div>
          `).join('')}
          
          <button onclick="sendAccountsToParent()">Usar Contas</button>
          <button onclick="window.close()">Fechar</button>
        </div>
        
        <script>
          const accounts = ${JSON.stringify(accounts)};
          
          function sendAccountsToParent() {
            if (window.opener) {
              window.opener.postMessage({
                type: 'oauth_success',
                accounts: accounts
              }, '*');
            }
            window.close();
          }
          
          // Enviar automaticamente após 2 segundos
          setTimeout(sendAccountsToParent, 2000);
        </script>
      </body>
      </html>
    `, { headers: { 'Content-Type': 'text/html' } })
    
  } catch (error) {
    console.error('❌ [OAUTH CALLBACK] Erro ao processar callback:', error)
    
    return new Response(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>OAuth Callback - Erro</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; background: #1a1a1a; color: #fff; }
          .container { max-width: 600px; margin: 0 auto; padding: 30px; background: #2d2d2d; border-radius: 8px; }
          .error { color: #ff6b6b; margin-bottom: 20px; }
          button { background: #ff6b6b; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>OAuth Callback</h1>
          <div class="error">
            <h3>Erro na Autenticação</h3>
            <p>Ocorreu um erro ao processar a autenticação OAuth.</p>
            <p><strong>Detalhes:</strong> ${error instanceof Error ? error.message : 'Erro desconhecido'}</p>
          </div>
          <button onclick="window.close()">Fechar</button>
        </div>
        <script>
          if (window.opener) {
            window.opener.postMessage({
              type: 'oauth_error',
              error: '${error instanceof Error ? error.message : 'Erro desconhecido'}'
            }, '*');
          }
        </script>
      </body>
      </html>
    `, { headers: { 'Content-Type': 'text/html' } })
  }
}