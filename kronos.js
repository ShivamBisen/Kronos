require('dotenv').config()
const { Connection, clusterApiUrl, Keypair, SystemProgram } = require("@solana/web3.js")
const TelegramBot = require("node-telegram-bot-api")
const bs58 = require('bs58'); 


const BOT_TOKEN = process.env.YOUR_BOT_TOKEN_HERE
const bot = new TelegramBot(BOT_TOKEN,{polling:true})

const connection = new Connection(clusterApiUrl('mainnet-beta'))

const userKey = {}

bot.onText(/\/start/,(msg)=>{
    const chatId = msg.chat.id
    bot.sendMessage(chatId,`Welcome to Kronos a Solana bot by StarLight`)

})

bot.on('message',async(msg)=>{
    const chatId = msg.chat.id;
    const userInput = msg.text;

    if(userInput.startsWith('/start')) return;

    try{
        const privateKeyBytes = bs58.default.decode(userInput)
        const keypair = Keypair.fromSecretKey(privateKeyBytes)

        userKey[chatId]=keypair

        const balance = await connection.getBalance(keypair.publicKey)
        bot.sendMessage(chatId,
                `Your Solana Balance : ${balance/1e9} SOL. \nChoose an option below:`,
                {
                    reply_markup:{
                        inline_keyboard:[
                            [{text:'Check Balance',callback_data:'check_balance'}],
                            [{text:'Swap Token',callback_data:'check_token'}],
                            [{text:'Send Token',callback_data:'send_token'}]
                        ]
                    }
                }
            )


    }catch(error){
        console.error('Error:', error.message);
        bot.sendMessage(chatId, 'Invalid private key. Please ensure it is in Base58 format.');
    }
})


bot.on('callback_query',async(query)=>{
    const chatId = query.message.chat.id;
    const userInput = query.data;

    if(!userKey[chatId]){
        bot.sendMessage(chatId,'Please set your private key first using /start command')
        return;
    }

    switch(action){
        case 'check_balance':
            try{
                const keypair = userKey[chatId]
                const balance = await connection.getBalance(keypair.publicKey);
                bot.sendMessage(chatId,`Your Solana Balance : ${balance/1e9} SOL.`)
            }catch(error){
                bot.sendMessage(chatId,'Error checking balance. Please try again.')
            }
            break;

        case 'swap_token':
            try{
                bot.sendMessage(chatId,'Enter the details for the token swap in the following format:\n`TOKEN_A,TOKEN_B,AMOUNT`',{parse_mode:'Markdown'})

            }catch(error){
                bot.sendMessage(chatId,'Error checking swap. Please try again.')
            }
            break;
        case 'send_token':
            try{
                bot.sendMessage(chatId,'Enter the details for the token swap in the following format:\n`RECIVER_ADDRESS,AMOUNT`',{parse_mode:'Markdown'})

            }catch(error){
                bot.sendMessage(chatId,'Error checking send. Please try again.')
            }
            break;
    }
})


bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userInput = msg.text;

    if (userInput.includes(',')) {
        const keypair = userKey[chatId];
        if (!keypair) {
            bot.sendMessage(chatId, 'Please submit your private key first.');
            return;
        }

        const [param1, param2, param3] = userInput.split(',');

        // Handle token swap or send token based on input format
        if (param3) { // Swap case
            try {
                const [sourceToken, destToken, amount] = [param1, param2, param3];
                bot.sendMessage(chatId, `Swapping ${amount} ${sourceToken} for ${destToken}...`);
                const swapRoute = await getSwapRoute(sourceToken, destToken, amount);
                const transaction = await executeSwap(keypair, swapRoute);
                bot.sendMessage(chatId, `Swap successful! Transaction ID:\n${transaction}`);
            } catch (error) {
                console.error('Swap Error:', error.message);
                bot.sendMessage(chatId, 'Error executing the swap. Please try again.');
            }
        } else { // Send token case
            try {
                const [receiverAddress, amount] = [param1, parseFloat(param2) * 1e9];
                bot.sendMessage(chatId, `Sending ${param2} SOL to ${receiverAddress}...`);
                const signature = await sendToken(keypair, receiverAddress, amount);
                bot.sendMessage(chatId, `Transaction successful! Transaction ID:\n${signature}`);
            } catch (error) {
                console.error('Send Token Error:', error.message);
                bot.sendMessage(chatId, 'Error sending tokens. Please try again.');
            }
        }
    }
});
async function getSwapRoute(sourceToken, destToken, amount) {
    const url = `https://quote-api.jup.ag/v4/quote?inputMint=${sourceToken}&outputMint=${destToken}&amount=${amount}&slippage=0.5`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data || !data.data[0]) throw new Error('No swap route found.');

    return data.data[0];
}
async function executeSwap(keypair, swapRoute) {
    const transaction = Transaction.from(Buffer.from(swapRoute.tx.data, 'base64'));

    transaction.sign(keypair);

    const signature = await connection.sendRawTransaction(transaction.serialize());
    await connection.confirmTransaction(signature);

    return signature;
}
async function sendToken(keypair, receiverAddress, amount) {
    const transaction = new Transaction();
    transaction.add(
        SystemProgram.transfer({
            fromPubkey: keypair.publicKey,
            toPubkey: new PublicKey(receiverAddress),
            lamports: amount
        })
    )

    const signature = await connection.sendTransaction(transaction, [keypair]);
    await connection.confirmTransaction({
        signature,
        blockhash: transaction.recentBlockhash,
        lastValidBlockHeight: transaction.lastValidBlockHeight,
    });
    return signature;
}