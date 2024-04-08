import {
    getEMA,
    getBB,
    getRSI
} from './indicators'

import {
    CRYPTO_COMPARE_API_KEY,
    LOG_LEVEL,
    CANDLE_AGGREGATE_MINUTES,
    GET_MARKET_DATA_INTERVAL_SECONDS,
    STOP_LOSS,
    TAKE_PROFIT,
    BUY_TOKEN_ADDRESS,
    QUOTE_SYMBOL,
    SLIPPAGE_PERCENT,
} from './constants'

import {
    logger,
    request,
    sleep,
} from "./utils"

import {version} from './package.json'
import * as fs from "fs"
import {
    getSolBalance,
    getTokenAmountByAddress,
} from "./wallet";
import {buyToken} from "./trade";

let activePosition: any | null = null
const positionFilePath = './position.json'

let buySymbol: string
let quoteAddress: string

let solBalance: number
let buyTokenBalance: number
let buyTokenDecimals: number
let quoteTokenBalance: number
let quoteTokenDecimals: number

const main = async () => {
    await init()

    try {
        await analyzeMarket()
        setTimeout(runAnalyzeMarket, GET_MARKET_DATA_INTERVAL_SECONDS * 1000)
    } catch (error) {
        logger.error(error, 'Error occurred while analyzing market:')
    }
}

const runAnalyzeMarket = async () => {
    try {
        await analyzeMarket()
    } catch (error) {
        logger.error(error, 'Error occurred while analyzing market:')
    } finally {
        setTimeout(runAnalyzeMarket, GET_MARKET_DATA_INTERVAL_SECONDS * 1000)
    }
}

async function init() {
    logger.level = LOG_LEVEL
    logger.info(`
88888888888 8888888b.         d8888 8888888b.  8888888 8888888888 
    888     888   Y88b       d88888 888   Y88b   888   888        
    888     888    888      d88P888 888    888   888   888        
    888     888   d88P     d88P 888 888    888   888   8888888    
    888     8888888P"     d88P  888 888    888   888   888        
    888     888 T88b     d88P   888 888    888   888   888        
    888     888  T88b   d8888888888 888  .d88P   888   888        
    888     888   T88b d88P     888 8888888P"  8888888 8888888888
     
           Solana ultimate trading bot. version: ${version}
`)

    logger.info(`Stop Loss is ${STOP_LOSS}%.`)
    logger.info(`Take Profit is ${TAKE_PROFIT}%.`)
    logger.info(`Analyzing market price every ${GET_MARKET_DATA_INTERVAL_SECONDS} seconds.`)
    logger.info(`Candle aggregate for ${CANDLE_AGGREGATE_MINUTES} min.`)
    logger.info(`Slippage is ${SLIPPAGE_PERCENT}%.`)

    try {
        const assets = await getAssetsData()
        buySymbol = assets.buySymbol
        quoteAddress = assets.quoteAddress
        logger.debug(`Quote Token Symbol: ${QUOTE_SYMBOL}. Found Address: ${quoteAddress}`)
    } catch (error) {
        logger.error(error, 'Error occurred while getting assets data')
        process.exit(1)
    }

    await getBalances()

    logger.info(`Start trading ${buySymbol}-${QUOTE_SYMBOL}.`)

    try {
        await loadSavedPosition()
        if (activePosition) {
            logger.info(`Saved position found. Balance: ${activePosition.amount} ${activePosition.buySymbol}. BuyPrice is ${activePosition.buyPrice} ${activePosition.quoteSymbol}.`)
        }
    } catch (error) {
        logger.error(error, 'Error occurred while loading the saved position from file')
    }

    logger.info('———————————————————————')
}

async function analyzeMarket() {
    const candleData = await getCandleData()
    if (!candleData || !candleData.Data || !candleData.Data.Data || !candleData.Data.Data.length) {
        if (candleData.Response === 'Error') {
            throw new Error(`Failed to fetch candle data: ${candleData.Message}`)
        } else {
            throw new Error('Failed to fetch candle data or data is empty')
        }
    }

    const data = candleData.Data.Data
    const closePrice = data[data.length - 1].close
    const emaShort = getEMA(data, 5)
    const emaMedium = getEMA(data, 20)
    const bb = getBB(data)
    const rsi = getRSI(data)

    logger.info(`Price: ${closePrice} ${QUOTE_SYMBOL}`)
    logger.info(`EMA short: ${emaShort}`)
    logger.info(`EMA medium: ${emaMedium}`)
    logger.info(`BB lower: ${bb.lower}`)
    logger.info(`BB upper: ${bb.upper}`)
    logger.info(`RSI: ${rsi}`)

    if (buyTokenBalance > 0) {
        logger.debug(`Buy Token balance is ${buyTokenBalance} ${buySymbol}. Looking for sell signal...`)

        if (activePosition) {
            if (closePrice <= activePosition.buyPrice * (100 - STOP_LOSS) / 100) {
                logger.warn(`Stop Loss is reached. Start selling...`)
                await sell(closePrice)
            }

            if (closePrice >= activePosition.buyPrice * (100 + TAKE_PROFIT) / 100) {
                logger.warn(`Take Profit is reached. Start selling...`)
                await sell(closePrice)
            }
        }

        if (((emaShort < emaMedium) || (closePrice > bb.upper)) && rsi >= 75) {
            logger.warn(`SELL signal is detected. Start selling...`)
            await sell(closePrice)
        }
    }

    if (quoteTokenBalance > 0) {
        logger.debug(`Quote Token balance is ${quoteTokenBalance} ${QUOTE_SYMBOL}. Looking for buy signal...`)

        if (((emaShort > emaMedium) || (closePrice < bb.lower)) && rsi <= 31) {
            logger.warn(`BUY signal is detected. Buying...`)
            await buy(closePrice)
        }
    }

    logger.info('———————————————————————')
}

async function sell(price: number) {
    if (activePosition) {
        logger.warn(`Price difference is ${price - activePosition.buyPrice} (${Math.sign(price - activePosition.buyPrice) * Math.round((activePosition.buyPrice / price) * 100 - 100) / 100}%)`)
    }
    await getBalances()

    const amountWithDecimals = buyTokenBalance * (10 ** buyTokenDecimals)

    try {
        await buyToken(BUY_TOKEN_ADDRESS, quoteAddress, amountWithDecimals.toString(), logger)
    } catch (error: any) {
        if (error.err) {
            logger.error(`Got error on sell transaction: ${error.err.message}`)
        }

        logger.error(error, `Got some error on sell transaction`)

        return
    }

    logger.warn(`Sold ${buyTokenBalance} ${buySymbol}.`)

    logger.info(`sleeping for 30s`)
    await sleep(30000) // sleep for 15s / todo: make it nicer
    await getBalances()
    logger.warn(`Bought ${quoteTokenBalance} ${QUOTE_SYMBOL}. 1 ${buySymbol} = ${price} ${QUOTE_SYMBOL}`)
    await clearSavedPosition()
}

async function buy(price: number) {
    await getBalances()

    const amountWithDecimals = quoteTokenBalance * (10 ** quoteTokenDecimals)

    try {
        await buyToken(quoteAddress, BUY_TOKEN_ADDRESS, amountWithDecimals.toString(), logger)
    } catch (error: any) {
        if (error.err) {
            logger.error(`Got error on buy transaction: ${error.err.message}`)
        }

        logger.error(error, `Got some error on buy transaction`)
        return
    }

    if (activePosition) {
        logger.info('Previous active position found. Updating...')
    }

    logger.warn(`Sold ${quoteTokenBalance} ${QUOTE_SYMBOL}. For ${price} ${QUOTE_SYMBOL} per ${buySymbol}`)

    logger.info(`sleeping for 30s`)
    await sleep(30000) // sleep for 15s / todo: make it nicer
    await getBalances()

    logger.warn(`Bought ${buyTokenBalance} ${buySymbol}.`)


    activePosition = {
        buyPrice: activePosition ? (activePosition + price) / 2 : price,
        amount: buyTokenBalance,
        buySymbol: buySymbol,
        quoteSymbol: QUOTE_SYMBOL
    }
    await savePosition()
}

async function getAssetDataByAddress(address: string): Promise<any> {
    return await request(
        'https://data-api.cryptocompare.com/onchain/v1/data/by/address?chain_symbol=SOL' +
        '&address=' + address +
        '&api_key=' + CRYPTO_COMPARE_API_KEY,
        {})
}

async function getAssetDataByToken(token: string): Promise<any> {
    return await request(
        `https://price.jup.ag/v4/price?ids=${token}`,
        {})
}

async function getCandleData(): Promise<any> {
    return await request(
        'https://min-api.cryptocompare.com/data/v2/histominute?limit=50' +
        '&fsym=' + buySymbol +
        '&tsym=' + QUOTE_SYMBOL +
        '&aggregate=' + CANDLE_AGGREGATE_MINUTES,
        {
            method: 'GET',
            headers: {'authorization': CRYPTO_COMPARE_API_KEY},
        })
}

async function loadSavedPosition() {
    if (fs.existsSync(positionFilePath)) {
        const data = fs.readFileSync(positionFilePath, 'utf8')
        activePosition = JSON.parse(data)
        if (activePosition.buySymbol !== buySymbol || activePosition.quoteSymbol !== QUOTE_SYMBOL) {
            logger.warn(`Previously saved pair is ${activePosition.buySymbol}-${activePosition.quoteSymbol}. But now trading ${buySymbol}-${QUOTE_SYMBOL}. Clearing saved position...`)
            await clearSavedPosition()
        }
        logger.debug('Position loaded from file.')
    } else {
        logger.info('No previous position found. Starting fresh.')
    }
}

async function savePosition() {
    if (activePosition) {
        const data = JSON.stringify(activePosition)
        fs.writeFileSync(positionFilePath, data, 'utf8')
        logger.debug(activePosition, 'Position file saved')
    }
}

async function clearSavedPosition() {
    activePosition = null
    if (fs.existsSync(positionFilePath)) {
        fs.unlinkSync(positionFilePath)
        logger.debug('Position file was cleared.')
    }
}

async function getAssetsData() {
    const buyAssetData = await getAssetDataByAddress(BUY_TOKEN_ADDRESS)
    if (buyAssetData?.Err?.message) {
        throw new Error(buyAssetData.Err.message)
    }

    const buySymbol: string = buyAssetData?.Data?.SYMBOL

    const quoteAssetData = await getAssetDataByToken(QUOTE_SYMBOL)
    if (!Object.keys(quoteAssetData?.data?.[QUOTE_SYMBOL]).length) {
        throw new Error(`Token ${QUOTE_SYMBOL} is not found.`)
    }

    const quoteAddress: string = quoteAssetData?.data[QUOTE_SYMBOL]?.id

    return {buySymbol, quoteAddress}
}

async function getBalances() {
    try {
        logger.debug(`Getting balance amounts.`)
        solBalance = await getSolBalance()
        const buyTokenAmount = await getTokenAmountByAddress(BUY_TOKEN_ADDRESS, logger)
        const quoteTokenAmount = await getTokenAmountByAddress(quoteAddress, logger)

        buyTokenBalance = buyTokenAmount.amount / (10 ** buyTokenAmount.decimals)
        buyTokenDecimals = buyTokenAmount.decimals
        quoteTokenBalance = quoteTokenAmount.amount / (10 ** quoteTokenAmount.decimals)
        quoteTokenDecimals = quoteTokenAmount.decimals

        if (solBalance < 0.001) {
            logger.error('Insufficient SOL balance. 0.001 SOL required to work properly.')
            process.exit(1)
        }

        logger.info(`SOL Balance: ${solBalance} SOL`)
        logger.info(`Token balance: ${buyTokenBalance} ${buySymbol} and ${quoteTokenBalance} ${QUOTE_SYMBOL}`)
    } catch (error) {
        logger.error(error, 'Error occurred while getting wallet balances')
        process.exit(1)
    }
}

main();
