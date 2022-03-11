# WebRTC experiment: Docker packaging

## Configuration

* from [python:3.10-slim](https://hub.docker.com/_/python?tab=tags&page=1&name=3.10-slim)
* volume
  * no
* ssl conf: auto generated /self signed https cert
* Port
  * api on `8080` (https)
* Environment variables  
  * none

## Build

### build the image locally

The image build generate a signe certifcate for a given hostname.

With the commande line bellow, this hostname is the local machine.

```shell
docker build . -f ./src/main/docker/Dockerfile --build-arg certhost=$(hostname) --tag iortc-server:local
```

To connect to app, got to `https://<hostname>:8080`

### build the image on CI/CD plateform

## Run

### run the image locally

```shell
docker run --rm -it  -p 8080:8080 iortc-server:local
```

### dev mode

```shell
docker run --rm -it  -p 8080:8080  -v "$(pwd)/src/main/python:/app" iortc-server:local
```

or (to start/stop servuer without starting/stopping docker container)

```shell
docker run --rm -it  -p 8080:8080  -v "$(pwd)/src/main/python:/app" --etrypoint "bash" iortc-server:local
python server.py --cert-file=/certs/certs/aiortc.crt --key-file=/certs/certs/aiortc.key
```
