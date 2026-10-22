import Channel from '../../lib/channel'

export default class MessageHandler {
    private _channel:Channel
    private _data:object

    constructor(channel:Channel, data:object) {
        this._channel = channel
        this._data = data

        this.handle(this._data)
    }

    handle(data) {
        console.log('[MessageHandler] Handling:', data)
        switch(data.target){
            case '/streaming/sessionLifetimeManagement/serverInitiatedDisconnect':
                this.completeTransaction(data.id, '')
                this._channel.getPlayer().destroy()
                break
            
            case '/streaming/properties/titleinfo':
                console.log('Title update:', data)
                break
            
            case '/streaming/touchcontrols/showlayoutv2':
                // console.log('Showing touch layout:', data)
                break

            case '/streaming/systemUi/messages/ShowMessageDialog':
                this.handleMessage(data)
                break

            default:
                // Expose only the *kind* of an unhandled Xbox system request,
                // never the full request body, account/session IDs or tokens.
                // Useful when a particular title stalls but WebRTC still works.
                if(typeof data.target === 'string' && data.target.startsWith('/streaming/systemUi/')) {
                    this.notifyXboxEvent('Outro evento de interface Xbox não implementado')
                }
                console.log('[MessageChannel] Unhandled transaction:', data)
        }

    }

    completeTransaction(id, data) {
        const transaction = JSON.stringify({
            'type': 'TransactionComplete',
            'content': JSON.stringify(data),
            // 'content':'{\'Result\':0}',
            'id': id,
            'cv': '',
        })

        this._channel.send(transaction)
    }

    cancelTransaction(id, data) {
        const transaction = JSON.stringify({
            'type': 'ReceiverCancel',
            'content': JSON.stringify(data),
            'id': id,
            'cv': '',
        })

        this._channel.send(transaction)
    }

    notifyXboxEvent(kind:string) {
        try {
            if (window.parent !== window && window.parent.location.origin === window.location.origin) {
                window.parent.postMessage({type:'xbridge-xbox-system-event',kind},window.location.origin)
            }
        } catch (_) {}
    }

    handleMessage(data) {
        let dialog:any
        try {
            dialog=typeof data.content==='string' ? JSON.parse(data.content) : {}
        } catch (_) {
            this.completeTransaction(data.id,{Result:1})
            return
        }
        const title=String(dialog?.TitleText||'Mensagem do Xbox').slice(0,160)
        const body=String(dialog?.ContentText||'').slice(0,1100)
        this.notifyXboxEvent('Xbox solicitou confirmação de sistema')
        // A native confirm in a nested iframe may be suppressed or hidden
        // underneath the fullscreen VIDAA video plane. Surface the request
        // in our top-level TV overlay and wait for an explicit A / B answer.
        try {
            if(window.parent !== window && window.parent.location.origin === window.location.origin){
                const id=String(data.id||'').slice(0,110)
                if(!id){this.completeTransaction(data.id,{Result:1});return}
                let done=false
                let timer:ReturnType<typeof setTimeout>
                const finish=(accepted:boolean)=>{
                    if(done)return
                    done=true
                    clearTimeout(timer)
                    window.removeEventListener('message',onAnswer)
                    this.completeTransaction(data.id,{Result:accepted?0:1})
                }
                const onAnswer=(event:MessageEvent)=>{
                    if(event.source!==window.parent || event.origin!==window.location.origin)return
                    if(event.data?.type==='xbridge-xbox-dialog-response' && event.data?.id===id) {
                        finish(event.data.accepted===true)
                    }
                }
                window.addEventListener('message',onAnswer)
                timer=setTimeout(()=>finish(false),90000)
                window.parent.postMessage({type:'xbridge-xbox-dialog',id,title,body},window.location.origin)
                return
            }
        }catch(_){}
        // Standalone player fallback; no prompt content is persisted or logged.
        const accepted=confirm(title+'\n\n'+body)
        this.completeTransaction(data.id,{Result:accepted?0:1})
    }
}