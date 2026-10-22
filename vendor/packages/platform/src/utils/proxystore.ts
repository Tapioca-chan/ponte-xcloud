import { TokenStore } from 'xal-node'
import UserToken from 'xal-node/dist/lib/tokens/usertoken.js'
import { IUserToken } from 'xal-node/dist/lib/tokens/usertoken.js' 
export default class ProxyStore extends TokenStore {

    constructor(token?: IUserToken) {
        super()
        
        if(token !== undefined) {
            // The raw MSAL device-code JSON has expires_in but no expires_on.
            // Without a deadline, xal-node assumes expired and refreshes again
            // while fetching xCloud streaming tokens, rotating refresh_token
            // behind the caller's back. Keep the expiry after every restore.
            const validity=Number(token.expires_in)
            const expiresOn=typeof token.expires_on==='string' && !Number.isNaN(Date.parse(token.expires_on))
                ? token.expires_on
                : Number.isFinite(validity) && validity>0
                    ? new Date(Date.now()+validity*1000).toISOString()
                    : undefined
            const data={...token,...(expiresOn?{expires_on:expiresOn}:{})}
            this._userToken = new ((UserToken as any).default || UserToken)(data)
        }
    }
 
    load() {
        // @TODO: Load data and pass JSON data as string into loadJson()
        // const tokens = this._store.get('authentication.tokens', '{}') as string
        // this.loadJson(tokens)
 
        return true
    }
 
    save() {
        // const tokens = JSON.stringify({
        //     userToken: this._userToken?.data,
        //     sisuToken: this._sisuToken?.data,
        //     jwtKeys: this._jwtKeys,
        // })
 
        // this._store.set('authentication.tokens', tokens)
        // @TODO: Save the token data in your store
    }
 
    clear() {
        this._userToken = undefined
        this._sisuToken = undefined
        this._jwtKeys = undefined
 
        // @TODO: Remove actual data from your store
    }

    removeAll() {
        this._userToken = undefined
        this._sisuToken = undefined
        this._jwtKeys = undefined
    }
 
    // You can also add new functions to the TokenStore to make it easier to interact with the tokens.
    // hasUserTokens() {
    //     return this._userToken !== undefined && this._sisuToken !== undefined
    // }
}