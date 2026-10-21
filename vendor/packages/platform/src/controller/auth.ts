import { Msal } from 'xal-node'
import ProxyStore from '../utils/proxystore.js'
import { IUserToken } from 'xal-node/dist/lib/tokens/usertoken.js'

export default class authController {

    async startMsalAuth() {
        const tokenStore = new ProxyStore();
        const msal = new Msal(tokenStore)
        return await msal.doDeviceCodeAuth()
    }

    async verifyDeviceCode(devicecode:string, timeout?:number) {
        const tokenStore = new ProxyStore();
        const msal = new Msal(tokenStore)
        return await msal.doPollForDeviceCodeAuth(devicecode, timeout)
    }

    async refreshUserToken(token:IUserToken) {
        const tokenStore = new ProxyStore(token);
        const msal = new Msal(tokenStore)
        return await msal.refreshUserToken()
    }

    async getStreamingTokens(token:IUserToken) {
        const tokenStore = new ProxyStore(token);
        const msal = new Msal(tokenStore)

        const gssvToken = await msal.getGssvToken()

        if(gssvToken === undefined){
            throw new Error('No gssv token found. Please authenticate first.')
        }

        const _xhomeToken = await msal.getStreamToken(gssvToken.data.Token, 'xhome')

        let _xcloudToken:typeof _xhomeToken|undefined
        try {
            _xcloudToken = await msal.getStreamToken(gssvToken.data.Token, 'xgpuweb')
        } catch(error){
            try {
                _xcloudToken = await msal.getStreamToken(gssvToken.data.Token, 'xgpuwebf2p')
            }
            catch(error){
                console.log('Failed to retrieve xCloud token. (Also F2P. Cloud gaming down?)')
            }
        }

        return { xHomeToken: _xhomeToken, xCloudToken: _xcloudToken }
    }

    async getWebToken(token:IUserToken) {
        const tokenStore = new ProxyStore(token);
        const msal = new Msal(tokenStore)
        return await msal.getWebToken()
    }
}