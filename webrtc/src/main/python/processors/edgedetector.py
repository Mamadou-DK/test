from av import VideoFrame
from .videoprocessor import VideoProcessor
import cv2 as cv


class EdgeDetector(VideoProcessor):
    async def process(self, frame: VideoFrame) -> tuple[VideoFrame, dict]:
        """
        apply canny edge detection on frame
        """
        # perform edge detection
        img = frame.to_ndarray(format="bgr24")
        img = cv.cvtColor(cv.Canny(img, 100, 200), cv.COLOR_GRAY2BGR)

        # rebuild a VideoFrame, preserving timing information
        new_frame = VideoFrame.from_ndarray(img, format="bgr24")
        new_frame.pts = frame.pts
        new_frame.time_base = frame.time_base
        return new_frame, {"results": []}
