'use strict';

// get DOM elements
const dataChannelLog = document.querySelector("#data-channel");
const iceConnectionLog = document.querySelector("#ice-connection-state");
const iceGatheringLog = document.querySelector("#ice-gathering-state");
const signalingLog = document.querySelector("#signaling-state");
const offerSdpLog = document.querySelector("#offer-sdp");
const answerSdpLog = document.querySelector("#answer-sdp");

const videoResolutions = document.querySelector("#video-resolution");
const transformers = document.querySelector("select#video-transform");
const video = document.querySelector("video#video");

// usual resolution list
const resolutions = {
    "custom": {
        video: { width: { exact: 800 }, height: { exact: 600 } }
    },
    "QVGA": {
        video: { width: { exact: 320 }, height: { exact: 240 } }
    },
    "360p": {
        video: { width: { exact: 480 }, height: { exact: 360 } }
    },
    "VGA-SD": {
        video: { width: { exact: 640 }, height: { exact: 480 } }
    },
    "SVGA": {
        video: { width: { exact: 800 }, height: { exact: 600 } }
    },
    "XGA": {
        video: { width: { exact: 1024 }, height: { exact: 768 } }
    },
    "HD-720p": {
        video: { width: { exact: 1280 }, height: { exact: 720 } }
    },
    "fullHD-1080p": {
        video: { width: { exact: 1920 }, height: { exact: 1080 } }
    },
    "TV-4K": {
        video: { width: { exact: 3840 }, height: { exact: 2160 } }
    },
    "Cinema-4K": {
        video: { width: { exact: 4096 }, height: { exact: 2160 } }
    },
    "8K": {
        video: { width: { exact: 7680 }, height: { exact: 4320 } }
    }
}

// peer connection
let pc = null;

// data channel
let dc = null, dcInterval = null;
async function listdevices() {
    let devices = { "video": [], "audio": [] };
    if (navigator.mediaDevices) {
        let ml = await navigator.mediaDevices.enumerateDevices();
        ml.reduce((devices, e) => {
            if (e.kind === "videoinput")
                devices.video.push(e);
            if (e.kind === "audioinput") devices.audio.push(e);
            return devices;
        }, devices);
    }
    return devices;
}

function populateDevice() {
    let cams = document.querySelector("#cameras");
    let mics = document.querySelector("#mics");
    listdevices().then(devices => {
        devices.video.forEach(e => {
            let o = document.createElement("option");
            o.setAttribute("value", e.deviceId);
            o.textContent = e.label;
            cams.appendChild(o);
        });
        return devices;
    }).then(devices => {
        devices.audio.forEach(e => {
            let o = document.createElement("option");
            o.setAttribute("value", e.deviceId);
            o.textContent = e.label === "" ? "default" : e.label;
            mics.appendChild(o);
        });
        return devices;
    });
};

function populateResolutions() {
    Object.entries(resolutions).forEach(e => {
        let o = document.createElement("option");
        let label = e[0];
        let constraint = e[1];
        o.setAttribute("value", label);
        o.textContent = `${label} (${constraint.video.width.exact}x${constraint.video.height.exact})`;
        videoResolutions.appendChild(o);
    })
}

function populateTransformer() {
    return fetch('/api/processors', {
        headers: {
            'Content-Type': 'application/json'
        },
        method: 'GET'
    }).then(response => {
        return response.json()
    }).then(list => {
        list.forEach(e => {
            let o = document.createElement("option");
            o.setAttribute("value", e.key);
            o.textContent = e.label;
            transformers.appendChild(o);
        })
    }).catch(error => {
        console.error("fail to get transformer list", error)
    })
}

populateDevice();
populateResolutions();
populateTransformer();

function displayResolution(evt) {
    let msg = `${video.videoWidth}x${video.videoHeight} (${evt.type})`;
    document.querySelector("#video-size").textContent = msg;
    console.log(msg);
}
video.addEventListener('loadedmetadata', displayResolution);
video.addEventListener('resize', displayResolution);


function toggleTheme() {
    html = document.querySelector('html');
    html.setAttribute('data-theme', html.getAttribute("data-theme") === "dark" ? "light" : "dark");
}

function playStop(source) {
    if (source.toggleAttribute("isplaying")) {
        start()
    } else {
        stop();
    }
}

function createPeerConnection() {
    let config = {
        sdpSemantics: 'unified-plan'
    };

    if (document.getElementById('use-stun').checked) {
        config.iceServers = [{ urls: ['stun:stun.l.google.com:19302'] }];
    }

    pc = new RTCPeerConnection(config);

    // register some listeners to help debugging
    pc.addEventListener('icegatheringstatechange', function () {
        iceGatheringLog.textContent += ' -> ' + pc.iceGatheringState;
    }, false);
    iceGatheringLog.textContent = pc.iceGatheringState;

    pc.addEventListener('iceconnectionstatechange', function () {
        iceConnectionLog.textContent += ' -> ' + pc.iceConnectionState;
    }, false);
    iceConnectionLog.textContent = pc.iceConnectionState;

    pc.addEventListener('signalingstatechange', function () {
        signalingLog.textContent += ' -> ' + pc.signalingState;
    }, false);
    signalingLog.textContent = pc.signalingState;

    // connect audio / video
    pc.addEventListener('track', function (evt) {
        if (evt.track.kind == 'video') {
            video.srcObject = evt.streams[0];
        }
        else
            document.getElementById('audio').srcObject = evt.streams[0];
    });

    return pc;
}

function negotiate() {
    return pc.createOffer().then(function (offer) {
        return pc.setLocalDescription(offer);
    }).then(function () {
        // wait for ICE gathering to complete
        return new Promise(function (resolve) {
            if (pc.iceGatheringState === 'complete') {
                resolve();
            } else {
                function checkState() {
                    if (pc.iceGatheringState === 'complete') {
                        pc.removeEventListener('icegatheringstatechange', checkState);
                        resolve();
                    }
                }
                pc.addEventListener('icegatheringstatechange', checkState);
            }
        });
    }).then(function () {
        let offer = pc.localDescription;
        let codec;

        codec = document.getElementById('audio-codec').value;
        if (codec !== 'default') {
            offer.sdp = sdpFilterCodec('audio', codec, offer.sdp);
        }

        codec = document.getElementById('video-codec').value;
        if (codec !== 'default') {
            offer.sdp = sdpFilterCodec('video', codec, offer.sdp);
        }

        offerSdpLog.textContent = offer.sdp;
        return fetch('/api/offer', {
            body: JSON.stringify({
                sdp: offer.sdp,
                type: offer.type,
                video_transform: transformers.value
            }),
            headers: {
                'Content-Type': 'application/json'
            },
            method: 'POST'
        });
    }).then(function (response) {
        return response.json();
    }).then(function (answer) {
        answerSdpLog.textContent = answer.sdp;
        return pc.setRemoteDescription(answer);
    }).catch(function (e) {
        alert(e);
    });
}

function start() {
    [dataChannelLog, iceConnectionLog, iceGatheringLog, signalingLog, offerSdpLog, answerSdpLog].forEach(e => e.textContent = "");
    pc = createPeerConnection();
    if (document.getElementById('use-datachannel').checked) {
        let parameters = JSON.parse(document.getElementById('datachannel-parameters').value);

        dc = pc.createDataChannel('chat', parameters);
        function applyTransform(evt) {
            dc.send("transform:" + evt.target.value);
        }
        dc.onclose = function () {
            clearInterval(dcInterval);
            dataChannelLog.textContent = '- close\n' + dataChannelLog.textContent;
            transformers.removeEventListener("change", applyTransform, false)
        };
        dc.onopen = function () {
            dataChannelLog.textContent += '- open\n';
            // bind eventlister to dynamicaly change video transform
            transformers.addEventListener("change", applyTransform, false)

        };
        dc.onmessage = function (evt) {
            let msg = evt.data;
            dataChannelLog.textContent = '<? ' + evt.data + '\n' + dataChannelLog.textContent;
        };
    }

    let constraints = {
        audio: false,
        video: false
    };
    if (document.getElementById('use-audio').checked) {
        let deviceId = document.getElementById('mics').value;
        if (deviceId !== "") {
            constraints.audio.deviceId = deviceId;
        } else {
            constraints.audio = true;
        }

    }
    if (document.getElementById('use-video').checked) {
        constraints.video = {};
        let resolution = videoResolutions.value;
        if (resolution) {
            constraints.video = resolutions[resolution].video;
        }
        let deviceId = document.getElementById('cameras').value;
        if (deviceId !== "") {
            constraints.video.deviceId = deviceId;
        }
    }

    if (constraints.audio || constraints.video) {
        if (constraints.video) {
            document.getElementById('media').style.display = 'block';
        }
        navigator.mediaDevices.getUserMedia(constraints).then(function (stream) {
            stream.getTracks().forEach(function (track) {
                pc.addTrack(track, stream);
            });
            return negotiate();
        }, function (err) {
            alert('Could not acquire media: ' + err);
        });
    } else {
        negotiate();
    }
}

function stop() {
    document.getElementById('media').style.display = 'none';

    // close data channel
    if (dc) {
        dc.close();
    }

    // close transceivers
    if (pc.getTransceivers) {
        pc.getTransceivers().forEach(function (transceiver) {
            if (transceiver.stop) {
                transceiver.stop();
            }
        });
    }

    // close local audio / video
    pc.getSenders().forEach(function (sender) {
        sender.track.stop();
    });

    // close peer connection
    setTimeout(function () {
        pc.close();
    }, 500);
}

function sdpFilterCodec(kind, codec, realSdp) {
    let allowed = []
    let rtxRegex = new RegExp('a=fmtp:(\\d+) apt=(\\d+)\r$');
    let codecRegex = new RegExp('a=rtpmap:([0-9]+) ' + escapeRegExp(codec))
    let videoRegex = new RegExp('(m=' + kind + ' .*?)( ([0-9]+))*\\s*$')

    let lines = realSdp.split('\n');

    let isKind = false;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('m=' + kind + ' ')) {
            isKind = true;
        } else if (lines[i].startsWith('m=')) {
            isKind = false;
        }

        if (isKind) {
            let match = lines[i].match(codecRegex);
            if (match) {
                allowed.push(parseInt(match[1]));
            }

            match = lines[i].match(rtxRegex);
            if (match && allowed.includes(parseInt(match[2]))) {
                allowed.push(parseInt(match[1]));
            }
        }
    }

    let skipRegex = 'a=(fmtp|rtcp-fb|rtpmap):([0-9]+)';
    let sdp = '';

    isKind = false;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('m=' + kind + ' ')) {
            isKind = true;
        } else if (lines[i].startsWith('m=')) {
            isKind = false;
        }

        if (isKind) {
            let skipMatch = lines[i].match(skipRegex);
            if (skipMatch && !allowed.includes(parseInt(skipMatch[2]))) {
                continue;
            } else if (lines[i].match(videoRegex)) {
                sdp += lines[i].replace(videoRegex, '$1 ' + allowed.join(' ')) + '\n';
            } else {
                sdp += lines[i] + '\n';
            }
        } else {
            sdp += lines[i] + '\n';
        }
    }

    return sdp;
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

