import fetch from 'node-fetch'
import readline from 'readline'

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

async function registerWebhook() {
  console.log("=== Telegram Webhook Registration ===")
  
  rl.question('Enter your Telegram Bot Token (from @BotFather): ', (token) => {
    rl.question('Enter your live Netlify URL (e.g. https://my-app.netlify.app): ', async (url) => {
      
      const cleanUrl = url.endsWith('/') ? url.slice(0, -1) : url
      const webhookUrl = `${cleanUrl}/.netlify/functions/api?action=telegramWebhook`
      
      console.log(`\nRegistering webhook to: ${webhookUrl}`)
      
      try {
        const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: webhookUrl })
        })
        
        const data = await response.json()
        
        if (data.ok) {
          console.log('\n✅ Success! Telegram will now instantly post connection requests to your app.')
          console.log('\nMake sure you have added TELEGRAM_BOT_TOKEN to your Netlify Environment Variables.')
          console.log('Update src/App.tsx with your bot username in the connection link!')
        } else {
          console.error('\n❌ Failed to register webhook:', data.description)
        }
      } catch (err) {
        console.error('\n❌ Network error while registering webhook:', err)
      }
      
      rl.close()
    })
  })
}

registerWebhook();
