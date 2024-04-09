import dotenv from 'dotenv';
import {logger} from "../utils";

dotenv.config();

export const PRIVATE_KEY = retrieveEnvVariable('PRIVATE_KEY')
export const CRYPTO_COMPARE_API_KEY = retrieveEnvVariable('CRYPTO_COMPARE_API_KEY')
export const RPC_ENDPOINT = retrieveEnvVariable('RPC_ENDPOINT')
export const CANDLE_AGGREGATE_MINUTES = retrieveEnvVariable('CANDLE_AGGREGATE_MINUTES')
export const GET_MARKET_DATA_INTERVAL_SECONDS = Number(retrieveEnvVariable('GET_MARKET_DATA_INTERVAL_SECONDS'))
export const BUY_TOKEN_ADDRESS = retrieveEnvVariable('BUY_TOKEN_ADDRESS')
export const QUOTE_SYMBOL = retrieveEnvVariable('QUOTE_SYMBOL')
export const SLIPPAGE_PERCENT = Number(retrieveEnvVariable('SLIPPAGE_PERCENT'))
export const STOP_LOSS = Number(retrieveEnvVariable('STOP_LOSS'))
export const TAKE_PROFIT = Number(retrieveEnvVariable('TAKE_PROFIT'))
export const RSI_TO_BUY = Number(retrieveEnvVariable('RSI_TO_BUY'))
export const RSI_TO_SELL = Number(retrieveEnvVariable('RSI_TO_SELL'))
export const LOG_LEVEL = retrieveEnvVariable('LOG_LEVEL')

const transactionPriorityFee = Number(retrieveEnvVariable('TRANSACTION_PRIORITY_FEE'))
export const TRANSACTION_PRIORITY_FEE: 'auto' | number = isNaN(transactionPriorityFee) ? 'auto' : transactionPriorityFee // 'auto' or SOL value like 0.004


function retrieveEnvVariable(variableName: string) {
    const variable = process.env[variableName] || '';
    if (!variable) {
        logger.error(`${variableName} is not set`);
        process.exit(1);
    }
    return variable;
}
