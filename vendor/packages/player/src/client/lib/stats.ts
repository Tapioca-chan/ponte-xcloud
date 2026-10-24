import xCloudPlayer from '../player'

export default class Stats {
    private _player: xCloudPlayer
    private _peerConnection:RTCPeerConnection

    _videoCodec:string = ''
    _audioCodec:string = ''

    _videoWidth:number = 0
    _videoHeight:number = 0
    _videoFps:number = 0
    _rtt:number = 0.0

    _remoteHost:string = ''
    _remotePort:number = 0
    _remoteIsLocal = false
    _remoteIsIpv6 = false
    _activeRemoteCandidate:string = ''

    private _timer: ReturnType<typeof setInterval> | null = null
    private _destroyed = false
    private _polling = false

    constructor(player:xCloudPlayer) {
        this._player = player
        this._peerConnection = player._peerConnection
        this._timer = setInterval(() => { void this.loop() }, 1000)
    }

    // A TV can create/destroy many media sessions. The old stats monitor
    // continued to call getStats() every second on EACH closed connection,
    // accumulating retained connections and asynchronous decoder/RTC work.
    destroy(){
        this._destroyed = true
        if(this._timer !== null){
            clearInterval(this._timer)
            this._timer = null
        }
    }

    async loop(){
        if(this._destroyed || this._polling ||
           this._peerConnection.signalingState === 'closed')return
        this._polling = true
        try{
            const stats = await this._peerConnection.getStats()
            if(this._destroyed)return
            stats.forEach((report) => {
                if(report.type === 'inbound-rtp'){
                    this.readInboundRtp(report)
                } else if(report.type === 'candidate-pair' &&
                    report.packetsReceived !== undefined && report.packetsReceived > 0){
                    this.readCandidatePair(report)
                } else if(report.type === 'remote-candidate'){
                    this.readRemoteCandidate(report)
                }
            })
        }catch(_){
            // Some VIDAA builds reject getStats during ICE teardown.
            // Never leave unhandled rejections or start an overlapping poll.
        }finally{
            this._polling = false
        }
    }

    readInboundRtp(report:RTCInboundRtpStreamStats){
        if(report.kind === 'video' && report.codecId && report.packetsReceived !== undefined && report.packetsReceived > 0){

            if(report.codecId.includes('profile-level-id=4d')){
                this._videoCodec = 'H264 (High)'

            } else if(report.codecId.includes('profile-level-id=42e')) {
                this._videoCodec = 'H264 (Normal)'

            } else if(report.codecId.includes('profile-level-id=420')) {
                this._videoCodec = 'H264 (Low)'

            } else {
                this._videoCodec = 'Other ('+report.codecId+')'
            }

            if(report.frameWidth){ this._videoWidth = report.frameWidth }
            if(report.frameHeight){ this._videoHeight = report.frameHeight }
            if(report.framesPerSecond){ this._videoFps = report.framesPerSecond }
            // report.jitter

        } else if(report.kind === 'audio' && report.codecId && report.packetsReceived !== undefined && report.packetsReceived > 0){
            this._audioCodec = report.codecId

            // report.jitter
        }
    }

    readCandidatePair(report){
        this._activeRemoteCandidate = report.remoteCandidateId
        this._rtt = report.currentRoundTripTime
    }

    readRemoteCandidate(report){
        if(report.id !== this._activeRemoteCandidate) {return}

        if(this.isPrivateIP(report.address)){
            this._remoteIsLocal = true
        } else {
            this._remoteIsLocal = false
        }

        if(this.isIpv6(report.address)){
            this._remoteIsIpv6 = true
        } else {
            this._remoteIsIpv6 = false
        }

        this._remoteHost = report.address
        this._remotePort = report.port
    }

    isPrivateIP(ip) {
        const parts = ip.split('.')
        return parts[0] === '10' || (parts[0] === '172' && (parseInt(parts[1], 10) >= 16 && parseInt(parts[1], 10) <= 31)) || (parts[0] === '192' && parts[1] === '168')
    }

    isIpv6(ip) {
        const parts = ip.split(':')
        return parts.length > 3 ? true : false
    }
}