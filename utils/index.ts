export * from './logger'

export const request = async function request<TResponse>(
    url: string,
    config: RequestInit
): Promise<TResponse> {
    const response = await fetch(url, config);
    return await response.json();
}

export const sleep = (ms:number) => new Promise(res => setTimeout(res, ms));

