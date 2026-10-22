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
        // VIDAA's native video plane may not scale correctly when hosted in a
        // nested iframe. The xBridge TV parent and this player share the same
        // origin, so attach the REAL media element to the top-level document.
        // Xbox WebRTC, input, and account authentication stay inside the player.
        let host:HTMLElement|null = null
        let renderDocument:Document = document
        let topLevel = false
        try {
            if (window.parent !== window && window.parent.location.origin === window.location.origin) {
                const candidate = window.parent.document.getElementById('xbridge-top-video')
                if (candidate) {
                    host = candidate
                    renderDocument = window.parent.document
                    topLevel = true
                }
            }
        } catch (_) {
            // Ordinary standalone player remains supported.
        }
        const videoElement = renderDocument.createElement('video')
        videoElement.srcObject = stream
        videoElement.autoplay = true
        videoElement.muted = true
        videoElement.playsInline = true
        videoElement.style.width = '100%'
        videoElement.style.height = '100%'
        videoElement.style.objectFit = 'contain'
        videoElement.style.backgroundColor = 'black'
        videoElement.style.touchAction = 'none'

        const element = host || document.getElementById(this._player.getElementId())
        if(element === null) {return}
        if(topLevel) {
            // No second decoder instance, no copied frames/canvas (which would
            // burden an old ARM TV). Stream is attached once to the parent.
            element.replaceChildren()
            videoElement.setAttribute('data-xbridge-top-video','1')
            videoElement.style.pointerEvents = 'none'
        }

        this._element = videoElement
        // Avoid rendering a small inline video while awaiting autoplay.
        // The parent xBridge expands the iframe as soon as the first real frame
        // is present. A synthetic WebRTC offer is not sufficient evidence.
        let expanded = false
        const notifyVideoReady = () => {
            if (expanded) return
            expanded = true
            // VIDAA's Chromium sometimes keeps the video at its intrinsic
            // decoded frame size despite percentage CSS on an iframe child.
            // Force the actual video element and its host to the viewport,
            // not just the React iframe (which was already full-screen).
            const force = (el:HTMLElement, key:string, value:string) =>
                el.style.setProperty(key,value,'important')
            // The parent host lives inside the xBridge full-screen section;
            // when a decoded frame arrives, the parent expands the section.
            // Do not detach the host from that section or its overlay controls.
            force(element,'position',topLevel?'absolute':'fixed')
            force(element,'inset','0')
            force(element,'width',topLevel?'100%':'100vw')
            force(element,'height',topLevel?'100%':'100vh')
            force(element,'overflow','hidden')
            force(element,'background','#000')
            force(videoElement,'display','block')
            force(videoElement,'position','absolute')
            force(videoElement,'inset','0')
            force(videoElement,'width','100%')
            force(videoElement,'height','100%')
            force(videoElement,'max-height','none')
            force(videoElement,'max-width','none')
            force(videoElement,'object-fit','contain')
            force(videoElement,'object-position','center center')
            document.body.classList.add('stream-playing')
            try {
                if (window.parent !== window && location.origin === window.parent.location.origin) {
                    window.parent.postMessage({type:'xbridge-playing',playing:true}, location.origin)
                }
            } catch (_) {}
        }
        videoElement.addEventListener('loadeddata', notifyVideoReady, {once:true})
        videoElement.addEventListener('playing', notifyVideoReady, {once:true})
        videoElement.addEventListener('resize', () => {
            // Tell the parent the decoded stream dimensions, without exposing
            // private session information.
            try {
                if (window.parent !== window && window.parent.location.origin === location.origin) {
                    window.parent.postMessage({
                        type:'xbridge-video-size',
                        width:videoElement.videoWidth,
                        height:videoElement.videoHeight,
                        viewportWidth:window.innerWidth,
                        viewportHeight:window.innerHeight
                    }, location.origin)
                }
            } catch (_) {}
        })
        element.appendChild(this._element)
        if(topLevel) {
            try {
                window.parent.postMessage({type:'xbridge-video-attached',topLevel:true},location.origin)
            } catch (_) {}
        }
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
        if(this._overlay !== undefined){
            this._overlay.destroy()
        }
        // The video can belong to the parent document. Always use our element
        // reference rather than querying only the child iframe.
        if(this._element){
            this._element.pause()
            this._element.srcObject = null
            this._element.remove()
            this._element = undefined
        }
    }
}