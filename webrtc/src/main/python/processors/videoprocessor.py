from av import VideoFrame
import uuid
from abc import ABCMeta, abstractmethod


class VideoProcessor(metaclass=ABCMeta):
    """
    Abstract class for all video processor
    """

    def __init__(self, name: str) -> None:
        super().__init__()
        self._name = name
        self._id = str(uuid.uuid4())

    @property
    def id(self) -> str:
        """
        An automatically generated globally unique ID.
        """
        return self._id

    @property
    def name(self) -> str:
        """
        processor name
        """
        return self._name

    @abstractmethod
    async def process(self, frame: VideoFrame) -> tuple[VideoFrame, dict]:
        """
        process a frame
        """
