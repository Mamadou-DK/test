'use strict';

// get DOM elements
const dataChannelLog = document.querySelector("#data-channel");
const iceConnectionLog = document.querySelector("#ice-connection-state");
const iceGatheringLog = document.querySelector("#ice-gathering-state");
const signalingLog = document.querySelector("#signaling-state");
const offerSdpLog = document.querySelector("#offer-sdp");
const answerSdpLog = document.querySelector("#answer-sdp");

const videoResolutions = document.querySelector("#video-resolution");
const video = document.querySelector("video#video");
const audio = document.querySelector("audio#audio");

// peer connection
let pc = null;

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
        console.log("new track")
        if (evt.track.kind == 'video') {
            video.srcObject = evt.streams[0];
        }
        else {
            audio.srcObject = evt.streams[0];
        }
    });

    return pc;
}

function negotiate() {

    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.addTransceiver('audio', { direction: 'recvonly' });
    // or ?
    // const offerOptions = {
    //     offerToReceiveAudio: 1,
    //     offerToReceiveVideo: 1
    //   };

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

        offerSdpLog.textContent = offer.sdp;
        return fetch('/api/offer?stalker', {
            body: JSON.stringify({
                sdp: offer.sdp,
                type: offer.type,
                native: document.querySelector("input#media-source").checked
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
    document.getElementById('media').style.display = 'block';
    negotiate();
}

function stop() {
    document.getElementById('media').style.display = 'none';
    // close transceivers
    if (pc.getTransceivers) {
        pc.getTransceivers().forEach(function (transceiver) {
            if (transceiver.stop) {
                transceiver.stop();
            }
        });
    }
    // close peer connection
    setTimeout(function () {
        pc.close();
    }, 500);
}


