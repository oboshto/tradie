import pino from "pino";

const transport = pino.transport({
    target: 'pino-pretty',
});

export const logger = pino(
    {
        level: 'info',
        serializers: {
            error: pino.stdSerializers.err,
        },
        base: undefined,
    },
    transport,
);
