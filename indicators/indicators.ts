import {BollingerBands, EMA, RSI} from "@debut/indicators";

export const getRSI = (dataFrame: any[]) => {
    const dataLength = dataFrame.length
    let resultRSI!:number
    const rsi = new RSI(14)

    dataFrame.forEach((point: { close: number; }, index: number) => {
        rsi.nextValue(point?.close)

        if (index === dataLength - 1) {
            resultRSI = rsi.momentValue(point?.close)
        }
    })

    return resultRSI
}

export const getBB = (dataFrame: any[]) => {
    const dataLength = dataFrame.length
    let resultBB!:{lower:number, middle:number, upper:number}
    const bb = new BollingerBands(14)

    dataFrame.forEach((point: { close: number; }, index: number) => {
        bb.nextValue(point?.close)

        if (index === dataLength - 1) {
            resultBB = bb.momentValue(point?.close)
        }
    })

    return resultBB
}

export const getEMA = (dataFrame: any[], period = 14) => {
    const dataLength = dataFrame.length
    let resultEMA!:number
    const ema = new EMA(period)

    dataFrame.forEach((point: { close: number; }, index: number) => {
        ema.nextValue(point?.close)

        if (index === dataLength - 1) {
            resultEMA = ema.momentValue(point?.close)
        }
    })

    return resultEMA
}
