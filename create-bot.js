/**
 * Xtremsy Files - Create Telegram Bot
 * 
 * Run this locally to create a Telegram bot for file storage
 * 
 * Usage:
 * 1. Get a bot token from @BotFather on Telegram
 * 2. Run: node create-bot.js
 * 3. Enter your bot token
 * 4. Bot will be created and files stored in your Telegram!
 */

const https = require('https');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function askQuestion(question) {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer);
        });
    });
}

async function createBot(token) {
    return new Promise((resolve, reject) => {
        const url = `https://api.telegram.org/bot${token}/getMe`;
        
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    resolve(result);
                } catch(e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

async function getChatId(token) {
    console.log('\n📱 Now add your bot to a chat and forward any message to @userinfobot');
    console.log('   Get your chat ID and enter it below.\n');
    
    const chatId = await askQuestion('Enter your Telegram Chat ID: ');
    return chatId.trim();
}

async function main() {
    console.log('🤖 Xtremsy Telegram Bot Setup\n');
    console.log('This will create a bot that stores files in your Telegram account.');
    console.log('Steps:');
    console.log('1. Go to @BotFather on Telegram');
    console.log('2. Send /newbot to create a new bot');
    console.log('3. Give it a name (e.g., "Xtremsy Files")');
    console.log('4. Get the bot token\n');
    
    const token = await askQuestion('Enter your bot token: ');
    
    if (!token.trim()) {
        console.log('❌ No token provided');
        process.exit(1);
    }
    
    try {
        console.log('\n🔄 Testing bot token...');
        const botInfo = await createBot(token);
        
        if (botInfo.ok) {
            console.log(`✅ Bot found: @${botInfo.result.username} (${botInfo.result.first_name})`);
        } else {
            console.log('❌ Invalid token');
            process.exit(1);
        }
    } catch (e) {
        console.log('❌ Error:', e.message);
        process.exit(1);
    }
    
    const chatId = await getChatId(token);
    
    console.log('\n📝 Environment variables to use:');
    console.log(`TELEGRAM_BOT_TOKEN=${token}`);
    console.log(`TELEGRAM_CHAT_ID=${chatId}`);
    console.log('\n✅ Setup complete!');
    console.log('\nTo deploy:');
    console.log('1. Deploy server-telegram.js to Render');
    console.log('2. Add environment variables:');
    console.log('   - TELEGRAM_BOT_TOKEN');
    console.log('   - TELEGRAM_CHAT_ID');
    console.log('\nFiles will be stored in your Telegram! 🎉');
    
    rl.close();
}

main().catch(console.error);
