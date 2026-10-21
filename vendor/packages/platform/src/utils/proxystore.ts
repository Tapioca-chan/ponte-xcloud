import { TokenStore } from 'xal-node'
import UserToken from 'xal-node/dist/lib/tokens/usertoken.js'
import { IUserToken } from 'xal-node/dist/lib/tokens/usertoken.js' 
export default class ProxyStore extends TokenStore {

    constructor(token?: IUserToken) {
        super()
        
        if(token !== undefined)
            this._userToken = new ((UserToken as any).default || UserToken)(token)
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