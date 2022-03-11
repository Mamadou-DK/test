import argparse
import asyncio
import json
import logging
import os
import ssl
import uuid

from collections.abc import Mapping
from aiohttp import web
from av import VideoFrame
from av.frame import Frame

from processors.videoprocessor import VideoProcessor
from processors.edgedetector import EdgeDetector
from processors.qrcodedetector import QRCodeDetector
from processors.reddetector import RedDetector

from aiortc import MediaStreamTrack, RTCPeerConnection, RTCSessionDescription, RTCDataChannel
from aiortc.contrib.media import MediaBlackhole, MediaPlayer, MediaRecorder, MediaRelay

ROOT = os.path.dirname(__file__)

LOGGER = logging.getLogger(__name__)
pcs = set()
relay = MediaRelay()

detectors: Mapping[str, VideoProcessor] = {"edges": EdgeDetector(
    "edges (canny)"), "qrcodes": QRCodeDetector("QR & bar codes"), "red": RedDetector("red labels")}

transformedTrack = None
sourceTrack = None
chatChannel = None


class VideoTransformTrack(MediaStreamTrack):
    """
    A video stream track that transforms frames from an another track.
    """

    kind = "video"

    def __init__(self, track, transform, chat) -> None:
        super().__init__()  # don't forget this!
        self.track = track
        self.chat = chat
        self.transform = transform

    def setChat(self, channel) -> None:
        LOGGER.info("Chat channel bound")
        self.chat = channel

        @channel.on("message")
        def on_message(message):
            LOGGER.info("message:" + message)
            if isinstance(message, str) and message.startswith("transform:"):
                self.transform = message.split(":")[1]

    async def recv(self) -> Frame:
        frame = await self.track.recv()
        if self.transform in detectors.keys():
            res: tuple[VideoFrame, dict] = await detectors[self.transform].process(frame)
            for detect in res[1]["results"]:
                if self.chat != None:
                    self.chat.send(detect)
                LOGGER.debug("detected: %s", detect)
            return res[0]
        else:
            return frame

## UI #############


async def producer(request: web.Request) -> web.StreamResponse:
    content = open(os.path.join(ROOT, "ui/producer.html"), "r").read()
    return web.Response(content_type="text/html", text=content)


async def producerjs(request: web.Request) -> web.StreamResponse:
    content = open(os.path.join(ROOT, "ui/producer.js"), "r").read()
    return web.Response(content_type="application/javascript", text=content)


async def stalker(request: web.Request) -> web.StreamResponse:
    content = open(os.path.join(ROOT, "ui/stalker.html"), "r").read()
    return web.Response(content_type="text/html", text=content)


async def stalkerjs(request: web.Request) -> web.StreamResponse:
    content = open(os.path.join(ROOT, "ui/stalker.js"), "r").read()
    return web.Response(content_type="application/javascript", text=content)

## API ############


async def offer(request: web.Request) -> web.StreamResponse:
    """
    handle webRTC offer from remote peer & build an answer
    """
    params = await request.json()
    offer = RTCSessionDescription(sdp=params["sdp"], type=params["type"])
    global chatChannel
    global transformedTrack

    pc = RTCPeerConnection()
    pc_id = "PeerConnection(%s)" % uuid.uuid4()
    pcs.add(pc)

    def log_info(msg, *args) -> None:
        LOGGER.info(pc_id + " " + msg, *args)

    log_info("Created for %s", request.remote)

    # prepare local media
    player = MediaPlayer(os.path.join(ROOT, "demo-instruct.wav"))
    if args.record_to:
        recorder = MediaRecorder(args.record_to)
    else:
        recorder = MediaBlackhole()

    @pc.on("datachannel")
    def on_datachannel(channel: RTCDataChannel) -> None:

        chatChannel = channel
        log_info("Chat channel %s recieved", channel.label)
        if transformedTrack != None:
            transformedTrack.setChat(chatChannel)

        @channel.on("message")
        def on_message(message: any):
            if isinstance(message, str):
                LOGGER.info("incomming message %s", message)

    @pc.on("connectionstatechange")
    async def on_connectionstatechange() -> None:
        log_info("Connection state is %s", pc.connectionState)
        if pc.connectionState == "failed":
            await pc.close()
            pcs.discard(pc)

    @pc.on("track")
    def on_track(track: MediaStreamTrack) -> None:
        # deal with incomming media. should never happen from "stalker" connections
        log_info("Track %s received", track.kind)
        global transformedTrack
        global sourceTrack

        if track.kind == "audio":
            pc.addTrack(player.audio)
            recorder.addTrack(track)
        elif track.kind == "video":
            # transform incomming video ...
            sourceTrack = relay.subscribe(track)
            transformedTrack = VideoTransformTrack(
                relay.subscribe(track), transform=params["video_transform"], chat=chatChannel
            )
            # ... & sent back the transformed video to client
            pc.addTrack(transformedTrack)
            # Associate data channel with incomming videoTrack/transformer
            if chatChannel != None:
                transformedTrack.setChat(chatChannel)
            # record incomming video (no transform)
            if args.record_to:
                recorder.addTrack(relay.subscribe(track))

        @track.on("ended")
        async def on_ended() -> None:
            log_info("Track %s ended", track.kind)
            await recorder.stop()

    # handle offer
    await pc.setRemoteDescription(offer)
    await recorder.start()

    # if request is for "stalker" mode
    if "stalker" in request.query:
        LOGGER.info("add stream for stalker %s", pc_id)
        for t in pc.getTransceivers():
            # if t.kind == "audio" and audio:
            #     pc.addTrack(audio)
            # should happen only from "display" client, because
            log_info("Try to add %s track in response", t.kind)
            if t.kind == "video" and (sourceTrack or transformedTrack):
                log_info("%s track associated", transformedTrack.kind)
                if "native" in params and params["native"] == True:
                    LOGGER.info("answer stream native video")
                    pc.addTrack(sourceTrack)
                else:
                    LOGGER.info("answer stream annotated video")
                    pc.addTrack(transformedTrack)

    # send answer
    answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)

    return web.Response(
        content_type="application/json",
        text=json.dumps(
            {"sdp": pc.localDescription.sdp, "type": pc.localDescription.type}
        ),
    )


async def processorList(request: web.Request) -> web.StreamResponse:
    """
    return process list (key & label)
    """
    res: list[str] = []
    for key, value in detectors.items():
        res.append({"key": key, "label": value.name})
    return web.Response(
        content_type="application/json",
        text=json.dumps(res)
    )
## SERVER #########


async def on_shutdown(app) -> None:
    # close peer connections
    coros = [pc.close() for pc in pcs]
    await asyncio.gather(*coros)
    pcs.clear()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="WebRTC audio / video / data-channels demo"
    )
    parser.add_argument("--cert-file", help="SSL certificate file (for HTTPS)")
    parser.add_argument("--key-file", help="SSL key file (for HTTPS)")
    parser.add_argument(
        "--host", default="0.0.0.0", help="Host for HTTP server (default: 0.0.0.0)"
    )
    parser.add_argument(
        "--port", type=int, default=8080, help="Port for HTTP server (default: 8080)"
    )
    parser.add_argument("--record-to", help="Write received media to a file."),
    parser.add_argument("--verbose", "-v", action="count")
    args = parser.parse_args()

    if args.verbose:
        logging.basicConfig(level=logging.DEBUG)
    else:
        logging.basicConfig(level=logging.INFO)

    if args.cert_file:
        ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ssl_context.load_cert_chain(args.cert_file, args.key_file)
    else:
        ssl_context = None

    FORMAT = '[%(asctime)s] [%(level)-5s] %(message)s'
    logging.basicConfig(format=FORMAT)

    app = web.Application()
    app.on_shutdown.append(on_shutdown)
    app.router.add_get("/", producer)
    app.router.add_get("/stalker", stalker)
    app.router.add_get("/producer.js", producerjs)
    app.router.add_get("/stalker.js", stalkerjs)
    app.router.add_post("/api/offer", offer)
    app.router.add_get("/api/processors", processorList)
    web.run_app(
        app, access_log=None, host=args.host, port=args.port, ssl_context=ssl_context
    )
