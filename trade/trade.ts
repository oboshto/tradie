import {Connection, PublicKey, VersionedTransaction} from "@solana/web3.js";
import {RPC_ENDPOINT, SLIPPAGE_PERCENT} from "../constants";
import fetch from "cross-fetch";
import {wallet} from "../wallet";
import pino from "pino";
import Logger = pino.Logger;

const referralKey: string = 'J1igXZJiJjsBWKLGPna9egHFYZjW5dPDGv7ajPDqp4Pv'
const platformFeePercent = 0.2

const connection = new Connection(RPC_ENDPOINT)

const feeAccounts = [
    'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    'So11111111111111111111111111111111111111112',
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
]

export const buyToken = async (mintIn: string, mintOut: string, amount: string, logger: Logger) => {
    logger.debug(`[buyToken call] with: mintIn: ${mintIn}, mintOut: ${mintOut}, amount: ${amount}`)

    let feeAccount = null
    if (feeAccounts.includes(mintOut)) {
        logger.debug('fee account found!');
        [feeAccount] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("referral_ata"),
                new PublicKey(referralKey).toBuffer(),
                new PublicKey(mintOut).toBuffer(),
            ],
            new PublicKey("REFER4ZgmyYx9c6He5XfaTMiGfdLwRnkV4RPp9t9iF3")
        )
    } else {
        logger.debug('fee account is not found')
    }


    const quoteResponse = await (
        await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=${mintIn}\
&outputMint=${mintOut}\
&amount=${amount}\
&slippageBps=${SLIPPAGE_PERCENT * 100}\
&platformFeeBps=${platformFeePercent * 100}`
        )
    ).json();

    const {swapTransaction} = await (
        await fetch('https://quote-api.jup.ag/v6/swap', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                quoteResponse,
                userPublicKey: wallet.publicKey.toString(),
                wrapAndUnwrapSol: true,
                feeAccount,
                dynamicComputeUnitLimit: true,
                prioritizationFeeLamports: 'auto' // todo: make it customizable (5000000)
            })
        })
    ).json()

    const swapTransactionBuf = Buffer.from(swapTransaction, 'base64')
    const transaction = VersionedTransaction.deserialize(swapTransactionBuf)

    transaction.sign([wallet.payer])

    const latestBlockhash = await connection.getLatestBlockhash({
        commitment: 'finalized',
    });

    const signature = await connection.sendRawTransaction(transaction.serialize(), {
        preflightCommitment: 'processed',
        maxRetries: 15
    })

    logger.info(`Sent buy tx with signature: ${signature}.`)

    const confirmation = await connection.confirmTransaction(
        {
            signature,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
            blockhash: latestBlockhash.blockhash,
        },
        'processed',
    );

    if (confirmation.value.err) {
        logger.debug(confirmation.value.err);
        throw new Error(`Error confirming buy tx: ${confirmation.value.err}`)
    }

    logger.debug(`Buy transaction completed.`);
    logger.info(`Confirmed buy tx: https://solscan.io/tx/${signature}?cluster=mainnet-beta`);
}

