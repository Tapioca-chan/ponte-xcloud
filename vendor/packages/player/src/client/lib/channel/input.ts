import Channel from './channel'
import InputPacket, { MetadataFrame, ReportTypes, InputFrame as GamepadFrame, MouseFrame, KeyboardFrame, PointerFrame } from './input/packet'
import InputQueue from './input/queue'

import {collectGamepadFrames} from './input/collect.mjs'

export interface VibrationFrame {
    gamepadIndex: number;
    leftMotorPercent: number;
    rightMotorPercent: number;
    leftTriggerMotorPercent: number;
    rightTriggerMotorPercent: number;
    durationMs: number;
    delayMs: number;
    repeat: number;
}

export default class InputChannel extends Channel {
    private _serverVideoWidth = 0
    private _serverVideoHeight = 0

    private _inputQueue = new InputQueue(this.getPlayer())
    private _polling = false
    private _pollTimer:ReturnType<typeof setTimeout>|null = null

    getChannelName() {
        return 'input'
    }

    getChannelConfig() {
        return {
            ordered: true,
            protocol: '1.0',
        }
    }

    getServerVideoWidth(){
        return this._serverVideoWidth
    }

    getServerVideoHeight(){
        return this._serverVideoHeight
    }

    start(){
        if(this._polling) return
        this._polling = true
        const Packet = new InputPacket(0)
        Packet.setMetadata(navigator.maxTouchPoints > 1 ? navigator.maxTouchPoints : 1)
        this.send(Packet.toBuffer())

        console.log('[InputChannel] Sent metadata:', Packet, Packet.toBuffer())

        // Low-power VIDAA browser: 30 Hz controller heartbeat avoids the
        // 60 Hz JS packet churn that can overload its single-core WebView.
        // Other clients retain the original 60 Hz cadence.
        const interval = typeof document !== 'undefined' && document.body.classList.contains('xbridge-embedded') ? 33 : 16
        this._pollTimer = setTimeout(this.gamepadStateLoop.bind(this), interval)
    }

    onMessage(event: MessageEvent<any>) {
        const dataView = new DataView(event.data)
        const reportType = dataView.getUint8(0)

        console.log('[InputChannel] received:', dataView)

        if(reportType === ReportTypes.Vibration){
            console.log('Received a vibration report')
            dataView.getUint8(2) // rumbleType: 0 = FourMotorRumble
            const gamepadIndex = dataView.getUint8(3)

            const gamepad = this.getPlayer()._channels.control.getGamepadHandler(gamepadIndex)

            if(gamepad !== undefined){
                const leftMotorPercent = dataView.getUint8(4) / 100
                const rightMotorPercent = dataView.getUint8(5) / 100
                const leftTriggerMotorPercent = dataView.getUint8(6) / 100
                const rightTriggerMotorPercent = dataView.getUint8(7) / 100
                const durationMs = dataView.getUint16(8, true)
                const delayMs = dataView.getUint16(10, true)
                const repeat = dataView.getUint8(12)

                const rumble:VibrationFrame = {
                    gamepadIndex,
                    leftMotorPercent,
                    rightMotorPercent,
                    leftTriggerMotorPercent,
                    rightTriggerMotorPercent,
                    durationMs,
                    delayMs,
                    repeat,
                }

                gamepad.handleVibration(rumble)
            } else {
                console.log('[InputChannel] Received a vibration report but no gamepad handler is available')
            }

        } else if(reportType === ReportTypes.ServerMetadata){
            console.log('[InputChannel] Received server video dimensions:', dataView.getUint32(2, true), dataView.getUint32(6, true))
            this._serverVideoHeight = dataView.getUint32(2, true)
            this._serverVideoWidth = dataView.getUint32(6, true)
        }

    }

    gamepadStateLoop(){
        if(!this._polling) return
        // The original instanceof Gamepad filter ignored the xBridge virtual
        // handler. Accept any registered frame-provider with a valid index.
        const gamepadHandlers = this.getPlayer()._channels.control.getGamepadHandlers()
        const gamepadFrames:Array<GamepadFrame> = collectGamepadFrames(gamepadHandlers)

        if(gamepadFrames.length > 0){
            this.queueGamepadFrames(gamepadFrames)
        }

        // Low-power VIDAA browser: 30 Hz controller heartbeat avoids the
        // 60 Hz JS packet churn that can overload its single-core WebView.
        // Other clients retain the original 60 Hz cadence.
        const interval = typeof document !== 'undefined' && document.body.classList.contains('xbridge-embedded') ? 33 : 16
        this._pollTimer = setTimeout(this.gamepadStateLoop.bind(this), interval)
    }

    queueMetadataFrame(data:MetadataFrame){
        return this._inputQueue.queueMetadataFrame(data)
    }

    queueGamepadFrames(frames:Array<GamepadFrame>, forceSend = false){
        this._inputQueue.queueGamepadFrames(frames, forceSend)
    }

    queueMouseFrame(data:MouseFrame){
        this._inputQueue.queueMouseFrame(data)
    }

    queueKeyboardFrame(data:KeyboardFrame){
        this._inputQueue.queueKeyboardFrame(data)
    }

    queuePointerFrame(data:PointerFrame){
        this._inputQueue.queuePointerFrame(data)
    }

    destroy() {
        this._polling = false
        if(this._pollTimer !== null) clearTimeout(this._pollTimer)
        this._pollTimer = null
    }
}