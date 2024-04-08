import {Wallet} from "@project-serum/anchor";
import {Keypair, Connection, PublicKey, LAMPORTS_PER_SOL, GetProgramAccountsFilter,} from "@solana/web3.js";
import {TOKEN_PROGRAM_ID} from "@solana/spl-token"
import bs58 from "bs58"
import {Metaplex} from "@metaplex-foundation/js";
import {ENV, TokenListProvider} from "@solana/spl-token-registry";

import {PRIVATE_KEY, RPC_ENDPOINT} from "../constants"
import pino from "pino";
import Logger = pino.Logger;

const connection = new Connection(RPC_ENDPOINT);

export const wallet = new Wallet(Keypair.fromSecretKey(bs58.decode(PRIVATE_KEY)));

export async function getSolBalance() {
    const publicKey = wallet.publicKey.toString()
    let balance = await connection.getBalance(new PublicKey(publicKey));
    return balance / LAMPORTS_PER_SOL
}

export async function getTokenAmountByAddress(mintAddress: string, logger: Logger) {
    const publicKey = wallet.publicKey.toString()

    const filters: GetProgramAccountsFilter[] = [
        {
            dataSize: 165,
        },
        {
            memcmp: {
                offset: 32,
                bytes: publicKey
            }
        },
        {
            memcmp: {
                offset: 0,
                bytes: mintAddress,
            }
        }
    ]

    const accounts = await connection.getParsedProgramAccounts(
        TOKEN_PROGRAM_ID,
        {filters: filters}
    )

    if (!accounts.length) {
        logger.debug(`Token not found on active account. Trying to get meta data from another sources.`)

        let tokenInfo
        try {
            tokenInfo = await getTokenMetadata(mintAddress)

            return {amount: 0, decimals: tokenInfo.decimals}
        } catch (error) {
            throw new Error(`Token account not found for address: ${mintAddress}`)
        }
    }

    const parsedAccountInfo: any = accounts[0]?.account?.data;
    const {amount, decimals} = parsedAccountInfo.parsed.info.tokenAmount

    return {amount, decimals}
}


async function getTokenMetadata(address: string) {
    const metaplex = Metaplex.make(connection);

    const mintAddress = new PublicKey(address);

    const metadataAccount = metaplex
        .nfts()
        .pdas()
        .metadata({mint: mintAddress});

    const metadataAccountInfo = await connection.getAccountInfo(metadataAccount);

    if (metadataAccountInfo) {
        const token = await metaplex.nfts().findByMint({mintAddress: mintAddress});
        return token.mint
    } else {
        const provider = await new TokenListProvider().resolve();
        const tokenList = provider.filterByChainId(ENV.MainnetBeta).getList();
        const tokenMap = tokenList.reduce((map, item) => {
            map.set(item.address, item);
            return map;
        }, new Map());

        const token = tokenMap.get(mintAddress.toBase58());

        return token.mint
    }
}
