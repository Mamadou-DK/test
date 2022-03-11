# WebRTC experiment

The goal of this experiment is to check if/how it is possible to capture & process on a server a [WebRTC](https://webrtc.org/) video (or audio) provided by an embedded device (typcaly: a dron, a mobile phone).

## how ?

* Starting point : [Python WebRTC lib (aiortc)](https://github.com/aiortc/aiortc), specifically the "server" example.
* API [documentation also available](https://aiortc.readthedocs.io/en/latest/index.html)
* [WebRTC docmentation (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
* and inspiration from [webRTC hacks](https://webrtchacks.com/)([github](https://github.com/webrtcHacks))

The current experiment is a simple dokerized implementation of this example.
See Read [example readme](./src/main/python/README.rst)

### Feature

* capture, via browser client webRTC api, a video and / or audio stream.
* stream captured media to a server
* server side video stream transformation/processing
* server  transfomed media streaming (to peers)
* server trasformation controlled from client via webRTC channel
* stream video (from server) to any (browser) connected peers

### Principle

1. The server provide a basic web page (no javascript lib).
1. From the web page, when the start button is cliked
1. the browser will prompt for audio / video access
1. the video/audio stream is sent to server (the magic of webRTC !)
1. the servier process the stream & sent it back to browser
1. the browser (dis)play the stream

then, "stalkers" can connect to `/stalker`. On this page, they can view/play the transformed video, streamed by the server (via a peer connection)

### run experiment

1. Read [docker integration](./doc/DOCKER.md), build & start container
1. connect your browser (local computer, device...) to [http://localhost:8080](http://localhost:8080) or [http://computer-ip:8080](.)
   1. then you can share any audio/video sources acessible to the browser
   1. the server then processes the video stream, & sends it back. Detected object (if any) are posted in the "chat" channel
1. connect another browser (local computer, device...) to [http://localhost:8080/stalker](http://localhost:8080/stalker) or [http://computer-ip:8080/stalker](.)
   1. on tha page, you can connect & watch (view only) the processed video stream

### about Android

#### authorizations

On android, chrome refuse to allow an non https page to access to camera. To workarround, go to [chrome://flags/#unsafely-treat-insecure-origin-as-secure](chrome://flags/#unsafely-treat-insecure-origin-as-secure), input full server url & enable the settings

#### Debug android web app

1. connect (usb) your android device to you computer
1. on computer (not devce) chrom, go to [chrome://inspect/#devices](chrome://inspect/#devices)
1. select (inspect) the page you want to debug

Prerequisite : ADB must be installed (& probalby, the adroid device to be set in debug mode)

## usefull tools

1. [adb](https://developer.android.com/studio/releases/platform-tools.html#downloads)
1. [scrcpy](https://github.com/Genymobile/scrcpy): `scrcpy --always-on-top --disable-screensaver --stay-awake`

## sef signed certificate with "self" CA

Android can be configure to trust un trusted CA.. so we nned to have CA to generate a certificate for the https suppot.

Procedure desicibied [here](https://deliciousbrains.com/ssl-certificate-authority-for-local-https-development/#becoming-certificate-authority)

### CA: private key

 location: `src/main/docker/myCA.key`

```shell
openssl genrsa -des3 -out myCA.key 2048
```

passphrase `myCA`

## CA: root certificate

 location: `src/main/docker/myCA.pem`

```shell
openssl req -x509 -new -nodes -key myCA.key -sha256 -days 1825 -out myCA.pem
```

## Cert: generate site certificate

Use the provided shell script with "domain to generate cert. for" as argument (usualy, `localhost`). It required to (of course) input the CA root key passphrase.

```shell
./genCert.sh domainName
```

All cert. related file are then in `./certs/<domain name>.*` files:

* `domainName.key`: private key for the site/domain (to be used in https config)
* `domainName.csr`: certificate request
* `domainName.ext`: config file for cert generation (useless)
* `domainName.crt`: the signed certificat (to be used in https config)
