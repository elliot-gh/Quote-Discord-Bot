export type QuoteConfig = {
    mongoDb: {
        url: string,
        name: string,
        user: string,
        password: string
    },
    getNoPrefix: boolean,
    caseSensitive: boolean
}
