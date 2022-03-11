from collections.abc import Mapping
from av import VideoFrame
from .videoprocessor import VideoProcessor
import logging
import cv2 as cv
import numpy as np


class RedDetector(VideoProcessor):
    logger: logging.Logger = logging.getLogger(__name__)
    _mixer = np.array([
        [-5, -5, -5],  # in blue channel, remove B, G, R components
        [-5, -5, -5],  # in green channel, remove B, G, R components
        # in red channel, remove B & G components, increase red. Why not -5,-5,2? no idea...
        [0,  -2, 2]
    ])

    async def process(self, frame: VideoFrame) -> tuple[VideoFrame, dict]:
        """
        detect QR/bar code on frame, draw them. return found QR/bc values
        """
        # perform edge detection
        img = frame.to_ndarray(format="bgr24")
        cnt: list[str] = []
        nbPix = img.shape[0] * img.shape[1]
        # mix channels
        red = cv.transform(img, self._mixer)
        # keep only (now) red pixels
        _, mask = cv.threshold(red[:, :, 2], 190, 255, cv.THRESH_BINARY)
        cnts = cv.findContours(
            mask, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)
        cnts = cnts[0] if len(cnts) == 2 else cnts[1]
        # filter countours
        for c in cnts:
            peri = cv.arcLength(c, True)
            approx = cv.approxPolyDP(c, 0.1 * peri, True)
            area = cv.contourArea(c)
            x, y, w, h = cv.boundingRect(c)
            ratio = min(w, h)/max(w, h)
            # Filter using contour approximation and area filtering (Remove small noise)
            if len(approx) == 4 and ratio > 0.5 and ratio < 0.75 and area > nbPix*0.01:
                cv.drawContours(img, [c], -1, (0, 255, 0), 5)
                msg = f'FOUND: area: {area}, nb edge:{len(approx)}'
                cnt.append(msg)
                self.logger.info(msg)
            else:
                cv.drawContours(img, [c], -1, (255, 0, 0), 5)
                self.logger.debug(
                    f' area: {area}, nb edge:{len(approx)} does not match {ratio}')

        # rebuild a VideoFrame, preserving timing information
        new_frame = VideoFrame.from_ndarray(img, format="bgr24")
        new_frame.pts = frame.pts
        new_frame.time_base = frame.time_base
        return new_frame, {"results": cnt}
