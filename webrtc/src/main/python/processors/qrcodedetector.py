from collections.abc import Mapping
from av import VideoFrame
from .videoprocessor import VideoProcessor
import logging
import cv2 as cv
import pyzbar.pyzbar as pyzbar


class QRCodeDetector(VideoProcessor):
    logger: logging.Logger = logging.getLogger(__name__)

    async def process(self, frame: VideoFrame) -> tuple[VideoFrame, dict]:
        """
        detect QR/bar code on frame, draw them. return found QR/bc values
        """
        img = frame.to_ndarray(format="bgr24")
        res = Mapping[str, list[str]]  # {"results", []}
        decodedObjects = pyzbar.decode(img)
        qr: list[str] = []
        for decodedObject in decodedObjects:
            qr.append(str(decodedObject.data))
            # draw bounding box
            #cv.rectangle(img, decodedObject.rect, (0, 255, 0), 3)
            # draw polygone
            points = decodedObject.polygon
            n = len(points)
            for j in range(0, n):
                cv.line(img, points[j], points[(j+1) %
                                               n], (255, 255, 0), 3)
            self.logger.debug("found %s", decodedObject.data)
        new_frame = VideoFrame.from_ndarray(img, format="bgr24")
        new_frame.pts = frame.pts
        new_frame.time_base = frame.time_base
        return new_frame, {"results": qr}
