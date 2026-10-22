import xCloudPlayer from '../player'
import Overlay from './overlay'

export default class VideoComponent {
    private _player:xCloudPlayer

    private _element:HTMLVideoElement | undefined
    private _overlay:Overlay

    constructor(player:any){
        this._player = player
        this._overlay = new Overlay(this, this._player)
    }

    create(stream:MediaStream) {
        const videoElement = document.createElement('video')
        videoElement.srcObject = stream
        videoElement.autoplay = true
        videoElement.muted = true
        videoElement.playsInline = true
        videoElement.style.width = '100%'
        videoElement.style.height = '100%'
        videoElement.style.objectFit = 'contain'
        videoElement.style.backgroundColor = 'black'
        videoElement.style.touchAction = 'none'

        const element = document.getElementById(this._player.getElementId())
        if(element === null) {return}

        this._element = videoElement
        // Avoid rendering a small inline video while awaiting autoplay.
        // The parent xBridge expands the iframe as soon as the first real frame
        // is present. A synthetic WebRTC offer is not sufficient evidence.
        let expanded = false
        const notifyVideoReady = () => {
            if (expanded) return
            expanded = true
            document.body.classList.add('stream-playing')
            try {
                if (window.parent !== window && location.origin === window.parent.location.origin) {
                    window.parent.postMessage({type:'xbridge-playing',playing:true}, location.origin)
                }
            } catch (_) {}
        }
        videoElement.addEventListener('loadeddata', notifyVideoReady, {once:true})
        videoElement.addEventListener('playing', notifyVideoReady, {once:true})
        element.appendChild(this._element)
        // VIDAA may block autoplay despite muted inline video; the user can
        // explicitly activate media in settings if the promise is rejected.
        void videoElement.play().catch(() => {})
        const isStatic = getComputedStyle(element).position === 'static' ? true : false
        if(isStatic === true){
            element.style.position = 'relative'
        }

        this._element.requestVideoFrameCallback?.(this.processVideoMetadata.bind(this))
    }

    processVideoMetadata(timestamp, data:VideoFrameCallbackMetadata) {
        if(this._element === undefined) {return}

        this._element.requestVideoFrameCallback?.(this.processVideoMetadata.bind(this))

        this._player._channels.input.queueMetadataFrame({
            serverDataKey: data.rtpTimestamp as number,
            firstFramePacketArrivalTimeMs: data.receiveTime as number,
            frameSubmittedTimeMs: data.receiveTime as number,
            frameDecodedTimeMs: data.expectedDisplayTime,
            frameRenderedTimeMs: data.expectedDisplayTime,
        })
    }

    getElement(){
        return this._element
    }

    toggleDebugOverlay(){
        this._overlay.toggleDebug()
    }

    destroy(){
        const streamHolder = document.getElementById(this._player.getElementId())
        const element = streamHolder?.querySelector('video')

        if(this._overlay !== undefined){
            this._overlay.destroy()
        }

        if(element){
            element.remove()
        }
    }
}