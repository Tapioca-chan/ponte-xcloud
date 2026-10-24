import xCloudPlayer from '../player'
import Overlay from './overlay'

export default class VideoComponent {
    private _player:xCloudPlayer

    private _element:HTMLVideoElement | undefined
    private _overlay:Overlay
    private _frameLoopGeneration=0
    private _surfaceRebuildBusy=false

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
        const iframeNativeMode=(this._player as any).__xbridgeVideoHostMode==='iframe'
            && window.parent!==window
        try {
            if (!iframeNativeMode && window.parent !== window && window.parent.location.origin === window.location.origin) {
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
        // Prepare compatible games' native VIDAA video plane BEFORE setting srcObject.
        // Initial media attachment can allocate the hardware/software plane
        // at whatever layout size is present on the first frame. Late physical
        // resizing after the xCloud preroll can leave a stale visible plane.
        // This never detaches a frame or modifies Microsoft/Xbox handshakes.
        // Diagnostic native mode: RTCPeerConnection and HTMLVideoElement live
        // in the SAME document. Unlike parent-hoisted mode it does not pass
        // a MediaStream between VIDAA browser document/compositor contexts.
        const nativePlanePreflight = (topLevel||iframeNativeMode) &&
            Boolean((this._player as any).__xbridgePreallocateVideaSurface)
        if(!nativePlanePreflight) videoElement.srcObject = stream
        videoElement.autoplay = true
        videoElement.muted = true
        videoElement.playsInline = true
        videoElement.setAttribute('playsinline','')
        videoElement.setAttribute('webkit-playsinline','')
        videoElement.style.width = '100%'
        videoElement.style.height = '100%'
        videoElement.style.objectFit = 'contain'
        videoElement.style.backgroundColor = 'black'
        videoElement.style.touchAction = 'none'
        if(nativePlanePreflight) {
            // Match the parent's already working VIDAA physical-plane mode
            // before its native decoder ever sees the WebRTC MediaStream.
            try {
                const root=window.parent
                const viewportW=Math.max(1,root.innerWidth)
                const viewportH=Math.max(1,root.innerHeight)
                const screenW=Number(root.screen?.width)||viewportW
                const screenH=Number(root.screen?.height)||viewportH
                const scaleMode=root.localStorage.getItem('xbridge:video-plane-scale')||'physical'
                const physical=topLevel&&scaleMode==='physical'&&screenW/viewportW>1.05&&screenH/viewportH>1.05
                videoElement.style.setProperty('display','block','important')
                videoElement.style.setProperty('position','absolute','important')
                videoElement.style.setProperty('top','0','important')
                videoElement.style.setProperty('left','0','important')
                videoElement.style.setProperty('width',physical?Math.round(screenW)+'px':'100%','important')
                videoElement.style.setProperty('height',physical?Math.round(screenH)+'px':'100%','important')
                videoElement.style.setProperty('max-width','none','important')
                videoElement.style.setProperty('max-height','none','important')
                videoElement.style.setProperty('object-fit','contain','important')
                videoElement.style.setProperty('object-position',iframeNativeMode?'center center':'left top','important')
            } catch (_) {}
        }
        // Presentation counter is updated by the browser's compositor callback,
        // not by RTP decode statistics. No DOM repaint is needed per frame.
        ;(videoElement as HTMLVideoElement & {__xbridgePresentedFrames?:number}).__xbridgePresentedFrames=0

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
            // All TV titles preallocate the native surface at its final
            // geometry BEFORE srcObject. An old VIDAA can freeze its hardware
            // overlay if CSS/layout is changed during the very first frame.
            // Do not write position, size, transform or overflow on either
            // native parent host or video on loadeddata/playing: a successful
            // play() does not prove the physical overlay is drawing.
            // Standalone non-embedded player retains its legacy layout.
            if(!nativePlanePreflight){
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
                force(videoElement,'object-position','center center')
                force(videoElement,'max-height','none')
                force(videoElement,'max-width','none')
                force(videoElement,'object-fit','contain')
            }
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
        if(nativePlanePreflight){
            // Parent element and full-size CSS are now ready; only *now*
            // create the stream-to-native-decoder binding on older VIDAA.
            this._element.srcObject=stream
            try {
                window.parent.postMessage({type:'xbridge-video-prepared',
                    topLevel:true,prebound:true},location.origin)
            } catch (_) {}
        }
        // CSS pixels and the native video decoder can use different viewports
        // on VIDAA. Report geometry after the React parent expands the section,
        // to distinguish a small DOM box from an unscaled native video plane.
        const reportGeometry = () => {
            try {
                const rootWindow = topLevel ? window.parent : window
                const bounds = videoElement.getBoundingClientRect()
                const hostBounds = element.getBoundingClientRect()
                if (window.parent !== window && window.parent.location.origin === location.origin) {
                    window.parent.postMessage({
                        type:'xbridge-video-geometry',
                        topLevel,
                        viewportW:Math.round(rootWindow.innerWidth),
                        viewportH:Math.round(rootWindow.innerHeight),
                        screenW:Math.round(rootWindow.screen?.width || 0),
                        screenH:Math.round(rootWindow.screen?.height || 0),
                        frameW:Math.round(window.innerWidth),
                        frameH:Math.round(window.innerHeight),
                        videoW:Math.round(bounds.width),
                        videoH:Math.round(bounds.height),
                        hostW:Math.round(hostBounds.width),
                        hostH:Math.round(hostBounds.height)
                    }, location.origin)
                }
            } catch (_) {}
        }
        videoElement.addEventListener('loadeddata', () => {
            setTimeout(reportGeometry, 650)
        }, {once:true})
        if(topLevel || iframeNativeMode) {
            try {
                window.parent.postMessage({type:'xbridge-video-attached',
                    topLevel,renderPath:iframeNativeMode?'iframe':'parent'},location.origin)
            } catch (_) {}
        }
        // VIDAA may block autoplay despite muted inline video; the user can
        // explicitly activate media in settings if the promise is rejected.
        void videoElement.play().catch(() => {})
        const isStatic = getComputedStyle(element).position === 'static' ? true : false
        if(isStatic === true){
            element.style.position = 'relative'
        }

        this.beginFrameMetadataLoop(videoElement)
    }

    private beginFrameMetadataLoop(video:HTMLVideoElement){
        const generation=++this._frameLoopGeneration
        video.requestVideoFrameCallback?.((timestamp,data)=>this.processVideoMetadata(timestamp,data,video,generation))
    }

    processVideoMetadata(timestamp:number, data:VideoFrameCallbackMetadata,
      video:HTMLVideoElement, generation:number) {
        // A callback on the detached VIDAA surface must not keep producing
        // frame metadata or register duplicate callbacks on the new element.
        if(this._element!==video || generation!==this._frameLoopGeneration)return
        const tracked=video as HTMLVideoElement & {__xbridgePresentedFrames?:number}
        tracked.__xbridgePresentedFrames=(tracked.__xbridgePresentedFrames||0)+1
        video.requestVideoFrameCallback?.((time,meta)=>this.processVideoMetadata(time,meta,video,generation))

        this._player._channels.input.queueMetadataFrame({
            serverDataKey: data.rtpTimestamp as number,
            firstFramePacketArrivalTimeMs: data.receiveTime as number,
            frameSubmittedTimeMs: data.receiveTime as number,
            frameDecodedTimeMs: data.expectedDisplayTime,
            frameRenderedTimeMs: data.expectedDisplayTime,
        })
    }

    // VIDAA-only, user-triggered native video plane rebuild. The old video
    // HTMLElement is discarded, but Xbox's RTCPeerConnection, tracks, input,
    // audio element and authenticated session stay intact. This is distinct
    // from reassigning srcObject on the same (possibly stuck) HTMLElement.
    async rebuildNativeSurface():Promise<boolean>{
        if(this._surfaceRebuildBusy)return false
        const old=this._element
        const stream=old?.srcObject
        const host=old?.parentElement
        if(!old || !host || !stream ||
          old.getAttribute('data-xbridge-top-video')!=='1' || !old.isConnected)return false
        this._surfaceRebuildBusy=true
        const replacement=old.ownerDocument.createElement('video') as HTMLVideoElement & {__xbridgePresentedFrames?:number}
        replacement.autoplay=true
        replacement.muted=true
        replacement.playsInline=true
        replacement.setAttribute('playsinline','')
        replacement.setAttribute('webkit-playsinline','')
        replacement.setAttribute('data-xbridge-top-video','1')
        replacement.style.cssText=old.style.cssText
        replacement.style.pointerEvents='none'
        replacement.__xbridgePresentedFrames=0
        let switched=false
        try {
            // Detach before attaching: old VIDAA decoders can retain their
            // physical overlay if two elements share a MediaStream at once.
            old.pause()
            old.srcObject=null
            host.replaceChild(replacement,old)
            switched=true
            this._element=replacement
            replacement.srcObject=stream
            this.beginFrameMetadataLoop(replacement)
            replacement.addEventListener('resize',()=>{
                try{
                    if(window.parent!==window && window.parent.location.origin===location.origin){
                        window.parent.postMessage({type:'xbridge-video-size',
                          width:replacement.videoWidth,height:replacement.videoHeight,
                          viewportWidth:window.innerWidth,viewportHeight:window.innerHeight},location.origin)
                    }
                }catch(_){}
            })
            try{
                if(window.parent!==window && window.parent.location.origin===location.origin){
                    window.parent.postMessage({type:'xbridge-video-attached',topLevel:true,rebuilt:true},location.origin)
                }
            }catch(_){}
            let rejected=false
            await Promise.race([
                Promise.resolve(replacement.play()).catch(()=>{rejected=true}),
                new Promise<void>(resolve=>setTimeout(resolve,1900))
            ])
            if(rejected || replacement.paused)throw new Error('vidaa-video-play-blocked')
            return true
        }catch(_){
            // Roll back if VIDAA rejects the new element. Even this fallback
            // retains the original MediaStream and never restarts Xbox.
            try{
                replacement.pause()
                replacement.srcObject=null
                if(switched && replacement.parentElement===host)host.replaceChild(old,replacement)
                if(!old.srcObject)old.srcObject=stream
                this._element=old
                this.beginFrameMetadataLoop(old)
                void old.play().catch(()=>{})
                if(window.parent!==window && window.parent.location.origin===location.origin){
                    window.parent.postMessage({type:'xbridge-video-attached',topLevel:true,rebuilt:false},location.origin)
                }
            }catch(_){}
            return false
        }finally{
            this._surfaceRebuildBusy=false
        }
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
        this._frameLoopGeneration++
        if(this._element){
            this._element.pause()
            this._element.srcObject = null
            this._element.remove()
            this._element = undefined
        }
    }
}