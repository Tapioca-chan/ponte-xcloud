import type { xStreamToken, xCloudStreamConfig, SDPResponse, startStreamResponse, StatusResponse, ErrorResponse } from '../types/index';
export type { xStreamToken, startStreamResponse, SDPResponse, xCloudStreamConfig, StatusResponse, ErrorResponse };

export const ping = () => 'pong';

export const startStream = async (xStreamToken:xStreamToken, xCloudStreamConfig:xCloudStreamConfig) => {
    return await httpPost<startStreamResponse>(xStreamToken, xCloudStreamConfig, '/v5/sessions/'+xCloudStreamConfig.type+'/play', JSON.stringify({
        clientSessionId: '',
        titleId: (xCloudStreamConfig.type === 'cloud') ? xCloudStreamConfig.id : '',
        systemUpdateGroup: '',
        settings: {
            nanoVersion: 'V3;WebrtcTransport.dll',
            enableOptionalDataCollection: false,
            enableTextToSpeech: false,
            highContrast: 0,
            locale: xCloudStreamConfig.language,
            useIceConnection: false,
            timezoneOffsetMinutes: 120,
            sdkType: 'web',
            osName: 'windows',
        },
        serverId: (xCloudStreamConfig.type === 'home') ? xCloudStreamConfig.id : '',
        fallbackRegionNames: [],
    }))
}

export const getStreamStatus = async (xStreamToken:xStreamToken, xCloudStreamConfig:xCloudStreamConfig, sessionPath:string) => {
    return await httpGet<startStreamResponse>(xStreamToken, xCloudStreamConfig, '/'+sessionPath+'/state')
}

export const sendSDPOffer = async (xStreamToken:xStreamToken, xCloudStreamConfig:xCloudStreamConfig, sessionPath:string, sdpOffer:RTCSessionDescriptionInit) => {
    await httpPost<StatusResponse>(xStreamToken, xCloudStreamConfig, '/'+sessionPath+'/sdp', JSON.stringify({
        'messageType':'offer',
        'sdp': sdpOffer.sdp,
        'requestId': '1',
        'configuration':{
            'chatConfiguration':{
                'bytesPerSample':2,
                'expectedClipDurationMs':20,
                'format':{
                    'codec':'opus',
                    'container':'webm',
                },
                'numChannels':1,
                'sampleFrequencyHz':24000,
            },
            'chat':{
                'minVersion':1,
                'maxVersion':1,
            },
            'control':{
                'minVersion':1,
                'maxVersion':3,
            },
            'input':{
                'minVersion':1,
                'maxVersion':9,
            },
            'message':{
                'minVersion':1,
                'maxVersion':1,
            },
            'reliableinput':{
                'minVersion':9,
                'maxVersion':9,
            },
            'unreliableinput':{
                'minVersion':9,
                'maxVersion':9,
            },
        },
    }))

    // @TODO: Await for 200 status?
    let sdpResponse = await httpGet<SDPResponse>(xStreamToken, xCloudStreamConfig, '/'+sessionPath+'/sdp')
    for(let i=0;sdpResponse.status===204&&i<30;i++){
        await new Promise(resolve=>setTimeout(resolve,1000));
        sdpResponse=await httpGet<SDPResponse>(xStreamToken,xCloudStreamConfig,'/'+sessionPath+'/sdp');
    }
    if(!sdpResponse.exchangeResponse)throw new Error('SDP timeout');
    return sdpResponse
}

export const sendICECandidates = async (xStreamToken:xStreamToken, xCloudStreamConfig:xCloudStreamConfig, sessionPath:string, candidates:Array<any>) => {
    await httpPost<StatusResponse>(xStreamToken, xCloudStreamConfig, '/'+sessionPath+'/ice', JSON.stringify({
        candidates: candidates
    }))

    let iceResponse = await httpGet<any>(xStreamToken, xCloudStreamConfig, '/'+sessionPath+'/ice')
    let attempts = 0;
    while(iceResponse.status && iceResponse.status === 204){
        if(++attempts>30)throw new Error("ICE timeout");
        await new Promise(resolve=>setTimeout(resolve,1000));
        iceResponse = await httpGet<any>(xStreamToken, xCloudStreamConfig, '/'+sessionPath+'/ice')
    }
    return iceResponse
}

export const sendMsalToken = async (xStreamToken:xStreamToken, xCloudStreamConfig:xCloudStreamConfig, sessionPath:string, userRefreshToken:string) => {
    // Fetch token server sided
    const tokenData = await fetch('https://login.live.com/oauth20_token.srf', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: '1f907974-e22b-4810-a9de-d9647380c97e',
        scope: 'service::http://Passport.NET/purpose::PURPOSE_XBOX_CLOUD_CONSOLE_TRANSFER_TOKEN',
        grant_type: 'refresh_token',
        refresh_token: userRefreshToken,
      }),
    })
    const token = await tokenData.json();

    return await httpPost<StatusResponse>(xStreamToken, xCloudStreamConfig, '/'+sessionPath+'/connect', JSON.stringify({
        userToken: token.access_token
    }))
}

export const sendKeepalive = async (xStreamToken:xStreamToken, xCloudStreamConfig:xCloudStreamConfig, sessionPath:string) => {
    return await httpPost<StatusResponse>(xStreamToken, xCloudStreamConfig, '/'+sessionPath+'/keepalive', JSON.stringify({}))
}

const request = async (method:string, token:xStreamToken, config:xCloudStreamConfig, url:string, body?:string, headers = {}) => {
    const response = await fetch(config.host+url, { method, headers: {
        'Accept':'application/json', 'Content-Type':'application/json',
        'X-Gssv-Client':'XboxComBrowser', 'X-MS-Device-Info':getDeviceInfo(config),
        ...(token.token ? {'Authorization':'Bearer '+token.token}:{}), ...headers
    }, body, signal:AbortSignal.timeout(20000) });
    if(!response.ok) throw new Error('Streaming HTTP '+response.status);
    const text=await response.text();return text ? JSON.parse(text):{status:response.status};
};
const httpGet = <T>(t:xStreamToken,c:xCloudStreamConfig,u:string,h={}) => request('GET',t,c,u,undefined,h);
const httpPost = <T>(t:xStreamToken,c:xCloudStreamConfig,u:string,b:string,h={}) => request('POST',t,c,u,b,h);

const getDeviceInfo = (xCloudStreamConfig:xCloudStreamConfig) => {
    return JSON.stringify({
        'appInfo': {
            'env': {
                'clientAppId':'www.xbox.com',
                'clientAppType':'browser',
                'clientAppVersion':'21.1.98',
                'clientSdkVersion':'8.5.3',
                'httpEnvironment':'prod',
                'sdkInstallId':'',
            },
        },
        'dev': {
            'hw': {
                'make': 'Microsoft',
                'model': 'unknown',
                'sdktype': 'web',
            },
            'os': {
                'name': (xCloudStreamConfig.resolution === 1080) ? 'windows' : 'android',
                'ver': '22631.2715',
                'platform': 'desktop',
            },
            'displayInfo': {
                'dimensions': {
                    'widthInPixels': 1920,
                    'heightInPixels': 1080,
                },
                'pixelDensity': {
                    'dpiX': 2,
                    'dpiY': 2,
                },
            },
            'browser':{
                'browserName':'chrome',
                'browserVersion':'119.0',
            },
        },
    })
}